import { loadConfig } from '../config';
import { getRecentUsage, getSpentSince, getTotalSpentSince } from '../db/usageRepository';
import { checkBudget } from './budget';

export function getDashboardStats() {
  const config = loadConfig();
  const now = Date.now();
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const date = new Date();
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).getTime();

  const totalToday = getTotalSpentSince(dayStart);
  const totalMonth = getTotalSpentSince(monthStart);

  const keysStats = Object.entries(config.keys || {}).map(([keyName, keyCfg]) => {
    const windowStart = now - keyCfg.rollingWindowSeconds * 1000;

    const spentToday = Number(getSpentSince(keyName, dayStart).toFixed(6));
    const spentMonth = Number(getSpentSince(keyName, monthStart).toFixed(6));
    const spentRolling = Number(getSpentSince(keyName, windowStart).toFixed(6));

    const budgetCheck = checkBudget(keyName, keyCfg);

    let status = 'active';
    if (!budgetCheck.allowed) {
      status = 'capped';
    }

    return {
      key: keyName,
      provider: keyCfg.provider,
      spentToday,
      hardCapDaily: keyCfg.hardCapDaily,
      spentMonth,
      hardCapMonthly: keyCfg.hardCapMonthly,
      spentRolling,
      rollingWindowCap: keyCfg.rollingWindowCap,
      rollingWindowSeconds: keyCfg.rollingWindowSeconds,
      autoPacing: keyCfg.autoPacing,
      status,
      reason: budgetCheck.reason,
      retryAfterSeconds: budgetCheck.retryAfterSeconds,
      resetsAt: budgetCheck.resetsAt,
    };
  });

  const recentRecords = getRecentUsage(20);

  return {
    uptimeSeconds: Math.floor(process.uptime()),
    totalToday: Number(totalToday.toFixed(6)),
    totalMonth: Number(totalMonth.toFixed(6)),
    keys: keysStats,
    recentUsage: recentRecords,
  };
}
