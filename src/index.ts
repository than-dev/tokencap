import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './db/store';

const globalConfig = loadConfig();
const port = Number(process.env.PORT) || globalConfig.port || 8787;

const app = createApp();

console.log(`\n🛡️ TokenCap is running on http://localhost:${port}`);
console.log('Edit tokencap.json to manage keys and budgets.\n');

const server = serve({
  fetch: app.fetch,
  port,
});

const shutdown = () => {
  console.log('\n🛑 Shutting down TokenCap gracefully...');
  server.close(() => {
    console.log('TokenCap server closed.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
