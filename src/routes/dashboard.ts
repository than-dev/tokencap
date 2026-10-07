import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { saveKeyConfig } from '../config';
import { deleteLoopSignaturesForKey as loopDelete } from '../db/loopRepository';
import { deleteUsageForKey } from '../db/usageRepository';
import { getDashboardStats } from '../services/stats';
import { renderDashboardHtml } from '../ui/dashboard';
import { renderLoginHtml } from '../ui/login';
import { createSessionToken, validateCredentials, verifySessionToken } from '../utils/auth';

export const dashboardRouter = new Hono();

dashboardRouter.get('/login', (c) => {
  const sessionToken = getCookie(c, 'tokencap_session');
  if (verifySessionToken(sessionToken)) {
    return c.redirect('/dashboard');
  }
  return c.html(renderLoginHtml());
});

dashboardRouter.post('/api/dashboard/login', async (c) => {
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

dashboardRouter.post('/api/dashboard/logout', (c) => {
  deleteCookie(c, 'tokencap_session', { path: '/' });
  return c.json({ success: true, redirect: '/login' });
});

dashboardRouter.get('/dashboard', (c) => {
  const sessionToken = getCookie(c, 'tokencap_session');
  if (!verifySessionToken(sessionToken)) {
    return c.redirect('/login');
  }
  return c.html(renderDashboardHtml());
});

dashboardRouter.use('/api/dashboard/*', async (c, next) => {
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

dashboardRouter.get('/api/dashboard/stats', (c) => c.json(getDashboardStats()));

dashboardRouter.post('/api/dashboard/keys', async (c) => {
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

dashboardRouter.post('/api/dashboard/reset/:key', (c) => {
  const key = c.req.param('key');
  if (!key) return c.json({ error: 'Missing key parameter' }, 400);
  deleteUsageForKey(key);
  loopDelete(key);
  return c.json({ success: true, key });
});
