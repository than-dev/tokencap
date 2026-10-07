import { db } from './connection';

export function countLoopSignaturesSince(
  virtualKey: string,
  signature: string,
  sinceTimestamp: number,
): number {
  const query = db.prepare(`
    SELECT COUNT(*) as count 
    FROM loop_signatures 
    WHERE virtualKey = ? AND signature = ? AND timestamp >= ?
  `);
  const result = query.get(virtualKey, signature, sinceTimestamp) as { count: number };
  return result?.count || 0;
}

export function insertLoopSignature(
  virtualKey: string,
  signature: string,
  timestamp: number,
): void {
  db.prepare(`
    INSERT INTO loop_signatures (virtualKey, signature, timestamp) 
    VALUES (?, ?, ?)
  `).run(virtualKey, signature, timestamp);
}

export function deleteLoopSignaturesForKey(virtualKey: string): void {
  db.prepare('DELETE FROM loop_signatures WHERE virtualKey = ?').run(virtualKey);
}
