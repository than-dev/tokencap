import { updateUsage } from '../db/store';
import type { TokenCapConfig } from '../types';
import { handleLoopBuster } from '../utils/loopDetector';
import { calculateCost } from '../utils/pricing';

export async function handleOpenAI(
  req: Request,
  config: TokenCapConfig,
  virtualKey: string,
): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = `https://api.openai.com${url.pathname}${url.search}`;

  const headers = new Headers(req.headers);
  headers.set('Authorization', `Bearer ${config.realKey}`);
  headers.delete('host');

  let body: any = null;
  let model = 'gpt-4o'; // default
  let requestBody: string | undefined;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    requestBody = await req.text();
    if (requestBody) {
      try {
        body = JSON.parse(requestBody);
        if (body.model) model = body.model;

        // Ensure OpenAI always returns usage stats in streaming mode
        if (body.stream === true) {
          if (!body.stream_options) {
            body.stream_options = { include_usage: true };
          } else {
            body.stream_options.include_usage = true;
          }
          requestBody = JSON.stringify(body);
        }
      } catch (_e) {}
    }
  }

  // Loop Buster: Circuit breaker for runaway agent loops
  const loopResponse = handleLoopBuster('openai', body, config, virtualKey);
  if (loopResponse) return loopResponse;

  const isStreaming = body?.stream === true;

  if (requestBody) {
    headers.set('content-length', Buffer.byteLength(requestBody).toString());
    headers.set('content-type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: requestBody,
    } as any);
  } catch (err: any) {
    console.error('OpenAI upstream connection error:', err?.message || err);
    return Response.json(
      { error: 'Failed to connect to upstream OpenAI API', details: err?.message },
      { status: 502 },
    );
  }

  if (!isStreaming || !response.ok) {
    const clone = response.clone();
    try {
      const data = (await clone.json()) as any;
      if (data.usage) {
        const inputTokens = data.usage.prompt_tokens || 0;
        const outputTokens = data.usage.completion_tokens || 0;
        const cachedTokens = data.usage.prompt_tokens_details?.cached_tokens || 0;
        const cost = calculateCost(
          'openai',
          model,
          inputTokens,
          outputTokens,
          cachedTokens,
          0,
          false,
        );
        updateUsage(virtualKey, config, cost);
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
    let cachedTokens = 0;
    let hasOfficialUsage = false;
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
          if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.usage) {
                hasOfficialUsage = true;
                inputTokens = data.usage.prompt_tokens || 0;
                outputTokens = data.usage.completion_tokens || 0;
                cachedTokens = data.usage.prompt_tokens_details?.cached_tokens || 0;
              } else if (!hasOfficialUsage && data.choices?.[0]?.delta?.content) {
                // Approximate fallback only if usage is never returned
                outputTokens += 1;
              }
            } catch (_e) {}
          }
        }
      }

      // Check remaining buffer if stream closed
      if (sseBuffer.trim().startsWith('data: ') && sseBuffer.trim() !== 'data: [DONE]') {
        try {
          const data = JSON.parse(sseBuffer.trim().slice(6));
          if (data.usage) {
            hasOfficialUsage = true;
            inputTokens = data.usage.prompt_tokens || 0;
            outputTokens = data.usage.completion_tokens || 0;
            cachedTokens = data.usage.prompt_tokens_details?.cached_tokens || 0;
          }
        } catch (_e) {}
      }
    } catch (_streamErr) {
      // Client aborted connection or socket closed; expected during user cancellation
    } finally {
      try {
        if (inputTokens > 0 || outputTokens > 0) {
          const cost = calculateCost(
            'openai',
            model,
            inputTokens,
            outputTokens,
            cachedTokens,
            0,
            false,
          );
          updateUsage(virtualKey, config, cost);
        }
        await writer.close().catch(() => {});
      } catch (_) {}
    }
  })().catch((err) => {
    console.error('Unhandled OpenAI stream processing error:', err);
  });

  return new Response(readable, {
    status: response.status,
    headers: response.headers,
  });
}
