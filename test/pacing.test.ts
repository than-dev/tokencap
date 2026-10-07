import assert from 'node:assert';
import { describe, test } from 'node:test';
import { createApp } from '../src/app';
import { saveKeyConfig } from '../src/config';
import { updateUsage } from '../src/services/budget';

import type { TokenCapConfig } from '../src/types';

describe('Cruise Control & Auto-Pacing HTTP', () => {
  const app = createApp();

  test('returns 429 with Retry-After header and resetsAt payload', async () => {
    const key = 'agy_test_key';
    const config: TokenCapConfig = {
      provider: 'openai',
      realKey: 'sk-mock',
      hardCapDaily: 10,
      hardCapMonthly: 100,
      rollingWindowCap: 0.01,
      rollingWindowSeconds: 30,
    };

    saveKeyConfig(key, config);
    // Exceed rolling window limit
    updateUsage(key, config, 0.05);

    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ messages: [] }),
    });

    assert.strictEqual(res.status, 429);
    const retryHeader = res.headers.get('Retry-After');
    assert.ok(retryHeader, 'Retry-After header must be present');
    assert.ok(Number(retryHeader) > 0);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const body = (await res.json()) as any;
    assert.ok(body.error.startsWith('TokenCap Budget Exceeded:'));
    assert.strictEqual(body.retryAfterSeconds, Number(retryHeader));
    assert.ok(typeof body.resetsAt === 'string');
  });

  test('accurately calculates rolling window expiry when multiple records exist', () => {
    const key = `multi_record_key_${Date.now()}`;
    const config: TokenCapConfig = {
      provider: 'openai',
      realKey: 'sk-mock',
      hardCapDaily: 10,
      hardCapMonthly: 100,
      rollingWindowCap: 1.0,
      rollingWindowSeconds: 10,
    };

    updateUsage(key, config, 0.6);
    updateUsage(key, config, 0.5);

    const { checkBudget } = require('../src/services/budget');
    const result = checkBudget(key, config);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'TokenCap Budget Exceeded: Rolling Window');
    assert.ok(result.retryAfterSeconds <= 10 && result.retryAfterSeconds > 0);
    assert.ok(typeof result.resetsAt === 'string');
  });
});
