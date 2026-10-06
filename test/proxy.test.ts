import assert from 'node:assert';
import { describe, test } from 'node:test';
import { handleOpenAI } from '../src/proxy/openai';
import type { TokenCapConfig } from '../src/types';

describe('OpenAI Proxy Handler', () => {
  const dummyConfig: TokenCapConfig = {
    realKey: 'sk-real-test-key',
    provider: 'openai',
    hardCapDaily: 10,
    hardCapMonthly: 100,
    rollingWindowCap: 2,
    rollingWindowSeconds: 3600,
  };

  test('injects stream_options.include_usage when stream is true', async () => {
    let capturedBody: any = null;
    let capturedHeaders: Headers | null = null;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      capturedHeaders = new Headers(init.headers);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as any;

    try {
      const req = new Request('http://localhost:8787/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'hello' }],
          stream: true,
        }),
      });

      await handleOpenAI(req, dummyConfig, 'test_virtual_key');
      assert.strictEqual(capturedBody?.stream, true);
      assert.deepStrictEqual(capturedBody?.stream_options, { include_usage: true });
      assert.strictEqual(capturedHeaders?.get('authorization'), 'Bearer sk-real-test-key');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
