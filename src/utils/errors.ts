/**
 * Standard OpenAI Error Envelope.
 * Mirrors the schema used by OpenAI and LiteLLM so official SDKs
 * (openai-python, openai-node, LangChain, Cursor, etc.) parse error messages
 * and error types seamlessly.
 */
export interface OpenAIErrorEnvelope {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | number | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function formatOpenAIError(
  message: string,
  type = 'invalid_request_error',
  code: string | number | null = null,
  param: string | null = null,
  extra: Record<string, unknown> = {},
): OpenAIErrorEnvelope {
  return {
    error: {
      message,
      type,
      param,
      code,
      ...extra,
    },
    ...extra,
  };
}
