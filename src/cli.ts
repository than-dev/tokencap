#!/usr/bin/env node
import 'dotenv/config';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { getConfigPath, getDbPath, loadConfig, resetKeyUsage } from './db/store';

const pkgPath = path.resolve(__dirname, '../package.json');
let pkgVersion = '1.0.0';
try {
  if (fs.existsSync(pkgPath)) {
    pkgVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || '1.0.0';
  }
} catch {
  // Fallback version
}

function printBanner(
  port: number,
  host: string,
  configPath: string,
  dbPath: string,
  keyCount: number,
) {
  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  console.log(`
\x1b[38;2;184;134;75m  🛡️  TokenCap v${pkgVersion}\x1b[0m — AI Agent Budget & Cruise Control Shield
  \x1b[90m─────────────────────────────────────────────────────────────\x1b[0m
  → \x1b[1mProxy Endpoint:\x1b[0m    http://${displayHost}:${port}
  → \x1b[1mConsole Dashboard:\x1b[0m http://${displayHost}:${port}/dashboard
  → \x1b[1mDatabase:\x1b[0m          ${dbPath} \x1b[32m(SQLite WAL)\x1b[0m
  → \x1b[1mConfiguration:\x1b[0m     ${configPath} \x1b[36m(${keyCount} virtual key${keyCount === 1 ? '' : 's'})\x1b[0m
  → \x1b[1mCruise Control:\x1b[0m    Auto-Pacing & Loop Buster \x1b[32mActive\x1b[0m
  \x1b[90m─────────────────────────────────────────────────────────────\x1b[0m
  \x1b[90mPoint your agents to TokenCap:\x1b[0m
  • Claude Code:   \x1b[33mANTHROPIC_BASE_URL=http://${displayHost}:${port}\x1b[0m
  • OpenAI / AGY:  \x1b[33mOPENAI_BASE_URL=http://${displayHost}:${port}/v1\x1b[0m
  • Google Gemini: \x1b[33mGEMINI_BASE_URL=http://${displayHost}:${port}\x1b[0m
`);
}

