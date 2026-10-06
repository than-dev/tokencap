import assert from 'node:assert';
import path from 'node:path';
import { describe, test } from 'node:test';
import Database from 'better-sqlite3';
import { createApp } from '../src/app';
import {
  checkBudget,
  getConfig,
  getInFlightCount,
  trackInFlightEnd,
  trackInFlightStart,
  updateUsage,
} from '../src/db/store';
import type { TokenCapConfig } from '../src/types';
import { sendAlert } from '../src/utils/webhook';

describe('Security Controls & Persistence', () => {
  const app = createApp();

  test('SEC-01: Blocks prototype property lookup attempts as invalid keys', async () => {
    const maliciousKeys = ['toString', 'constructor', '__proto__', 'valueOf', 'isPrototypeOf'];

    for (const key of maliciousKeys) {
      const config = getConfig(key);
      assert.strictEqual(config, null, `Prototype key "${key}" must evaluate to null`);

      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ messages: [] }),
      });

      assert.strictEqual(res.status, 401, `Prototype key "${key}" must return 401 Unauthorized`);
      const body = (await res.json()) as any;
      assert.strictEqual(body.error, 'Invalid Virtual Key');
    }
  });

  test('SEC-02: Isolates budgets between different virtual keys', () => {
    const keyAlpha = `virtual_key_alpha_${Date.now()}`;
    const keyBeta = `virtual_key_beta_${Date.now()}`;

    const configAlpha: TokenCapConfig = {
      provider: 'openai',
      realKey: 'sk-mock-alpha',
      hardCapDaily: 0.1,
      hardCapMonthly: 1.0,
      rollingWindowCap: 0.05,
      rollingWindowSeconds: 3600,
    };

    const configBeta: TokenCapConfig = {
      provider: 'openai',
      realKey: 'sk-mock-beta',
      hardCapDaily: 5.0,
      hardCapMonthly: 50.0,
      rollingWindowCap: 1.0,
      rollingWindowSeconds: 3600,
    };

    // Alpha spends $0.06 (exceeding rolling cap of 0.05)
    updateUsage(keyAlpha, configAlpha, 0.06);

    // Alpha must be blocked
    const checkAlpha = checkBudget(keyAlpha, configAlpha);
    assert.strictEqual(checkAlpha.allowed, false, 'Alpha must be blocked after exceeding its cap');

    // Beta must remain completely unaffected with zero spend
    const checkBeta = checkBudget(keyBeta, configBeta);
    assert.strictEqual(checkBeta.allowed, true, 'Beta budget must remain untouched');
  });

  test('SEC-03: Session persistence & crash resilience across process restarts', () => {
    const persistenceKey = `agent_session_persistence_${Date.now()}`;
    const config: TokenCapConfig = {
      provider: 'anthropic',
      realKey: 'sk-mock-ant',
      hardCapDaily: 0.2,
      hardCapMonthly: 2.0,
      rollingWindowCap: 0.1,
      rollingWindowSeconds: 3600,
    };

    // Agent spends $0.15 during session
    updateUsage(persistenceKey, config, 0.15);

    // Simulate process crash: open a fresh, independent SQLite connection to the physical file
    const dbPath = path.join(process.cwd(), 'tokencap.sqlite');
    const freshDb = new Database(dbPath);

    // Verify WAL mode is active for ACID safety
    const pragma = freshDb.pragma('journal_mode') as { journal_mode: string }[];
    assert.strictEqual(pragma[0].journal_mode, 'wal', 'Database must operate in WAL mode');

    // Verify raw record survived to disk
    const row = freshDb
      .prepare('SELECT SUM(cost) as total FROM usage WHERE virtualKey = ?')
      .get(persistenceKey) as { total: number };
    assert.ok(Math.abs(row.total - 0.15) < 0.0001, 'Recorded spend must survive intact on disk');
    freshDb.close();

    // Verify checkBudget still blocks based on recovered ledger
    const check = checkBudget(persistenceKey, config);
    assert.strictEqual(check.allowed, false, 'Budget must remain enforced after restart');
  });

  test('SEC-04: Protects against Drive-By browser requests via restricted CORS', async () => {
    const res = await app.request('/health', {
      method: 'GET',
      headers: {
        Origin: 'https://malicious-web-tracker.example.com',
      },
    });

    const allowOrigin = res.headers.get('Access-Control-Allow-Origin');
    assert.strictEqual(
      allowOrigin,
      null,
      'Malicious external web origin must NOT receive Access-Control-Allow-Origin',
    );

    // Local developer environment origin is allowed
    const localRes = await app.request('/health', {
      method: 'GET',
      headers: {
        Origin: 'http://localhost:3000',
      },
    });
    assert.strictEqual(
      localRes.headers.get('Access-Control-Allow-Origin'),
      'http://localhost:3000',
    );
  });

  test('SEC-05: Accurately tracks in-flight request concurrency', () => {
    const testKey = `in_flight_test_${Date.now()}`;
    assert.strictEqual(getInFlightCount(testKey), 0);

    trackInFlightStart(testKey);
    assert.strictEqual(getInFlightCount(testKey), 1);

    trackInFlightStart(testKey);
    assert.strictEqual(getInFlightCount(testKey), 2);

    trackInFlightEnd(testKey);
    assert.strictEqual(getInFlightCount(testKey), 1);

    trackInFlightEnd(testKey);
    assert.strictEqual(getInFlightCount(testKey), 0);
  });

  test('SEC-06: Blocks SSRF against cloud metadata or non-HTTPS webhooks', async () => {
    let loggedWarning = false;
    const origError = console.error;
    console.error = (...args: any[]) => {
      if (args[0]?.includes('Blocked insecure webhook URL protocol')) {
        loggedWarning = true;
      }
      origError(...args);
    };

    try {
      // Insecure HTTP to remote IP must be rejected
      await sendAlert('http://169.254.169.254/latest/meta-data', 'test alert');
      assert.strictEqual(loggedWarning, true, 'Insecure non-localhost HTTP URL must be blocked');
    } finally {
      console.error = origError;
    }
  });
});
