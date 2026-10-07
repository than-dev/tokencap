import crypto from 'node:crypto';
import { checkAndRecordLoop } from '../services/loopBuster';
import { sendAlert } from './webhook';

/**
 * Extracts a deterministic signature of the latest turn/action of an agent request.
 * By inspecting the tail of the conversation (last 2 messages or tool calls),
 * it detects when an agent is repeating identical actions/errors in a ReAct loop.
 */
// biome-ignore lint/suspicious/noExplicitAny: parsing dynamic JSON
export function extractSignature(provider: string, body: any): string | null {
  if (!body || typeof body !== 'object') return null;

  try {
    // biome-ignore lint/suspicious/noExplicitAny: JSON structure
    let normalizedTail: any = null;

    if (provider === 'openai' && Array.isArray(body.messages) && body.messages.length > 0) {
      const tail = body.messages.slice(-2);
      // biome-ignore lint/suspicious/noExplicitAny: JSON structure
      normalizedTail = tail.map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content.trim() : m.content,
        // biome-ignore lint/suspicious/noExplicitAny: JSON structure
        tool_calls: m.tool_calls?.map((tc: any) => ({
          name: tc.function?.name,
          args: tc.function?.arguments,
        })),
      }));
    } else if (
      provider === 'anthropic' &&
      Array.isArray(body.messages) &&
      body.messages.length > 0
    ) {
      const tail = body.messages.slice(-2);
      // biome-ignore lint/suspicious/noExplicitAny: JSON structure
      normalizedTail = tail.map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content.trim() : m.content,
      }));
    } else if (provider === 'google' && Array.isArray(body.contents) && body.contents.length > 0) {
      const tail = body.contents.slice(-2);
      // biome-ignore lint/suspicious/noExplicitAny: JSON structure
      normalizedTail = tail.map((c: any) => ({
        role: c.role,
        parts: c.parts,
      }));
    } else {
      // General fallback for non-standard payloads
      const raw = JSON.stringify(body);
      normalizedTail = raw.slice(0, 4000);
    }

    const payload = JSON.stringify(normalizedTail);
    return crypto.createHash('sha256').update(payload).digest('hex');
  } catch (_err) {
    return null;
  }
}

/**
 * Checks if the incoming request is part of an infinite loop.
 * If a loop is detected, dispatches alerts and returns a 429 Response.
 * Otherwise, records the signature and returns null.
 */
// biome-ignore lint/suspicious/noExplicitAny: parsing dynamic JSON
export function handleLoopBuster(
  provider: string,
  body: any,
  config: import('../types').TokenCapConfig,
  virtualKey: string,
): Response | null {
  if (!body || !config.loopBuster?.enabled) return null;

  const signature = extractSignature(provider, body);
  const loopStatus = checkAndRecordLoop(virtualKey, config, signature);

  if (loopStatus.loopDetected) {
    const repeats = loopStatus.repeats ?? config.loopBuster.maxRepeats ?? 3;
    const windowSeconds = config.loopBuster.windowSeconds ?? 120;

    if (config.alertsEnabled && config.webhookUrl) {
      sendAlert(
        config.webhookUrl,
        `🚨 TokenCap Loop Buster: Infinite loop detected for key ${virtualKey}. The agent repeated identical actions ${repeats} times.`,
      );
    }

    return Response.json(
      {
        error: `TokenCap Loop Buster: Infinite agent loop detected. The last action signature was repeated ${repeats} times within ${windowSeconds}s without progress.`,
        type: 'loop_detected',
        repeats,
      },
      { status: 429 },
    );
  }

  return null;
}
