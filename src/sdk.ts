import { deleteUsageForKey, getRecentUsage } from './db/usageRepository';
import { checkBudget, updateUsage } from './services/budget';
import type { BudgetCheckResult, SupportedSDKClient, TokenCapConfig, TokenCapFetch, TokenCapRequestInit, TokenCapWrapperOptions } from './types';
import { handleLoopBuster } from './utils/loopDetector';
import { calculateCost } from './utils/pricing';

export class TokenCapGuard {
  constructor() {
    // SQLite connection is automatically initialized via src/db/connection.ts
    // which respects process.env.TOKENCAP_DB_PATH
  }

  public checkBudget(virtualKey: string, config: TokenCapConfig): BudgetCheckResult {
    return checkBudget(virtualKey, config);
  }

  public updateUsage(
    virtualKey: string,
    config: TokenCapConfig,
    cost: number,
    tokens: number = 0,
  ): void {
    updateUsage(virtualKey, config, cost, tokens);
  }

  public getRecentUsage(limit: number = 50) {
    return getRecentUsage(limit);
  }

  public deleteUsage(virtualKey: string): void {
    deleteUsageForKey(virtualKey);
  }
}

/**
 * Creates a budget-aware global fetch function. Useful if you're not using official SDKs
 * but making raw HTTP calls (via fetch) or configuring Axios.
 * 
 * @example
 * const myFetch = createTokenCapFetch({ user: 'usr_1', dailyCap: 100 });
 * const res = await myFetch('https://api.openai.com/v1/chat/completions', { ... });
 */
