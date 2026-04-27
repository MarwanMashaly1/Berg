/**
 * General-purpose in-memory TTL cache for the Icebreaker API.
 *
 * Right tool for a single Fly.io instance — zero cost, zero latency.
 * Upgrade to Upstash Redis when scaling to multiple instances.
 *
 * Pattern: check cache → on miss, fetch from DB and write → return
 *
 * GC runs every 5 minutes to evict expired entries (no memory leak).
 */

type Entry<T> = { data: T; expiresAt: number };

class AppCache {
  private store = new Map<string, Entry<unknown>>();
  private lastGc = Date.now();

  /** Read a value. Returns null if missing or expired. */
  get<T>(key: string): T | null {
    this.maybeGc();
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      if (entry) this.store.delete(key); // evict expired
      return null;
    }
    return entry.data as T;
  }

  /** Write a value with a TTL in milliseconds. */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  /** Invalidate a single key. */
  del(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate all keys that start with a given prefix. */
  delPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Wrap a DB call with cache-aside logic. */
  async wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    const data = await fn();
    this.set(key, data, ttlMs);
    return data;
  }

  stats() {
    const now = Date.now();
    let active = 0;
    for (const v of this.store.values()) {
      if (now < v.expiresAt) active++;
    }
    return { total: this.store.size, active };
  }

  private maybeGc(): void {
    if (Date.now() - this.lastGc < 5 * 60 * 1000) return;
    for (const [k, v] of this.store) {
      if (Date.now() > v.expiresAt) this.store.delete(k);
    }
    this.lastGc = Date.now();
  }
}

export const cache = new AppCache();

// ── TTL constants ─────────────────────────────────────────────────────────────

function msUntilMidnightUtc(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.max(midnight.getTime() - now.getTime(), 60_000); // min 1 minute
}

export const TTL = {
  // Today's prompt: same for all users, resets at UTC midnight
  PROMPT_TODAY:       () => msUntilMidnightUtc(),
  // Vibe tags: seeded once, never changes in production
  VIBE_TAGS:          60 * 60 * 1000,           // 1 hour
  // Per-user discovery (recomputed every 24h by the FOF job)
  FOF_SUGGESTIONS:    10 * 60 * 1000,           // 10 minutes
  CIRCLE_SUGGESTIONS: 10 * 60 * 1000,           // 10 minutes
  PULSE:               5 * 60 * 1000,           // 5 minutes
  // Profile stats (counts change on mutations — invalidated on write)
  PROFILE_STATS:       2 * 60 * 1000,           // 2 minutes
} as const;

// ── Cache key builders ────────────────────────────────────────────────────────

export const CK = {
  promptToday: (date: string) => `prompt:today:${date}`,
  vibeTags:    () => `vibe-tags`,
  fof:         (userId: string) => `fof:${userId}`,
  circles:     (userId: string) => `circles:suggest:${userId}`,
  pulse:       (userId: string) => `pulse:${userId}`,
  stats:       (userId: string) => `profile:stats:${userId}`,
} as const;
