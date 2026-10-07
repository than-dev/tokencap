import { loadConfig } from './config';
import { deleteUsageForKey, getRecentUsage } from './db/usageRepository';
import { checkBudget, updateUsage } from './services/budget';
import type { BudgetCheckResult, TokenCapConfig } from './types';

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
