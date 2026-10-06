import { updateUsage } from '../db/store';
import type { TokenCapConfig } from '../types';
import { formatOpenAIError } from './errors';
import { calculateCost } from './pricing';

export interface ExtractedUsage {
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens?: number;
  cachedWriteTokens?: number;
}

export interface ProxyStreamOptions {
  provider: 'openai' | 'anthropic' | 'google';
  providerLabel: string;
  model: string;
  virtualKey: string;
  config: TokenCapConfig;
  targetUrl: string;
  req: Request;
  headers: Headers;
  requestBody?: string;
  isStreaming: boolean;
  parseNonStreamingUsage: (json: any) => ExtractedUsage | null;
  parseStreamingChunk?: (json: any, usage: ExtractedUsage) => void;
  isInputNet?: boolean;
}

/**
 * Shared upstream proxy handler with automatic token usage tracking
 * and SSE streaming interception. Eliminates duplicate TransformStream
 * and buffering boilerplate across all provider adapters.
 */
export async function executeUpstreamProxy(options: ProxyStreamOptions): Promise<Response> {
  const {
    provider,
    providerLabel,
    model,
    virtualKey,
    config,
    targetUrl,
    req,
    headers,
    requestBody,
    isStreaming,
    parseNonStreamingUsage,
    parseStreamingChunk,
    isInputNet = false,
  } = options;

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: requestBody,
    } as any);
  } catch (err: any) {
    console.error(`${providerLabel} upstream connection error:`, err?.message || err);
    return Response.json(
      formatOpenAIError(
        `Failed to connect to upstream ${providerLabel} API`,
        'upstream_error',
        'bad_gateway',
        null,
        { details: err?.message },
      ),
      { status: 502 },
    );
  }

  // Non-streaming response or upstream error
  if (!isStreaming || !response.ok) {
    const clone = response.clone();
    try {
      const data = (await clone.json()) as any;
      const usage = parseNonStreamingUsage(data);
      if (usage && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
        const cost = calculateCost(
          provider,
          model,
          usage.inputTokens,
          usage.outputTokens,
          usage.cachedReadTokens || 0,
          usage.cachedWriteTokens || 0,
          isInputNet,
        );
        updateUsage(virtualKey, config, cost);
      }
    } catch (_e) {}
    return response;
  }

  // Streaming SSE response
  const { readable, writable } = new TransformStream();

  (async () => {
    const reader = response.body?.getReader();
    const writer = writable.getWriter();
    const decoder = new TextDecoder();

    if (!reader) {
      await writer.close().catch(() => {});
      return;
    }

    const usage: ExtractedUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cachedReadTokens: 0,
      cachedWriteTokens: 0,
    };
    let sseBuffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Pipe chunk downstream to client; throws if client disconnected
        await writer.write(value);

        if (parseStreamingChunk) {
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
              try {
                const data = JSON.parse(trimmed.slice(6));
                parseStreamingChunk(data, usage);
              } catch (_e) {}
            }
          }
        }
      }

      // Check any trailing data remaining in buffer
      if (
        parseStreamingChunk &&
        sseBuffer.trim().startsWith('data: ') &&
        sseBuffer.trim() !== 'data: [DONE]'
      ) {
        try {
          const data = JSON.parse(sseBuffer.trim().slice(6));
          parseStreamingChunk(data, usage);
        } catch (_e) {}
      }
    } catch (_streamErr) {
      // Client aborted connection; expected during user cancellation
    } finally {
      try {
        if (usage.inputTokens > 0 || usage.outputTokens > 0) {
          const cost = calculateCost(
            provider,
            model,
            usage.inputTokens,
            usage.outputTokens,
            usage.cachedReadTokens || 0,
            usage.cachedWriteTokens || 0,
            isInputNet,
          );
          updateUsage(virtualKey, config, cost);
        }
        await writer.close().catch(() => {});
      } catch (_) {}
    }
  })().catch((err) => {
    console.error(`Unhandled ${providerLabel} stream processing error:`, err);
  });

  return new Response(readable, {
    status: response.status,
    headers: response.headers,
  });
}
