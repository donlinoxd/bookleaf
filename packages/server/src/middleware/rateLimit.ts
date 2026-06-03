interface RateLimitEntry {
  count: number;
  blockedUntil: number;
  lastActivity: number;
}

const loginFailures = new Map<string, RateLimitEntry>();

// Prune stale entries every 5 minutes
const cleanup = setInterval(() => {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;
  for (const [k, e] of loginFailures.entries()) {
    if (e.lastActivity < cutoff && e.blockedUntil < now) loginFailures.delete(k);
  }
}, 5 * 60 * 1000);
if ((cleanup as NodeJS.Timeout).unref) (cleanup as NodeJS.Timeout).unref();

export function rateLimitCheck(key: string): { blocked: false } | { blocked: true; retryAfter: number } {
  const now = Date.now();
  const entry = loginFailures.get(key);
  if (!entry) return { blocked: false };
  if (entry.blockedUntil > now) {
    return { blocked: true, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  return { blocked: false };
}

export function rateLimitRecordFailure(key: string): void {
  const now = Date.now();
  const entry = loginFailures.get(key) ?? { count: 0, blockedUntil: 0, lastActivity: now };
  entry.count += 1;
  entry.lastActivity = now;
  if (entry.count >= 15) entry.blockedUntil = now + 15 * 60 * 1000;
  else if (entry.count >= 10) entry.blockedUntil = now + 5 * 60 * 1000;
  else if (entry.count >= 5) entry.blockedUntil = now + 60 * 1000;
  loginFailures.set(key, entry);
}

export function rateLimitRecordSuccess(key: string): void {
  loginFailures.delete(key);
}
