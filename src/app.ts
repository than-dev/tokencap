import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';

import { dashboardRouter } from './routes/dashboard';
import { proxyRouter } from './routes/proxy';

export function createApp() {
  const app = new Hono();

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

  // Mount routers
  app.route('/', dashboardRouter);
  app.route('/', proxyRouter);

  app.onError((err, c) => {
    console.error('Unhandled TokenCap server error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  });

  return app;
}
