interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const limits = new Map<string, RateLimitEntry>();

const DEFAULT_MAX_PER_MINUTE = 30;
const WINDOW_MS = 60_000;

export function checkRateLimit(
  agentName: string,
  action: string,
  maxPerMinute = DEFAULT_MAX_PER_MINUTE
): { allowed: boolean; remaining: number; resetMs: number } {
  const key = `${agentName}:${action}`;
  const now = Date.now();

  let entry = limits.get(key);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    limits.set(key, entry);
  }

  const remaining = maxPerMinute - entry.count;
  const resetMs = entry.windowStart + WINDOW_MS - now;

  if (entry.count >= maxPerMinute) {
    return { allowed: false, remaining: 0, resetMs };
  }

  entry.count++;
  return { allowed: true, remaining: remaining - 1, resetMs };
}

export function resetRateLimit(agentName: string, action: string): void {
  limits.delete(`${agentName}:${action}`);
}

export function pruneExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of limits) {
    if (now - entry.windowStart >= WINDOW_MS) limits.delete(key);
  }
}

setInterval(pruneExpiredEntries, WINDOW_MS);
