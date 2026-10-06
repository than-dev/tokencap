import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import yaml from 'yaml';
import type { BudgetCheckResult, GlobalConfig, TokenCapConfig } from '../types';
import { sendAlert } from '../utils/webhook';

const activeRefillTimers = new Map<string, NodeJS.Timeout>();

export function scheduleRefillNotification(
  virtualKey: string,
  config: TokenCapConfig,
  waitSeconds: number,
) {
  if (!config.webhookUrl || activeRefillTimers.has(virtualKey)) return;

  const timer = setTimeout(() => {
    activeRefillTimers.delete(virtualKey);
    const status = checkBudget(virtualKey, config);
    if (status.allowed) {
      sendAlert(
        config.webhookUrl,
        `🔔 TokenCap Cruise Control: Budget window has reset for ${virtualKey}. Your agent can resume execution!`,
      );
    }
  }, waitSeconds * 1000);

  timer.unref();
  activeRefillTimers.set(virtualKey, timer);
}

export function getDbPath(): string {
  return process.env.TOKENCAP_DB_PATH
    ? path.resolve(process.cwd(), process.env.TOKENCAP_DB_PATH)
    : path.join(process.cwd(), 'tokencap.sqlite');
}

export function getConfigPath(): string {
  if (process.env.TOKENCAP_CONFIG_PATH) {
    return path.resolve(process.cwd(), process.env.TOKENCAP_CONFIG_PATH);
  }
  const yamlPath = path.join(process.cwd(), 'tokencap.yaml');
  if (fs.existsSync(yamlPath)) return yamlPath;
  return path.join(process.cwd(), 'tokencap.json');
}

const db = new Database(getDbPath());

// Enable WAL mode for crash resilience and concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Initialize DB schema
db.exec(`
  CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    virtualKey TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    cost REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_usage_key_time ON usage(virtualKey, timestamp);

  CREATE TABLE IF NOT EXISTS loop_signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    virtualKey TEXT NOT NULL,
    signature TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_loop_sig ON loop_signatures(virtualKey, signature, timestamp);
`);

let cachedConfig: GlobalConfig | null = null;
let lastConfigMtime = 0;
let lastConfigPath = '';
let lastCheckTime = 0;

function resolveEnvPlaceholders(content: string): string {
  return content.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, varName) => process.env[varName] || '');
}

export function loadConfig(forceReload: boolean = false): GlobalConfig {
  const now = Date.now();
  // Check disk at most once every 1000ms unless forced or uninitialized
  if (!forceReload && cachedConfig && now - lastCheckTime < 1000) {
    return cachedConfig;
  }
  lastCheckTime = now;

  const targetPath = getConfigPath();
  const fileExists = fs.existsSync(targetPath);
  const isYaml = targetPath.endsWith('.yaml') || targetPath.endsWith('.yml');

  if (fileExists) {
    try {
      const stats = fs.statSync(targetPath);
      if (cachedConfig && targetPath === lastConfigPath && stats.mtimeMs === lastConfigMtime) {
        return cachedConfig;
      }
      let raw = fs.readFileSync(targetPath, 'utf8');
      raw = resolveEnvPlaceholders(raw);
      const parsed = (isYaml ? yaml.parse(raw) : JSON.parse(raw)) as GlobalConfig;
      if (parsed && typeof parsed === 'object' && parsed.keys) {
        cachedConfig = parsed;
        lastConfigMtime = stats.mtimeMs;
        lastConfigPath = targetPath;
        return cachedConfig;
      }
    } catch (err) {
      if (cachedConfig) {
        console.error(
          'Warning: Failed to parse updated config file, keeping previous valid config:',
          err,
        );
        return cachedConfig;
      }
    }
  }

  // Default fallback if no config exists
  const defaultConfig: GlobalConfig = {
    port: 8787,
    keys: {
      sk_virtual_example: {
        provider: 'openai',
        realKey: 'sk-proj-...',
        hardCapDaily: 2.0,
        hardCapMonthly: 20.0,
        rollingWindowCap: 0.5,
        rollingWindowSeconds: 3600,
      },
    },
  };

  try {
    fs.writeFileSync(targetPath, JSON.stringify(defaultConfig, null, 2));
    cachedConfig = defaultConfig;
    lastConfigPath = targetPath;
    lastConfigMtime = fs.statSync(targetPath).mtimeMs;
  } catch (_e) {
    cachedConfig = defaultConfig;
  }

  return cachedConfig;
}

