import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

describe('TokenCap CLI Tooling', () => {
  const binPath = path.resolve(__dirname, '../bin/tokencap.js');

  test('CLI --help outputs usage, commands and options', () => {
    const output = execSync(`node "${binPath}" --help`, { encoding: 'utf8' });
    assert.match(output, /TokenCap/);
    assert.match(output, /USAGE:/);
    assert.match(output, /--port/);
    assert.match(output, /--open/);
    assert.match(output, /--config/);
  });

  test('CLI --version outputs version', () => {
    const output = execSync(`node "${binPath}" --version`, { encoding: 'utf8' });
    assert.match(output, /tokencap v\d+\.\d+\.\d+/);
  });

  test('CLI status reports inactive when server is not running', () => {
    const output = execSync(`node "${binPath}" status --port 59999`, { encoding: 'utf8' });
    assert.match(output, /No active TokenCap server detected/);
  });

  test('CLI init creates tokencap.json and .env in target directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokencap-init-test-'));
    try {
      const output = execSync(`node "${binPath}" init`, {
        cwd: tempDir,
        encoding: 'utf8',
      });
      assert.match(output, /Created starter configuration/);
      assert.match(output, /Created starter environment/);
      assert.ok(fs.existsSync(path.join(tempDir, 'tokencap.json')));
      assert.ok(fs.existsSync(path.join(tempDir, '.env')));

      const config = JSON.parse(fs.readFileSync(path.join(tempDir, 'tokencap.json'), 'utf8'));
      assert.ok(config.keys.dev_openai_key);
      assert.ok(config.keys.dev_claude_key);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
