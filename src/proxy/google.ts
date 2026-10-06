import { updateUsage } from '../db/store';
import type { TokenCapConfig } from '../types';
import { handleLoopBuster } from '../utils/loopDetector';
import { calculateCost } from '../utils/pricing';

export async function handleGoogle(
  req: Request,
  config: TokenCapConfig,
  virtualKey: string,
): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = new URL(
    `https://generativelanguage.googleapis.com${url.pathname}${url.search}`,
  );

  targetUrl.searchParams.set('key', config.realKey);

  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('x-api-key');
  headers.delete('authorization');

  let body: any = null;
  let model = 'gemini-1.5-pro'; // default guess from url or body
  const modelMatch = url.pathname.match(/models\/([^:]+)/);
  if (modelMatch?.[1]) {
    model = modelMatch[1];
  }

  let requestBody: string | undefined;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    requestBody = await req.text();
    if (requestBody) {
      try {
        body = JSON.parse(requestBody);
        if (body.model && !modelMatch) model = body.model;
      } catch (_e) {}
    }
  }

  // Loop Buster: Circuit breaker for runaway agent loops
  const loopResponse = handleLoopBuster('google', body, config, virtualKey);
  if (loopResponse) return loopResponse;

  const isStreaming = url.pathname.includes('streamGenerateContent');

  let response: Response;
  try {
    response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body: requestBody,
    } as any);
  } catch (err: any) {
    console.error('Google upstream connection error:', err?.message || err);
    return Response.json(
      {
        error: 'Failed to connect to upstream Google Generative Language API',
        details: err?.message,
      },
      { status: 502 },
    );
  }

  if (!isStreaming || !response.ok) {
    const clone = response.clone();
    try {
      const data = (await clone.json()) as any;
      if (data.usageMetadata) {
        const inputTokens = data.usageMetadata.promptTokenCount || 0;
        const outputTokens = data.usageMetadata.candidatesTokenCount || 0;
        const cachedTokens = data.usageMetadata.cachedContentTokenCount || 0;
        const cost = calculateCost(
          'google',
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
              if (data.usageMetadata) {
                inputTokens = Math.max(inputTokens, data.usageMetadata.promptTokenCount || 0);
                outputTokens = Math.max(outputTokens, data.usageMetadata.candidatesTokenCount || 0);
                cachedTokens = Math.max(
                  cachedTokens,
                  data.usageMetadata.cachedContentTokenCount || 0,
                );
              }
            } catch (_e) {}
          }
        }
      }

      // Check remaining buffer if stream closed
      if (sseBuffer.trim().startsWith('data: ')) {
        try {
          const data = JSON.parse(sseBuffer.trim().slice(6));
          if (data.usageMetadata) {
            inputTokens = Math.max(inputTokens, data.usageMetadata.promptTokenCount || 0);
            outputTokens = Math.max(outputTokens, data.usageMetadata.candidatesTokenCount || 0);
            cachedTokens = Math.max(cachedTokens, data.usageMetadata.cachedContentTokenCount || 0);
          }
        } catch (_e) {}
      }
    } catch (_streamErr) {
      // Client aborted connection or socket closed; expected during user cancellation
    } finally {
      try {
        if (inputTokens > 0 || outputTokens > 0) {
          const cost = calculateCost(
            'google',
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
    console.error('Unhandled Google stream processing error:', err);
  });

  return new Response(readable, {
    status: response.status,
    headers: response.headers,
  });
}