export function getConfig(virtualKey: string): TokenCapConfig | null {
  if (!virtualKey || typeof virtualKey !== 'string') return null;
  const globalConfig = loadConfig();
  if (!globalConfig.keys || !Object.hasOwn(globalConfig.keys, virtualKey)) {
    return null;
  }
  return globalConfig.keys[virtualKey] || null;
}

// In-flight concurrency tracking to prevent budget overshoots on parallel requests
const activeInFlightRequests = new Map<string, number>();

export function trackInFlightStart(virtualKey: string): void {
  activeInFlightRequests.set(virtualKey, (activeInFlightRequests.get(virtualKey) || 0) + 1);
}

export function trackInFlightEnd(virtualKey: string): void {
  const current = activeInFlightRequests.get(virtualKey) || 1;
  if (current <= 1) {
    activeInFlightRequests.delete(virtualKey);
  } else {
    activeInFlightRequests.set(virtualKey, current - 1);
  }
}

export function getInFlightCount(virtualKey: string): number {
  return activeInFlightRequests.get(virtualKey) || 0;
}

export function checkBudget(virtualKey: string, config: TokenCapConfig): BudgetCheckResult {
  const now = Date.now();
  const inFlight = getInFlightCount(virtualKey);
  const speculativeHold = inFlight * 0.002; // Small speculative deduction per in-flight request

  // Daily check
  if (config.hardCapDaily > 0) {
    const dayStart = new Date().setHours(0, 0, 0, 0);
    const stmt = db.prepare(
      'SELECT SUM(cost) as total FROM usage WHERE virtualKey = ? AND timestamp >= ?',
    );
    const result = stmt.get(virtualKey, dayStart) as { total: number };
    const spent = (result.total || 0) + speculativeHold;

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
    const stmt = db.prepare(
      'SELECT SUM(cost) as total FROM usage WHERE virtualKey = ? AND timestamp >= ?',
    );
    const result = stmt.get(virtualKey, monthStart) as { total: number };
    const spent = (result.total || 0) + speculativeHold;

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
    const stmt = db.prepare(
      'SELECT SUM(cost) as total FROM usage WHERE virtualKey = ? AND timestamp >= ?',
    );
    const result = stmt.get(virtualKey, windowStart) as { total: number };
    const spent = (result.total || 0) + speculativeHold;

    if (spent >= config.rollingWindowCap) {
      // Find exact second when enough past records expire from the window
      // such that (spent - accumulatedExpired) < config.rollingWindowCap
      const recordsStmt = db.prepare(`
        SELECT timestamp, cost 
        FROM usage 
        WHERE virtualKey = ? AND timestamp >= ? 
        ORDER BY timestamp ASC
      `);
      const records = recordsStmt.all(virtualKey, windowStart) as {
        timestamp: number;
        cost: number;
      }[];

      let accumulatedExpired = 0;
      let targetExpireTimestamp = now + windowMs; // Fallback to full window if needed

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

  const stmt = db.prepare('INSERT INTO usage (virtualKey, timestamp, cost) VALUES (?, ?, ?)');
  stmt.run(virtualKey, now, cost);

  // Alerts logic
  if (config.alertsEnabled && config.webhookUrl) {
    const threshold = config.alertThresholdPercent || 0.8;
    if (config.rollingWindowCap > 0) {
      const windowStart = now - config.rollingWindowSeconds * 1000;
      const query = db.prepare(
        'SELECT SUM(cost) as total FROM usage WHERE virtualKey = ? AND timestamp >= ?',
      );
      const result = query.get(virtualKey, windowStart) as { total: number };
      const spent = result.total || 0;

      if (spent >= config.rollingWindowCap * threshold) {
        // Send alert asynchronously
        sendAlert(
          config.webhookUrl,
          `🚨 TokenCap Alert: Rolling window usage reached ${spent.toFixed(4)} (Cap: ${config.rollingWindowCap}) for key ${virtualKey}`,
        );
      }
    }
  }
}

export function checkAndRecordLoop(
  virtualKey: string,
  config: TokenCapConfig,
  signature: string | null,
): { loopDetected: boolean; repeats?: number } {
  if (!signature || !config.loopBuster?.enabled) {
    return { loopDetected: false };
  }

  const now = Date.now();
  const maxRepeats = config.loopBuster.maxRepeats ?? 3;
  const windowSeconds = config.loopBuster.windowSeconds ?? 120;
  const windowStart = now - windowSeconds * 1000;

  // Count past occurrences of this identical signature in the window
  const query = db.prepare(`
    SELECT COUNT(*) as count 
    FROM loop_signatures 
    WHERE virtualKey = ? AND signature = ? AND timestamp >= ?
  `);
  const result = query.get(virtualKey, signature, windowStart) as { count: number };
  const previousCount = result.count || 0;

  // Record this attempt
  db.prepare(`
    INSERT INTO loop_signatures (virtualKey, signature, timestamp) 
    VALUES (?, ?, ?)
  `).run(virtualKey, signature, now);

  const totalCount = previousCount + 1;

  if (totalCount >= maxRepeats) {
    return { loopDetected: true, repeats: totalCount };
  }

  return { loopDetected: false, repeats: totalCount };
}

// Cleanup task for old data (optional, keeps sqlite small)
const cleanupTimer = setInterval(
  () => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    db.prepare('DELETE FROM usage WHERE timestamp < ?').run(thirtyDaysAgo);
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    db.prepare('DELETE FROM loop_signatures WHERE timestamp < ?').run(twoHoursAgo);
  },
  24 * 60 * 60 * 1000,
);
cleanupTimer.unref();

export function getDashboardStats() {
  const config = loadConfig();
  const now = Date.now();
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const date = new Date();
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).getTime();

  const totalTodayRow = db
    .prepare('SELECT SUM(cost) as total FROM usage WHERE timestamp >= ?')
    .get(dayStart) as { total: number } | undefined;
  const totalMonthRow = db
    .prepare('SELECT SUM(cost) as total FROM usage WHERE timestamp >= ?')
    .get(monthStart) as { total: number } | undefined;

  const keysStats = Object.entries(config.keys || {}).map(([keyName, keyCfg]) => {
    const dayRow = db
      .prepare('SELECT SUM(cost) as total FROM usage WHERE virtualKey = ? AND timestamp >= ?')
      .get(keyName, dayStart) as { total: number } | undefined;
    const monthRow = db
      .prepare('SELECT SUM(cost) as total FROM usage WHERE virtualKey = ? AND timestamp >= ?')
      .get(keyName, monthStart) as { total: number } | undefined;

    const windowStart = now - keyCfg.rollingWindowSeconds * 1000;
    const rollingRow = db
      .prepare('SELECT SUM(cost) as total FROM usage WHERE virtualKey = ? AND timestamp >= ?')
      .get(keyName, windowStart) as { total: number } | undefined;

    const spentToday = Number((dayRow?.total || 0).toFixed(6));
    const spentMonth = Number((monthRow?.total || 0).toFixed(6));
    const spentRolling = Number((rollingRow?.total || 0).toFixed(6));

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

  const recentRecords = db
    .prepare(`
    SELECT id, virtualKey, timestamp, cost 
    FROM usage 
    ORDER BY timestamp DESC 
    LIMIT 20
  `)
    .all() as { id: number; virtualKey: string; timestamp: number; cost: number }[];

  return {
    uptimeSeconds: Math.floor(process.uptime()),
    totalToday: Number((totalTodayRow?.total || 0).toFixed(6)),
    totalMonth: Number((totalMonthRow?.total || 0).toFixed(6)),
    keys: keysStats,
    recentUsage: recentRecords,
  };
}

export function saveKeyConfig(virtualKey: string, newConfig: TokenCapConfig): void {
  const current = loadConfig(true);
  current.keys = current.keys || {};
  current.keys[virtualKey] = newConfig;

  const targetPath = getConfigPath();
  fs.writeFileSync(targetPath, JSON.stringify(current, null, 2));
  loadConfig(true);
}

export function resetKeyUsage(virtualKey: string): void {
  db.prepare('DELETE FROM usage WHERE virtualKey = ?').run(virtualKey);
  db.prepare('DELETE FROM loop_signatures WHERE virtualKey = ?').run(virtualKey);
}
