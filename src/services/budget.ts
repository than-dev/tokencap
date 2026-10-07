import { getSpentSince, getUsageRecordsSince, insertUsage } from '../db/usageRepository';
import type { BudgetCheckResult, TokenCapConfig } from '../types';
import { getInFlightCount } from './inFlight';
import { sendThresholdAlert } from './notifications';

export function checkBudget(virtualKey: string, config: TokenCapConfig): BudgetCheckResult {
  const now = Date.now();
  const inFlight = getInFlightCount(virtualKey);
  const speculativeHold = inFlight * 0.002;

  // Daily check
  if (config.hardCapDaily > 0) {
    const dayStart = new Date().setHours(0, 0, 0, 0);
    const spent = getSpentSince(virtualKey, dayStart) + speculativeHold;

    if (spent >= config.hardCapDaily) {
      const tomorrow = new Date();
      tomorrow.setHours(24, 0, 0, 0);
      const retryAfterSeconds = Math.max(1, Math.ceil((tomorrow.getTime() - now) / 1000));
      return {
        allowed: false,
        reason: 'TokenCap Budget Exceeded: Daily',
        retryAfterSeconds,
        resetsAt: new Date(now + retryAfterSeconds * 1000).toISOString(),
      };
    }
  }

  // Monthly check
  if (config.hardCapMonthly > 0) {
    const date = new Date();
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    const spent = getSpentSince(virtualKey, monthStart) + speculativeHold;

    if (spent >= config.hardCapMonthly) {
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      const retryAfterSeconds = Math.max(1, Math.ceil((nextMonth.getTime() - now) / 1000));
      return {
        allowed: false,
        reason: 'TokenCap Budget Exceeded: Monthly',
        retryAfterSeconds,
        resetsAt: new Date(now + retryAfterSeconds * 1000).toISOString(),
      };
    }
  }

  // Rolling window check (Cruise Control Pacing)
  if (config.rollingWindowCap > 0 && config.rollingWindowSeconds > 0) {
    const windowMs = config.rollingWindowSeconds * 1000;
    const windowStart = now - windowMs;
    const spent = getSpentSince(virtualKey, windowStart) + speculativeHold;

    if (spent >= config.rollingWindowCap) {
      const records = getUsageRecordsSince(virtualKey, windowStart);
      let accumulatedExpired = 0;
      let targetExpireTimestamp = now + windowMs;

      for (const rec of records) {
        accumulatedExpired += rec.cost;
        if (spent - accumulatedExpired < config.rollingWindowCap) {
          targetExpireTimestamp = rec.timestamp + windowMs;
          break;
        }
      }

      const retryAfterSeconds = Math.max(1, Math.ceil((targetExpireTimestamp - now) / 1000));

      return {
        allowed: false,
        reason: 'TokenCap Budget Exceeded: Rolling Window',
        retryAfterSeconds,
        resetsAt: new Date(now + retryAfterSeconds * 1000).toISOString(),
      };
    }
  }

  return { allowed: true };
}

export function updateUsage(virtualKey: string, config: TokenCapConfig, cost: number) {
  if (cost <= 0) return;
  const now = Date.now();
  insertUsage(virtualKey, now, cost);

  if (config.alertsEnabled && config.webhookUrl && config.rollingWindowCap > 0) {
    const threshold = config.alertThresholdPercent || 0.8;
    const windowStart = now - config.rollingWindowSeconds * 1000;
    const spent = getSpentSince(virtualKey, windowStart);

    if (spent >= config.rollingWindowCap * threshold) {
      sendThresholdAlert(virtualKey, config, spent);
    }
  }
}