function openBrowser(url: string) {
  const startCmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${startCmd} ${url}`, () => {});
}

function printHelp() {
  console.log(`
\x1b[1mTokenCap\x1b[0m — Self-hosted safety proxy & cruise control for autonomous AI agents.

\x1b[1mUSAGE:\x1b[0m
  $ tokencap [command] [options]
  $ npx tokencap [options]

\x1b[1mCOMMANDS:\x1b[0m
  start                Start the TokenCap proxy server (default)
  init                 Initialize starter tokencap.json and .env in current directory
  status               Check health of running TokenCap instance
  reset <virtualKey>   Reset spent balance & loop signatures for a specific virtual key

\x1b[1mOPTIONS:\x1b[0m
  -p, --port <number>  Port to listen on (default: 8787 or $PORT)
  -H, --host <string>  Host to bind to (default: 0.0.0.0)
  -c, --config <path>  Path to tokencap.json or tokencap.yaml
  -d, --db <path>      Path to SQLite database file (default: ./tokencap.sqlite)
  -o, --open           Automatically open console dashboard in default browser
  --user <string>      Override dashboard username (default: admin or $TOKENCAP_DASHBOARD_USER)
  --pass <string>      Override dashboard password (default: admin or $TOKENCAP_DASHBOARD_PASSWORD)
  -h, --help           Show this help message
  -v, --version        Print version number

\x1b[1mEXAMPLES:\x1b[0m
  $ tokencap
  $ tokencap --port 9000 --open
  $ tokencap --config ./custom-budget.json --db ./data/vault.sqlite
  $ tokencap init
  $ tokencap reset dev_key_01
`);
}

async function handleInit() {
  const targetConfig = path.join(process.cwd(), 'tokencap.json');
  const targetEnv = path.join(process.cwd(), '.env');

  let createdAny = false;

  if (!fs.existsSync(targetConfig)) {
    const exampleConfig = {
      port: 8787,
      keys: {
        dev_openai_key: {
          provider: 'openai',
          realKey: '${OPENAI_API_KEY}',
          hardCapDaily: 5.0,
          hardCapMonthly: 50.0,
          rollingWindowCap: 0.5,
          rollingWindowSeconds: 3600,
          autoPacing: {
            enabled: true,
            maxHoldSeconds: 30,
          },
        },
        dev_claude_key: {
          provider: 'anthropic',
          realKey: '${ANTHROPIC_API_KEY}',
          hardCapDaily: 10.0,
          hardCapMonthly: 100.0,
          rollingWindowCap: 1.0,
          rollingWindowSeconds: 3600,
          autoPacing: {
            enabled: true,
            maxHoldSeconds: 30,
          },
        },
      },
    };
    fs.writeFileSync(targetConfig, JSON.stringify(exampleConfig, null, 2), 'utf8');
    console.log(`\x1b[32m✔ Created starter configuration:\x1b[0m ${targetConfig}`);
    createdAny = true;
  } else {
    console.log(`\x1b[33mℹ Existing configuration found at:\x1b[0m ${targetConfig}`);
  }

  if (!fs.existsSync(targetEnv)) {
    const envContent = `# TokenCap Environment
PORT=8787
TOKENCAP_DASHBOARD_USER=admin
TOKENCAP_DASHBOARD_PASSWORD=admin
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
`;
    fs.writeFileSync(targetEnv, envContent, 'utf8');
    console.log(`\x1b[32m✔ Created starter environment:\x1b[0m ${targetEnv}`);
    createdAny = true;
  } else {
    console.log(`\x1b[33mℹ Existing .env found at:\x1b[0m ${targetEnv}`);
  }

  if (createdAny) {
    console.log(`
🎉 Initialized successfully! Next steps:
  1. Add your real upstream keys to .env or tokencap.json
  2. Start the proxy with: \x1b[1mtokencap --open\x1b[0m
`);
  }
}

async function handleStatus(port: number) {
  const url = `http://localhost:${port}/health`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as any;
      console.log(`\x1b[32m✔ TokenCap is running and healthy on port ${port}!\x1b[0m`);
      console.log(`  Service:   ${data.service || 'tokencap'}`);
      console.log(`  Dashboard: http://localhost:${port}/dashboard`);
    } else {
      console.log(`\x1b[31m✖ TokenCap responded with status ${res.status}\x1b[0m`);
    }
  } catch {
    console.log(`\x1b[33mℹ No active TokenCap server detected on http://localhost:${port}\x1b[0m`);
    console.log(`  Run \x1b[1mtokencap\x1b[0m to start the proxy.`);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: 'string', short: 'p' },
      host: { type: 'string', short: 'H' },
      config: { type: 'string', short: 'c' },
      db: { type: 'string', short: 'd' },
      open: { type: 'boolean', short: 'o' },
      user: { type: 'string' },
      pass: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      init: { type: 'boolean', short: 'i' },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help) {
    printHelp();
    return;
  }

  if (values.version) {
    console.log(`tokencap v${pkgVersion}`);
    return;
  }

  const command = positionals[0] || 'start';

  if (command === 'init' || values.init) {
    await handleInit();
    return;
  }

  if (command === 'status') {
    const checkPort = Number(values.port) || Number(process.env.PORT) || 8787;
    await handleStatus(checkPort);
    return;
  }

  if (command === 'reset') {
    const virtualKey = positionals[1];
    if (!virtualKey) {
      console.error(
        '\x1b[31mError: Please specify the virtual key to reset: tokencap reset <virtualKey>\x1b[0m',
      );
      process.exit(1);
    }
    resetKeyUsage(virtualKey);
    console.log(`\x1b[32m✔ Purged usage records and loop signatures for:\x1b[0m ${virtualKey}`);
    return;
  }

  // Configure environment overrides from flags before booting server
  if (values.config) {
    process.env.TOKENCAP_CONFIG_PATH = String(values.config);
  }
  if (values.db) {
    process.env.TOKENCAP_DB_PATH = String(values.db);
  }
  if (values.user) {
    process.env.TOKENCAP_DASHBOARD_USER = String(values.user);
  }
  if (values.pass) {
    process.env.TOKENCAP_DASHBOARD_PASSWORD = String(values.pass);
  }

  const globalConfig = loadConfig();
  const port = Number(values.port) || Number(process.env.PORT) || globalConfig.port || 8787;
  const host = values.host ? String(values.host) : '0.0.0.0';

  const app = createApp();

  const configPath = getConfigPath();
  const dbPath = getDbPath();
  const keyCount = Object.keys(globalConfig.keys || {}).length;

  printBanner(port, host, configPath, dbPath, keyCount);

  const server = serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  if (values.open) {
    const openUrl = `http://localhost:${port}/dashboard`;
    setTimeout(() => openBrowser(openUrl), 400);
  }

  const shutdown = () => {
    console.log('\n\x1b[33m🛑 Shutting down TokenCap gracefully...\x1b[0m');
    server.close(() => {
      console.log('TokenCap server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('\x1b[31mFatal error starting TokenCap:\x1b[0m', err);
  process.exit(1);
});
