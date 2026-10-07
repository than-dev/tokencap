import assert from 'node:assert';
import { describe, test } from 'node:test';
import { checkAndRecordLoop } from '../src/services/loopBuster';
import type { TokenCapConfig } from '../src/types';
import { extractSignature, handleLoopBuster } from '../src/utils/loopDetector';

describe('Loop Buster (Infinite Loop Detection)', () => {
  const dummyConfig: TokenCapConfig = {
    provider: 'openai',
    realKey: 'sk-mock',
    hardCapDaily: 10,
    hardCapMonthly: 100,
    rollingWindowCap: 2,
    rollingWindowSeconds: 3600,
    loopBuster: {
      enabled: true,
      maxRepeats: 3,
      windowSeconds: 60,
    },
  };

  test('generates deterministic signatures for identical conversation tails', () => {
    const body1 = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an agent' },
        { role: 'user', content: 'run tests' },
        {
          role: 'assistant',
          content: 'running...',
          tool_calls: [{ function: { name: 'bash', arguments: 'npm test' } }],
        },
        { role: 'tool', content: 'Error: Cannot find module foo' },
      ],
    };

    const body2 = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an agent' },
        { role: 'user', content: 'run tests' },
        {
          role: 'assistant',
          content: 'running...',
          tool_calls: [{ function: { name: 'bash', arguments: 'npm test' } }],
        },
        { role: 'tool', content: 'Error: Cannot find module foo' },
      ],
    };

    const sig1 = extractSignature('openai', body1);
    const sig2 = extractSignature('openai', body2);

    assert.ok(sig1, 'Signature 1 must not be null');
    assert.strictEqual(
      sig1,
      sig2,
      'Identical conversation tails must produce identical signatures',
    );
  });

  test('differentiates signatures when agent makes progress', () => {
    const bodyFail = {
      messages: [
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'bash', arguments: 'npm test' } }],
        },
        { role: 'tool', content: 'Error: Test failed' },
      ],
    };

    const bodyProgress = {
      messages: [
        { role: 'assistant', content: 'I will fix the bug' },
        { role: 'tool', content: 'File edited successfully' },
      ],
    };

    const sigFail = extractSignature('openai', bodyFail);
    const sigProgress = extractSignature('openai', bodyProgress);

    assert.notStrictEqual(sigFail, sigProgress);
  });

  test('trips circuit breaker after maxRepeats identical requests', () => {
    const key = `loop_test_key_${Date.now()}`;
    const signature = 'sig_test_loop_123';

    // 1st time: allowed
    const res1 = checkAndRecordLoop(key, dummyConfig, signature);
    assert.strictEqual(res1.loopDetected, false);
    assert.strictEqual(res1.repeats, 1);

    // 2nd time: allowed
    const res2 = checkAndRecordLoop(key, dummyConfig, signature);
    assert.strictEqual(res2.loopDetected, false);
    assert.strictEqual(res2.repeats, 2);

    // 3rd time: TRIP! Loop detected!
    const res3 = checkAndRecordLoop(key, dummyConfig, signature);
    assert.strictEqual(res3.loopDetected, true);
    assert.strictEqual(res3.repeats, 3);
  });

  test('handleLoopBuster returns 429 Response when tripped', async () => {
    const key = `loop_http_key_${Date.now()}`;
    const payload = {
      messages: [
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'bash', arguments: 'broken_cmd' } }],
        },
        { role: 'tool', content: 'command not found: broken_cmd' },
      ],
    };

    // Calls 1 and 2: pass
    assert.strictEqual(handleLoopBuster('openai', payload, dummyConfig, key), null);
    assert.strictEqual(handleLoopBuster('openai', payload, dummyConfig, key), null);

    // Call 3: tripped!
    const tripResponse = handleLoopBuster('openai', payload, dummyConfig, key);
    assert.ok(tripResponse, 'Must return a Response object when loop is detected');
    assert.strictEqual(tripResponse.status, 429);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const data = (await tripResponse.json()) as any;
    assert.strictEqual(data.type, 'loop_detected');
    assert.strictEqual(data.repeats, 3);
    assert.ok(data.error.includes('Infinite agent loop detected'));
  });

  test('ignores loop detection when disabled in config', () => {
    const disabledConfig: TokenCapConfig = {
      ...dummyConfig,
      loopBuster: { enabled: false },
    };
    const key = `disabled_loop_key_${Date.now()}`;
    const signature = 'repeated_sig';

    for (let i = 0; i < 5; i++) {
      const res = checkAndRecordLoop(key, disabledConfig, signature);
      assert.strictEqual(res.loopDetected, false);
    }
  });
});
