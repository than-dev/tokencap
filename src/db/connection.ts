import path from 'node:path';
import Database from 'better-sqlite3';

export function getDbPath(): string {
  return process.env.TOKENCAP_DB_PATH
    ? path.resolve(process.cwd(), process.env.TOKENCAP_DB_PATH)
    : path.join(process.cwd(), 'tokencap.sqlite');
}

export const db = new Database(getDbPath());

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    virtualKey TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    cost REAL NOT NULL,
    tokens INTEGER NOT NULL DEFAULT 0
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

try {
  db.exec('ALTER TABLE usage ADD COLUMN tokens INTEGER NOT NULL DEFAULT 0');
} catch (err: any) {
  // Column likely already exists
}

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
