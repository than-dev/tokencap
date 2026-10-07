import { countLoopSignaturesSince, insertLoopSignature } from '../db/loopRepository';
import type { TokenCapConfig } from '../types';

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

  const previousCount = countLoopSignaturesSince(virtualKey, signature, windowStart);
  insertLoopSignature(virtualKey, signature, now);

  const totalCount = previousCount + 1;

  if (totalCount >= maxRepeats) {
    return { loopDetected: true, repeats: totalCount };
  }

  return { loopDetected: false, repeats: totalCount };
}