export function createTokenCapFetch(
  options?: TokenCapWrapperOptions,
  originalFetch: TokenCapFetch = globalThis.fetch.bind(globalThis)
): TokenCapFetch {
  // Normalize global config
  const globalConfig = {
    ...(options || {}),
    realKey: options?.realKey || '',
    provider: options?.provider || 'openai',
    hardCapDaily: options?.dailyCap ?? options?.hardCapDaily ?? 0,
    hardCapMonthly: options?.monthlyCap ?? options?.hardCapMonthly ?? 0,
    rollingWindowCap: options?.rollingWindowCap ?? 0,
    rollingWindowSeconds: options?.rollingWindowSeconds ?? 0,
  } as TokenCapConfig;

  return async (url: RequestInfo | URL, init?: TokenCapRequestInit): Promise<Response> => {
    const urlString = url.toString();
    const dynamicOpts = init?.tokencap || {};
    
    const virtualKey = dynamicOpts.user || dynamicOpts.virtualKey || options?.user || options?.virtualKey || 'default';
    const config = {
      ...globalConfig,
      ...dynamicOpts,
      hardCapDaily: dynamicOpts.dailyCap ?? dynamicOpts.hardCapDaily ?? globalConfig.hardCapDaily,
      hardCapMonthly: dynamicOpts.monthlyCap ?? dynamicOpts.hardCapMonthly ?? globalConfig.hardCapMonthly,
    } as TokenCapConfig;

    // 1. Budget Check
    const budgetCheck = checkBudget(virtualKey, config);
    if (!budgetCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: {
            message: budgetCheck.reason,
            type: 'rate_limit_error',
            code: 'rate_limit_exceeded',
          },
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(budgetCheck.retryAfterSeconds || 60),
          },
        },
      );
    }

    let bodyStr = typeof init?.body === 'string' ? init.body : undefined;
    // biome-ignore lint/suspicious/noExplicitAny: parsing dynamic JSON
    let bodyObj: any = null;
    let model = 'unknown';
    let isStreaming = false;

    // Detect provider
    const isOpenAI = urlString.includes('openai.com');
    const isAnthropic = urlString.includes('anthropic.com');
    const providerName = isOpenAI ? 'openai' : isAnthropic ? 'anthropic' : 'unknown';

    // 2. Parse body to inject stream options & check LoopBuster
    if (bodyStr) {
      try {
        bodyObj = JSON.parse(bodyStr);
        if (bodyObj.model) model = bodyObj.model;
        if (bodyObj.stream === true) {
          isStreaming = true;
          if (isOpenAI) {
            bodyObj.stream_options = bodyObj.stream_options || {};
            bodyObj.stream_options.include_usage = true;
            bodyStr = JSON.stringify(bodyObj);
          }
        }
      } catch (_e) {}
    }

    // 3. Loop Buster Check
    const loopResponse = handleLoopBuster(providerName as any, bodyObj, config, virtualKey);
    if (loopResponse) {
      return loopResponse;
    }

    const modifiedInit = { ...init };
    if (bodyStr) {
      modifiedInit.body = bodyStr;
      if (modifiedInit.headers) {
        const headers = new Headers(modifiedInit.headers as any);
        headers.delete('content-length');

        // Convert headers to Record<string, string> since fetch init expects that or Headers object
        const headersRecord: Record<string, string> = {};
        headers.forEach((value, key) => {
          headersRecord[key] = value;
        });
        modifiedInit.headers = headersRecord;
      }
    }

    // 4. Execute Request
    const response: Response = await originalFetch(url, modifiedInit);

    // 5. Intercept and tally tokens
    if (!response.ok) {
      return response;
    }

    if (!isStreaming) {
      const clone = response.clone();
      clone
        .json()
        .then((data: any) => {
          let inputTokens = 0;
          let outputTokens = 0;
          let cachedTokens = 0;

          if (isOpenAI && data.usage) {
            inputTokens = data.usage.prompt_tokens || 0;
            outputTokens = data.usage.completion_tokens || 0;
            cachedTokens = data.usage.prompt_tokens_details?.cached_tokens || 0;
          } else if (isAnthropic && data.usage) {
            inputTokens = data.usage.input_tokens || 0;
            outputTokens = data.usage.output_tokens || 0;
            cachedTokens = data.usage.cache_read_input_tokens || 0;
          }

          if (inputTokens > 0 || outputTokens > 0) {
            const cost = calculateCost(
              providerName as any,
              model,
              inputTokens,
              outputTokens,
              cachedTokens,
              0,
              false,
            );
            updateUsage(virtualKey, config, cost, inputTokens + outputTokens);
          }
        })
        .catch(() => {});
      return response;
    }

    // For streaming, use a TransformStream to observe chunks transparently
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

          await writer.write(value);

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (isOpenAI && trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.usage) {
                  inputTokens = data.usage.prompt_tokens || 0;
                  outputTokens = data.usage.completion_tokens || 0;
                  cachedTokens = data.usage.prompt_tokens_details?.cached_tokens || 0;
                }
              } catch (_) {}
            } else if (isAnthropic && trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.type === 'message_start' && data.message?.usage) {
                  inputTokens = data.message.usage.input_tokens || 0;
                } else if (data.type === 'message_delta' && data.usage) {
                  outputTokens += data.usage.output_tokens || 0;
                }
              } catch (_) {}
            }
          }
        }

        // Handle remaining buffer
        const finalTrimmed = sseBuffer.trim();
        if (isOpenAI && finalTrimmed.startsWith('data: ') && finalTrimmed !== 'data: [DONE]') {
          try {
            const data = JSON.parse(finalTrimmed.slice(6));
            if (data.usage) {
              inputTokens = data.usage.prompt_tokens || 0;
              outputTokens = data.usage.completion_tokens || 0;
              cachedTokens = data.usage.prompt_tokens_details?.cached_tokens || 0;
            }
          } catch (_) {}
        }
      } catch (err) {
        // Stream aborted by client
      } finally {
        if (inputTokens > 0 || outputTokens > 0) {
          const cost = calculateCost(
            providerName as any,
            model,
            inputTokens,
            outputTokens,
            cachedTokens,
            0,
            false,
          );
          updateUsage(virtualKey, config, cost, inputTokens + outputTokens);
        }
        await writer.close().catch(() => {});
      }
    })();

    return new Response(readable, {
      status: response.status,
      headers: response.headers,
    });
  };
}

/**
 * Wraps an official SDK client (like OpenAI or Anthropic) to transparently enforce budgets
 * and track usage via the local SQLite database.
 *
 * @example
 * const openai = withTokenCap(new OpenAI(), { user: 'usr_123', budgetMode: 'tokens', dailyCap: 100000 });
 */
export function withTokenCap<T extends SupportedSDKClient>(
  client: T,
  options: TokenCapWrapperOptions,
): T {
  // Bind the original fetch to the client so it has the correct `this` context
  const originalFetch = client.fetch.bind(client);
  client.fetch = createTokenCapFetch(options, originalFetch as TokenCapFetch);
  return client;
}
