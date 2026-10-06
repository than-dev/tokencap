import assert from 'node:assert';
import { describe, test } from 'node:test';
import { checkBudget, updateUsage } from '../src/db/store';
import type { TokenCapConfig } from '../src/types';

describe('Budget enforcer', () => {
  const testKey = `test_budget_key_${Date.now()}`;

  const config: TokenCapConfig = {
    provider: 'openai',
    realKey: 'sk-mock-key',
    hardCapDaily: 0.05,
    hardCapMonthly: 1.0,
    rollingWindowCap: 0.02,
    rollingWindowSeconds: 60,
  };

  test('allows requests within budget initially', () => {
    const result = checkBudget(testKey, config);
    assert.strictEqual(result.allowed, true);
  });

  test('blocks requests when rolling window cap is exceeded', () => {
    // Record usage equal to 0.025 (exceeding 0.02)
    updateUsage(testKey, config, 0.025);

    const result = checkBudget(testKey, config);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'TokenCap Budget Exceeded: Rolling Window');
    assert.ok(typeof result.retryAfterSeconds === 'number' && result.retryAfterSeconds > 0);
    assert.ok(typeof result.resetsAt === 'string');
    assert.ok(result.retryAfterSeconds <= 60);
  });

  test('blocks requests when daily hard cap is exceeded', () => {
    const dailyKey = `daily_test_key_${Date.now()}`;
    const dailyConfig: TokenCapConfig = {
      provider: 'openai',
      realKey: 'sk-mock-key',
      hardCapDaily: 0.01,
      hardCapMonthly: 1.0,
      rollingWindowCap: 0, // Disable rolling window
      rollingWindowSeconds: 0,
    };

    updateUsage(dailyKey, dailyConfig, 0.015);

    const result = checkBudget(dailyKey, dailyConfig);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'TokenCap Budget Exceeded: Daily');
    assert.ok(typeof result.retryAfterSeconds === 'number' && result.retryAfterSeconds > 0);
    assert.ok(typeof result.resetsAt === 'string');
  });
});
