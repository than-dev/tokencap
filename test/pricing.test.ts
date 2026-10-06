import assert from 'node:assert';
import { describe, test } from 'node:test';
import { calculateCost } from '../src/utils/pricing';

describe('Pricing calculations', () => {
  test('calculates OpenAI gpt-4o cost correctly', () => {
    const cost = calculateCost('openai', 'gpt-4o', 1000, 1000);
    // 1000 input = 0.0025, 1000 output = 0.01 -> total 0.0125
    assert.strictEqual(cost, 0.0125);
  });

  test('calculates OpenAI gpt-4o-mini cost correctly', () => {
    const cost = calculateCost('openai', 'gpt-4o-mini', 10000, 10000);
    // 10k input = 0.0015, 10k output = 0.006 -> total 0.0075
    assert.strictEqual(cost, 0.0075);
  });

  test('matches variant model names like gpt-4o-2024-08-06', () => {
    const cost = calculateCost('openai', 'gpt-4o-2024-08-06', 1000, 1000);
    assert.strictEqual(cost, 0.0125);
  });

  test('calculates Anthropic claude-3-5-sonnet cost correctly', () => {
    const cost = calculateCost('anthropic', 'claude-3-5-sonnet-20241022', 1000, 1000);
    // 1000 input = 0.003, 1000 output = 0.015 -> total 0.018
    assert.strictEqual(cost, 0.018);
  });

  test('calculates Google gemini-1.5-flash cost correctly', () => {
    const cost = calculateCost('google', 'gemini-1.5-flash', 10000, 10000);
    assert.strictEqual(Number(cost.toFixed(6)), 0.00375);
  });

  test('provides sensible fallback for unlisted model from known provider', () => {
    const cost = calculateCost('openai', 'some-future-unlisted-model', 1000, 1000);
    assert.ok(cost > 0, 'Fallback cost must be greater than zero');
  });

  test('returns 0 for completely unknown provider', () => {
    const cost = calculateCost('unknown_provider', 'model-x', 1000, 1000);
    assert.strictEqual(cost, 0);
  });

  test('calculates Claude 3.7 Sonnet cost correctly', () => {
    const cost = calculateCost('anthropic', 'claude-3-7-sonnet-20250219', 1000, 1000);
    assert.strictEqual(cost, 0.018);
  });

  test('calculates OpenAI o3-mini cost correctly', () => {
    const cost = calculateCost('openai', 'o3-mini', 10000, 1000);
    // 10k input = 0.011, 1k output = 0.0044 -> total 0.0154
    assert.strictEqual(Number(cost.toFixed(6)), 0.0154);
  });

  test('calculates Google gemini-2.0-flash cost correctly', () => {
    const cost = calculateCost('google', 'gemini-2.0-flash', 10000, 10000);
    // 10k input = 0.001, 10k output = 0.004 -> total 0.005
    assert.strictEqual(Number(cost.toFixed(6)), 0.005);
  });

  test('calculates OpenAI prompt caching discount correctly', () => {
    // 1000 prompt tokens total, 500 cached tokens, 1000 output tokens
    const cost = calculateCost('openai', 'gpt-4o', 1000, 1000, 500, 0, false);
    assert.strictEqual(Number(cost.toFixed(6)), 0.011875);
  });

  test('calculates Anthropic prompt caching read and creation correctly', () => {
    // 500 regular input, 4000 cache read, 1000 cache write, 1000 output
    const cost = calculateCost('anthropic', 'claude-3-5-sonnet', 500, 1000, 4000, 1000, true);
    assert.strictEqual(Number(cost.toFixed(6)), 0.02145);
  });
});
