export interface ModelPricing {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export const PRICING: Record<string, Record<string, ModelPricing>> = {
  openai: {
    'gpt-4.5': { input: 0.075 / 1000, output: 0.15 / 1000, cacheRead: 0.0375 / 1000 },
    'gpt-4o-mini': { input: 0.00015 / 1000, output: 0.0006 / 1000, cacheRead: 0.000075 / 1000 },
    'gpt-4o': { input: 0.0025 / 1000, output: 0.01 / 1000, cacheRead: 0.00125 / 1000 },
    'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
    'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
    'gpt-3.5-turbo': { input: 0.0005 / 1000, output: 0.0015 / 1000 },
    'o1-mini': { input: 0.0011 / 1000, output: 0.0044 / 1000, cacheRead: 0.00055 / 1000 },
    'o3-mini': { input: 0.0011 / 1000, output: 0.0044 / 1000, cacheRead: 0.00055 / 1000 },
    o1: { input: 0.015 / 1000, output: 0.06 / 1000, cacheRead: 0.0075 / 1000 },
  },
  anthropic: {
    'claude-3-7-sonnet': {
      input: 0.003 / 1000,
      output: 0.015 / 1000,
      cacheRead: 0.0003 / 1000,
      cacheWrite: 0.00375 / 1000,
    },
    'claude-3-5-sonnet': {
      input: 0.003 / 1000,
      output: 0.015 / 1000,
      cacheRead: 0.0003 / 1000,
      cacheWrite: 0.00375 / 1000,
    },
    'claude-3-5-haiku': {
      input: 0.0008 / 1000,
      output: 0.004 / 1000,
      cacheRead: 0.00008 / 1000,
      cacheWrite: 0.001 / 1000,
    },
    'claude-3-haiku': {
      input: 0.00025 / 1000,
      output: 0.00125 / 1000,
      cacheRead: 0.00003 / 1000,
      cacheWrite: 0.0003 / 1000,
    },
    'claude-3-opus': {
      input: 0.015 / 1000,
      output: 0.075 / 1000,
      cacheRead: 0.0015 / 1000,
      cacheWrite: 0.01875 / 1000,
    },
  },
  google: {
    'gemini-2.0-flash-thinking': { input: 0.0001 / 1000, output: 0.0004 / 1000 },
    'gemini-2.0-flash': { input: 0.0001 / 1000, output: 0.0004 / 1000, cacheRead: 0.000025 / 1000 },
    'gemini-2.0-pro': { input: 0.00125 / 1000, output: 0.005 / 1000 },
    'gemini-1.5-flash-8b': {
      input: 0.0000375 / 1000,
      output: 0.00015 / 1000,
      cacheRead: 0.00001 / 1000,
    },
    'gemini-1.5-flash': {
      input: 0.000075 / 1000,
      output: 0.0003 / 1000,
      cacheRead: 0.00001875 / 1000,
    },
    'gemini-1.5-pro': { input: 0.00125 / 1000, output: 0.005 / 1000, cacheRead: 0.0003125 / 1000 },
  },
};

// Default fallback pricing per provider to ensure unlisted models still count towards budget
const DEFAULT_PROVIDER_PRICING: Record<string, ModelPricing> = {
  openai: { input: 0.0025 / 1000, output: 0.01 / 1000, cacheRead: 0.00125 / 1000 }, // Default to gpt-4o tier
  anthropic: {
    input: 0.003 / 1000,
    output: 0.015 / 1000,
    cacheRead: 0.0003 / 1000,
    cacheWrite: 0.00375 / 1000,
  }, // Default to claude-3-5-sonnet tier
  google: { input: 0.00125 / 1000, output: 0.005 / 1000, cacheRead: 0.0003125 / 1000 }, // Default to gemini-1.5-pro tier
};

export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedReadTokens: number = 0,
  cachedWriteTokens: number = 0,
  isInputNet: boolean = false,
): number {
  const providerPricing = PRICING[provider];
  if (!providerPricing) return 0;

  // Basic substring match for models to handle variants (e.g. gpt-4o-2024-08-06 matches gpt-4o)
  let modelPricing: ModelPricing | null = null;

  // Check more specific names first by sorting keys by length descending
  const sortedKeys = Object.keys(providerPricing).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (model.includes(key)) {
      modelPricing = providerPricing[key];
      break;
    }
  }

  // Fallback to default tier if model name is unrecognized
  if (!modelPricing) {
    modelPricing = DEFAULT_PROVIDER_PRICING[provider] || {
      input: 0.001 / 1000,
      output: 0.002 / 1000,
    };
  }

  const cacheReadPrice = modelPricing.cacheRead ?? modelPricing.input * 0.5;
  const cacheWritePrice = modelPricing.cacheWrite ?? modelPricing.input * 1.25;

  let netInputTokens = inputTokens;
  if (!isInputNet && cachedReadTokens > 0) {
    netInputTokens = Math.max(0, inputTokens - cachedReadTokens);
  }

  const inputCost =
    netInputTokens * modelPricing.input +
    cachedReadTokens * cacheReadPrice +
    cachedWriteTokens * cacheWritePrice;
  const outputCost = outputTokens * modelPricing.output;

  return inputCost + outputCost;
}
