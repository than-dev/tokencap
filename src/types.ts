export type AutoPacingConfig = {
  enabled?: boolean;
  maxHoldSeconds?: number;
};

export type LoopBusterConfig = {
  enabled?: boolean;
  maxRepeats?: number;
  windowSeconds?: number;
};

export type TokenCapConfig = {
  realKey: string;
  provider: 'openai' | 'anthropic' | 'google';
  budgetMode?: 'usd' | 'tokens';
  hardCapDaily: number;
  hardCapMonthly: number;
  rollingWindowCap: number;
  rollingWindowSeconds: number;
  autoPacing?: AutoPacingConfig;
  loopBuster?: LoopBusterConfig;
  alertsEnabled?: boolean;
  webhookUrl?: string;
  alertThresholdPercent?: number;
};

export type TokenCapWrapperOptions = Partial<TokenCapConfig> & {
  user?: string;
  virtualKey?: string;
  dailyCap?: number;
  monthlyCap?: number;
};

export type SupportedSDKClient = { fetch: Function } & (
  | { chat: any }      // OpenAI
  | { messages: any }  // Anthropic
  | { models: any }    // Google Gemini
);

export type TokenCapFetch = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type BudgetCheckResult = {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  resetsAt?: string;
};

export type GlobalConfig = {
  keys: Record<string, TokenCapConfig>;
  port?: number;
};

export type UsageRecord = {
  id?: number;
  virtualKey: string;
  timestamp: number;
  cost: number;
  tokens: number;
};

export type Env = {
  Variables: {
    config: TokenCapConfig;
    virtualKey: string;
  };
};
