import { getDb } from './db.ts';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const CLEANUP_INTERVAL_MS = 300_000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    try {
      const db = getDb();
      db.prepare('DELETE FROM rate_limits WHERE timestamp < ?').run(cutoff);
    } catch {
      /* db may not be available */
    }
  }, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

export function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  if (!ip || typeof ip !== 'string') {
    return { allowed: false, remaining: 0, resetAt: Date.now() + WINDOW_MS };
  }

  startCleanup();

  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  try {
    const db = getDb();

    // Count recent requests from this IP
    const row = db
      .prepare('SELECT COUNT(*) AS count FROM rate_limits WHERE ip = ? AND timestamp > ?')
      .get(ip, windowStart) as { count: number };

    if (row.count >= MAX_REQUESTS) {
      // Find oldest timestamp in window for calculating reset
      const oldest = db
        .prepare('SELECT timestamp FROM rate_limits WHERE ip = ? AND timestamp > ? ORDER BY timestamp ASC LIMIT 1')
        .get(ip, windowStart) as { timestamp: number } | undefined;
      return { allowed: false, remaining: 0, resetAt: (oldest?.timestamp ?? now) + WINDOW_MS };
    }

    // Record this hit
    db.prepare('INSERT INTO rate_limits (ip, timestamp) VALUES (?, ?)').run(ip, now);

    const remaining = MAX_REQUESTS - row.count - 1;
    return { allowed: true, remaining, resetAt: now + WINDOW_MS };
  } catch {
    // Fail-open: allow request if DB is not available
    return { allowed: true, remaining: MAX_REQUESTS, resetAt: now + WINDOW_MS };
  }
}
