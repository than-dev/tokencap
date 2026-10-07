import { Hono } from 'hono';
import { getConfig } from '../config';
import { handleAnthropic } from '../proxy/anthropic';
import { handleGoogle } from '../proxy/google';
import { handleOpenAI } from '../proxy/openai';
import { checkBudget } from '../services/budget';
import { trackInFlightEnd, trackInFlightStart } from '../services/inFlight';
import { scheduleRefillNotification } from '../services/notifications';
import type { Env, TokenCapConfig } from '../types';

export const proxyRouter = new Hono<Env>();

proxyRouter.use('*', async (c, next) => {
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
    const maxHold = config.autoPacing?.enabled ? (config.autoPacing?.maxHoldSeconds ?? 30) : 0;
    const retryAfter = budgetCheck.retryAfterSeconds ?? 0;

    if (maxHold > 0 && retryAfter > 0 && retryAfter <= maxHold) {
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      budgetCheck = checkBudget(virtualKey, config);
    }
  }

  if (!budgetCheck.allowed) {
    console.log(
      'Blocking request:',
      budgetCheck.reason,
      `Retry-After: ${budgetCheck.retryAfterSeconds}s`,
    );

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

proxyRouter.all('/v1/*', async (c) => {
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

proxyRouter.all('/v1beta/*', async (c) => {
  const path = c.req.path;
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
