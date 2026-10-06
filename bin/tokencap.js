#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const distCli = path.join(__dirname, '../dist/cli.js');
if (fs.existsSync(distCli)) {
  require(distCli);
} else {
  try {
    require('tsx/cjs');
    require('../src/cli.ts');
  } catch {
    console.error('TokenCap: Please run "npm run build" before running the CLI.');
    process.exit(1);
  }
}
