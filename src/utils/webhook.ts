export async function sendAlert(
  configWebhookUrl: string | undefined,
  message: string,
): Promise<void> {
  if (!configWebhookUrl || typeof configWebhookUrl !== 'string') return;

  try {
    const parsed = new URL(configWebhookUrl);
    const isHttps = parsed.protocol === 'https:';
    const isLocalhost =
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

    if (!isHttps && !isLocalhost) {
      console.error(`Blocked insecure webhook URL protocol: ${parsed.protocol}`);
      return;
    }

    await fetch(parsed.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error('Failed to send webhook alert:', err);
  }
}
