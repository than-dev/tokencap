import type { AxiosInstance } from 'axios';
import { checkBudget, updateUsage } from './services/budget';
import type { TokenCapWrapperOptions } from './types';
import { handleLoopBuster } from './utils/loopDetector';
import { calculateCost } from './utils/pricing';

declare module 'axios' {
  export interface AxiosRequestConfig {
    tokencap?: TokenCapWrapperOptions;
  }
}

/**
 * Applies TokenCap interceptors to an Axios instance.
 * Allows passing dynamic context (like `user`) directly in the request config.
 * 
 * @example
 * const api = axios.create();
 * applyTokenCapInterceptor(api);
 * 
 * await api.post('https://api.openai.com/v1/chat/completions', data, {
 *   tokencap: { user: 'usr_123', dailyCap: 100000 }
 * });
 */
export function applyTokenCapInterceptor(
  axiosInstance: AxiosInstance,
  globalOptions?: TokenCapWrapperOptions,
): void {
  axiosInstance.interceptors.request.use(async (config) => {
    const opts = config.tokencap || globalOptions;
    if (!opts) return config;

    const virtualKey = opts.user || opts.virtualKey || 'default';

    const tcConfig = {
      ...opts,
      realKey: opts.realKey || '',
      provider: opts.provider || 'openai',
      hardCapDaily: opts.dailyCap ?? opts.hardCapDaily ?? 0,
      hardCapMonthly: opts.monthlyCap ?? opts.hardCapMonthly ?? 0,
      rollingWindowCap: opts.rollingWindowCap ?? 0,
      rollingWindowSeconds: opts.rollingWindowSeconds ?? 0,
    } as any;

    const budgetCheck = checkBudget(virtualKey, tcConfig);
    if (!budgetCheck.allowed) {
      const err = new Error(budgetCheck.reason) as any;
      err.response = {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': String(budgetCheck.retryAfterSeconds || 60) },
        data: {
          error: { message: budgetCheck.reason, type: 'rate_limit_error' },
        },
      };
      err.isAxiosError = true;
      throw err;
    }

    const urlString = config.url || '';
    const isOpenAI = urlString.includes('openai.com');
    const isAnthropic = urlString.includes('anthropic.com');
    const providerName = isOpenAI ? 'openai' : isAnthropic ? 'anthropic' : 'unknown';

    let bodyObj = null;
    if (config.data && typeof config.data === 'string') {
      try {
        bodyObj = JSON.parse(config.data);
      } catch (e) {}
    } else if (config.data && typeof config.data === 'object') {
      bodyObj = config.data;
    }

    const loopResponse = handleLoopBuster(providerName as any, bodyObj, tcConfig, virtualKey);
    if (loopResponse) {
      const err = new Error('LoopBuster triggered') as any;
      err.response = { status: 429, data: { error: 'Loop detected' } };
      err.isAxiosError = true;
      throw err;
    }

    if (bodyObj && bodyObj.stream === true && isOpenAI) {
      bodyObj.stream_options = bodyObj.stream_options || {};
      bodyObj.stream_options.include_usage = true;
      if (typeof config.data === 'string') {
        config.data = JSON.stringify(bodyObj);
      }
    }

    (config as any)._tokencap = {
      providerName,
      opts: tcConfig,
      virtualKey,
      isStreaming: bodyObj?.stream === true,
      model: bodyObj?.model || 'unknown',
    };

    return config;
  });

  axiosInstance.interceptors.response.use((response) => {
    const ctx = (response.config as any)._tokencap;
    if (!ctx) return response;

    const { providerName, opts, virtualKey, isStreaming, model } = ctx;

    if (!isStreaming) {
      const data = response.data;
      let inputTokens = 0;
      let outputTokens = 0;
      let cachedTokens = 0;

      if (providerName === 'openai' && data?.usage) {
        inputTokens = data.usage.prompt_tokens || 0;
        outputTokens = data.usage.completion_tokens || 0;
        cachedTokens = data.usage.prompt_tokens_details?.cached_tokens || 0;
      } else if (providerName === 'anthropic' && data?.usage) {
        inputTokens = data.usage.input_tokens || 0;
        outputTokens = data.usage.output_tokens || 0;
        cachedTokens = data.usage.cache_read_input_tokens || 0;
      }

      if (inputTokens > 0 || outputTokens > 0) {
        const cost = calculateCost(
          providerName,
          model,
          inputTokens,
          outputTokens,
          cachedTokens,
          0,
          false,
        );
        updateUsage(virtualKey, opts, cost, inputTokens + outputTokens);
      }
    } else {
      if (response.data && typeof response.data.on === 'function') {
        let inputTokens = 0;
        let outputTokens = 0;
        let cachedTokens = 0;
        let sseBuffer = '';
        const stream = response.data;

        stream.on('data', (chunk: any) => {
          sseBuffer += chunk.toString();
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (
              providerName === 'openai' &&
              trimmed.startsWith('data: ') &&
              trimmed !== 'data: [DONE]'
            ) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.usage) {
                  inputTokens = data.usage.prompt_tokens || 0;
                  outputTokens = data.usage.completion_tokens || 0;
                  cachedTokens = data.usage.prompt_tokens_details?.cached_tokens || 0;
                }
              } catch (e) {}
            } else if (providerName === 'anthropic' && trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.type === 'message_start' && data.message?.usage) {
                  inputTokens = data.message.usage.input_tokens || 0;
                } else if (data.type === 'message_delta' && data.usage) {
                  outputTokens += data.usage.output_tokens || 0;
                }
              } catch (e) {}
            }
          }
        });

        stream.on('end', () => {
          if (inputTokens > 0 || outputTokens > 0) {
            const cost = calculateCost(
              providerName,
              model,
              inputTokens,
              outputTokens,
              cachedTokens,
              0,
              false,
            );
            updateUsage(virtualKey, opts, cost, inputTokens + outputTokens);
          }
        });
      }
    }

    return response;
  });
}
