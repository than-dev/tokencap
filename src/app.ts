import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import {
  checkBudget,
  getConfig,
  getDashboardStats,
  resetKeyUsage,
  saveKeyConfig,
  scheduleRefillNotification,
  trackInFlightEnd,
  trackInFlightStart,
} from './db/store';
import { handleAnthropic } from './proxy/anthropic';
import { handleGoogle } from './proxy/google';
import { handleOpenAI } from './proxy/openai';
import type { Env, TokenCapConfig } from './types';
import { renderDashboardHtml } from './ui/dashboard';
import { renderLoginHtml } from './ui/login';
import { createSessionToken, validateCredentials, verifySessionToken } from './utils/auth';

export function createApp() {
  const app = new Hono<Env>();

  // Global payload size limit to prevent OOM
  app.use(
    '*',
    bodyLimit({
      maxSize: 20 * 1024 * 1024, // 20MB limit
      onError: (c) => c.json({ error: 'Payload Too Large: request body exceeds 20MB' }, 413),
    }),
  );

  // Restrict CORS to localhost/127.0.0.1 or non-browser CLI agents
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return origin || '*';
        }
        return null;
      },
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-goog-api-key'],
      maxAge: 86400,
    }),
  );

  // Public health check and info endpoints (no auth required)
  app.get('/health', (c) => c.json({ status: 'ok', service: 'tokencap', timestamp: Date.now() }));
  app.get('/', (c) => {
    if (c.req.header('accept')?.includes('text/html')) {
      return c.redirect('/dashboard');
    }
    return c.json({
      status: 'ok',
      message:
        'TokenCap Proxy is running. Open /dashboard in your browser for console or /health for monitoring.',
    });
  });

  // Authentication UI & Session Endpoints
  app.get('/login', (c) => {
    const sessionToken = getCookie(c, 'tokencap_session');
    if (verifySessionToken(sessionToken)) {
      return c.redirect('/dashboard');
    }
    return c.html(renderLoginHtml());
  });

  app.post('/api/dashboard/login', async (c) => {
    try {
      const body = (await c.req.json()) as { username?: string; password?: string };
      const username = body.username?.trim() || '';
      const password = body.password || '';

      if (!validateCredentials(username, password)) {
        return c.json({ error: 'Invalid username or password' }, 401);
      }

      const token = createSessionToken(username);
      setCookie(c, 'tokencap_session', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        maxAge: 24 * 60 * 60,
      });

      return c.json({ success: true, redirect: '/dashboard' });
    } catch {
      return c.json({ error: 'Invalid request body' }, 400);
    }
  });

  app.post('/api/dashboard/logout', (c) => {
    deleteCookie(c, 'tokencap_session', { path: '/' });
    return c.json({ success: true, redirect: '/login' });
  });

  // Local Dashboard UI (Protected)
  app.get('/dashboard', (c) => {
    const sessionToken = getCookie(c, 'tokencap_session');
    if (!verifySessionToken(sessionToken)) {
      return c.redirect('/login');
    }
    return c.html(renderDashboardHtml());
  });

  // Dashboard API Guard (Requires active session)
  app.use('/api/dashboard/*', async (c, next) => {
    if (c.req.path === '/api/dashboard/login') {
      return next();
    }
    const sessionToken =
      getCookie(c, 'tokencap_session') ||
      (c.req.header('Authorization')?.startsWith('Bearer ')
        ? c.req.header('Authorization')?.slice(7)
        : undefined);

    if (!verifySessionToken(sessionToken)) {
      return c.json({ error: 'Unauthorized: Dashboard login required' }, 401);
    }
    return next();
  });

  // Dashboard API Handlers
  app.get('/api/dashboard/stats', (c) => c.json(getDashboardStats()));
  app.post('/api/dashboard/keys', async (c) => {
    try {
      const body = (await c.req.json()) as {
        virtualKey?: string;
        provider?: 'openai' | 'anthropic' | 'google';
        realKey?: string;
        hardCapDaily?: number;
        hardCapMonthly?: number;
        rollingWindowCap?: number;
        rollingWindowSeconds?: number;
        autoPacing?: { enabled: boolean; maxHoldSeconds?: number };
      };
      if (!body.virtualKey || !body.provider || !body.realKey) {
        return c.json({ error: 'Missing required key configuration fields' }, 400);
      }
      saveKeyConfig(body.virtualKey, {
        provider: body.provider,
        realKey: body.realKey,
        hardCapDaily: Number(body.hardCapDaily) || 0,
        hardCapMonthly: Number(body.hardCapMonthly) || 0,
        rollingWindowCap: Number(body.rollingWindowCap) || 0,
        rollingWindowSeconds: Number(body.rollingWindowSeconds) || 3600,
        autoPacing: body.autoPacing || { enabled: true, maxHoldSeconds: 30 },
      });
      return c.json({ success: true, virtualKey: body.virtualKey });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save key';
      return c.json({ error: message }, 500);
    }
  });
  app.post('/api/dashboard/reset/:key', (c) => {
    const key = c.req.param('key');
    if (!key) return c.json({ error: 'Missing key parameter' }, 400);
    resetKeyUsage(key);
    return c.json({ success: true, key });
  });

  app.get('/llms.txt', (c) => {
    const candidates = [
      path.resolve(process.cwd(), 'llms.txt'),
      path.resolve(__dirname, '../llms.txt'),
      path.resolve(__dirname, 'llms.txt'),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        return c.text(fs.readFileSync(file, 'utf-8'), 200, {
          'Content-Type': 'text/plain; charset=utf-8',
        });
      }
    }
    return c.text('# TokenCap\nSafety proxy for autonomous AI agents.\n', 200, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
  });

  app.use('*', async (c, next) => {
    // Skip auth for public endpoints, login, and dashboard
    if (
      c.req.path === '/health' ||
      c.req.path === '/' ||
      c.req.path === '/llms.txt' ||
      c.req.path === '/login' ||
      c.req.path === '/dashboard' ||
      c.req.path.startsWith('/api/dashboard')
    ) {
      return next();
    }

    let virtualKey =
      c.req.header('x-api-key') || c.req.header('x-goog-api-key') || c.req.query('key');
    if (!virtualKey) {
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        virtualKey = authHeader.substring(7);
      }
    }

    if (!virtualKey) {
      return c.json({ error: 'Missing Authentication' }, 401);
    }

    const config = getConfig(virtualKey);
    if (!config) {
      return c.json({ error: 'Invalid Virtual Key' }, 401);
    }

    let budgetCheck = checkBudget(virtualKey, config);
    if (!budgetCheck.allowed) {
      // 1. Transparent Micro-Pacing / Cruise Control Hold
      const maxHold = config.autoPacing?.enabled ? (config.autoPacing?.maxHoldSeconds ?? 30) : 0;
      const retryAfter = budgetCheck.retryAfterSeconds ?? 0;

      if (maxHold > 0 && retryAfter > 0 && retryAfter <= maxHold) {
        // Sleep asynchronously without terminating connection or returning 429
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        // Re-verify budget after the hold
        budgetCheck = checkBudget(virtualKey, config);
      }
    }

    if (!budgetCheck.allowed) {
      console.log(
        'Blocking request:',
        budgetCheck.reason,
        `Retry-After: ${budgetCheck.retryAfterSeconds}s`,
      );

      // Schedule background webhook alert for when the window reopens (if alerts configured)
      if (config.alertsEnabled && config.webhookUrl && budgetCheck.retryAfterSeconds) {
        scheduleRefillNotification(virtualKey, config, budgetCheck.retryAfterSeconds);
      }

      if (budgetCheck.retryAfterSeconds) {
        c.header('Retry-After', budgetCheck.retryAfterSeconds.toString());
      }

      return c.json(
        {
          error: budgetCheck.reason,
          retryAfterSeconds: budgetCheck.retryAfterSeconds,
          resetsAt: budgetCheck.resetsAt,
        },
        429,
      );
    }

    c.set('config', config);
    c.set('virtualKey', virtualKey);

    trackInFlightStart(virtualKey);
    try {
      await next();
    } finally {
      trackInFlightEnd(virtualKey);
    }
  });

  app.all('/v1/*', async (c) => {
    const config = c.get('config') as TokenCapConfig;
    const virtualKey = c.get('virtualKey') as string;
    if (config.provider === 'openai') {
      return handleOpenAI(c.req.raw, config, virtualKey);
    }
    if (config.provider === 'anthropic') {
      return handleAnthropic(c.req.raw, config, virtualKey);
    }
    return c.json({ error: 'Provider mismatch' }, 400);
  });

  app.all('/v1beta/*', async (c) => {
    const path = c.req.path;
    // Whitelist only generation endpoints (:generateContent or :streamGenerateContent) for POST
    if (
      c.req.method !== 'GET' &&
      !path.includes(':generateContent') &&
      !path.includes(':streamGenerateContent')
    ) {
      return c.json(
        {
          error:
            'Unsupported Google API endpoint. TokenCap only proxies generateContent and streamGenerateContent.',
        },
        403,
      );
    }
    const config = c.get('config') as TokenCapConfig;
    const virtualKey = c.get('virtualKey') as string;
    if (config.provider === 'google') {
      return handleGoogle(c.req.raw, config, virtualKey);
    }
    return c.json({ error: 'Provider mismatch' }, 400);
  });

  app.onError((err, c) => {
    console.error('Unhandled TokenCap server error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  });

  return app;
}
