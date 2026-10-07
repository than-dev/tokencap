import { db } from './connection';

export function insertUsage(virtualKey: string, timestamp: number, cost: number): void {
  const stmt = db.prepare('INSERT INTO usage (virtualKey, timestamp, cost) VALUES (?, ?, ?)');
  stmt.run(virtualKey, timestamp, cost);
}

export function getSpentSince(virtualKey: string, sinceTimestamp: number): number {
  const stmt = db.prepare(
    'SELECT SUM(cost) as total FROM usage WHERE virtualKey = ? AND timestamp >= ?',
  );
  const result = stmt.get(virtualKey, sinceTimestamp) as { total: number };
  return result?.total || 0;
}

export function getUsageRecordsSince(virtualKey: string, sinceTimestamp: number) {
  const stmt = db.prepare(`
    SELECT timestamp, cost 
    FROM usage 
    WHERE virtualKey = ? AND timestamp >= ? 
    ORDER BY timestamp ASC
  `);
  return stmt.all(virtualKey, sinceTimestamp) as { timestamp: number; cost: number }[];
}

export function deleteUsageForKey(virtualKey: string): void {
  db.prepare('DELETE FROM usage WHERE virtualKey = ?').run(virtualKey);
}

export function getTotalSpentSince(sinceTimestamp: number): number {
  const stmt = db.prepare('SELECT SUM(cost) as total FROM usage WHERE timestamp >= ?');
  const result = stmt.get(sinceTimestamp) as { total: number };
  return result?.total || 0;
}

export function getRecentUsage(limit: number) {
  const stmt = db.prepare(`
    SELECT id, virtualKey, timestamp, cost 
    FROM usage 
    ORDER BY timestamp DESC 
    LIMIT ?
  `);
  return stmt.all(limit) as { id: number; virtualKey: string; timestamp: number; cost: number }[];
}
