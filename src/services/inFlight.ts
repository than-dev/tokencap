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
