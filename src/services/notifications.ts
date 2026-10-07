import type { TokenCapConfig } from '../types';
import { sendAlert } from '../utils/webhook';
import { checkBudget } from './budget';

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
        config.webhookUrl!,
        `🔔 TokenCap Cruise Control: Budget window has reset for ${virtualKey}. Your agent can resume execution!`,
      );
    }
  }, waitSeconds * 1000);

  timer.unref();
  activeRefillTimers.set(virtualKey, timer);
}

export function sendThresholdAlert(virtualKey: string, config: TokenCapConfig, spent: number) {
  if (!config.alertsEnabled || !config.webhookUrl) return;
  sendAlert(
    config.webhookUrl,
    `🚨 TokenCap Alert: Rolling window usage reached ${spent.toFixed(4)} (Cap: ${config.rollingWindowCap}) for key ${virtualKey}`,
  );
}
