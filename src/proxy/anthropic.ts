import { updateUsage } from '../services/budget';
import type { TokenCapConfig } from '../types';
import { handleLoopBuster } from '../utils/loopDetector';
import { calculateCost } from '../utils/pricing';

export async function handleAnthropic(
  req: Request,
  config: TokenCapConfig,
  virtualKey: string,
): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = `https://api.anthropic.com${url.pathname}${url.search}`;

  const headers = new Headers(req.headers);
  headers.set('x-api-key', config.realKey);
  headers.delete('host');

  // biome-ignore lint/suspicious/noExplicitAny: parsing dynamic JSON
  let body: any = null;
  let model = 'claude-3-5-sonnet-20240620'; // default

  let requestBody: string | undefined;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    requestBody = await req.text();
    if (requestBody) {
      try {
        body = JSON.parse(requestBody);
        if (body.model) model = body.model;
      } catch (_e) {}
    }
  }

  // Loop Buster: Circuit breaker for runaway agent loops
  const loopResponse = handleLoopBuster('anthropic', body, config, virtualKey);
  if (loopResponse) return loopResponse;

  const isStreaming = body?.stream === true;

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: requestBody,
    });
    // biome-ignore lint/suspicious/noExplicitAny: error can be anything
  } catch (err: any) {
    console.error('Anthropic upstream connection error:', err?.message || err);
    return Response.json(
      { error: 'Failed to connect to upstream Anthropic API', details: err?.message },
      { status: 502 },
    );
  }

  if (!isStreaming || !response.ok) {
    const clone = response.clone();
    try {
      // biome-ignore lint/suspicious/noExplicitAny: parsing dynamic JSON
      const data = (await clone.json()) as any;
      if (data.usage) {
        const inputTokens = data.usage.input_tokens || 0;
        const outputTokens = data.usage.output_tokens || 0;
        const cacheReadTokens = data.usage.cache_read_input_tokens || 0;
        const cacheWriteTokens = data.usage.cache_creation_input_tokens || 0;
        const cost = calculateCost(
          'anthropic',
          model,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          true,
        );
        updateUsage(virtualKey, config, cost, inputTokens + outputTokens);
      }
    } catch (_e) {}
    return response;
  }

  const { readable, writable } = new TransformStream();

  (async () => {
    const reader = response.body?.getReader();
    const writer = writable.getWriter();
    const decoder = new TextDecoder();

    if (!reader) {
      await writer.close().catch(() => {});
      return;
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let sseBuffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Forward chunk to client; if client disconnected, writer.write throws
        await writer.write(value);

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || ''; // Keep partial line for next chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.type === 'message_start' && data.message?.usage) {
                inputTokens = data.message.usage.input_tokens || 0;
                cacheReadTokens = data.message.usage.cache_read_input_tokens || 0;
                cacheWriteTokens = data.message.usage.cache_creation_input_tokens || 0;
              } else if (data.type === 'message_delta' && data.usage) {
                outputTokens = data.usage.output_tokens || 0;
              }
            } catch (_e) {}
          }
        }
      }

      // Check remaining buffer if stream closed
      if (sseBuffer.trim().startsWith('data: ')) {
        try {
          const data = JSON.parse(sseBuffer.trim().slice(6));
          if (data.type === 'message_start' && data.message?.usage) {
            inputTokens = data.message.usage.input_tokens || 0;
            cacheReadTokens = data.message.usage.cache_read_input_tokens || 0;
            cacheWriteTokens = data.message.usage.cache_creation_input_tokens || 0;
          } else if (data.type === 'message_delta' && data.usage) {
            outputTokens = data.usage.output_tokens || 0;
          }
        } catch (_e) {}
      }
    } catch (_streamErr) {
      // Client aborted connection or socket closed; expected during user cancellation
    } finally {
      try {
        if (inputTokens > 0 || outputTokens > 0 || cacheReadTokens > 0 || cacheWriteTokens > 0) {
          const cost = calculateCost(
            'anthropic',
            model,
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens,
            true,
          );
          updateUsage(virtualKey, config, cost, inputTokens + outputTokens);
        }
        await writer.close().catch(() => {});
      } catch (_) {}
    }
  })().catch((err) => {
    console.error('Unhandled Anthropic stream processing error:', err);
  });

  return new Response(readable, {
    status: response.status,
    headers: response.headers,
  });
}
