/**
 * In-memory sliding window rate limiter.
 *
 * Good enough for a single Fly.io instance at early scale.
 * If you scale to multiple instances, swap the Map for Supabase KV or Upstash Redis.
 *
 * Usage:
 *   const limiter = new RateLimiter();
 *   const result = limiter.check('userId:places/nearby', 20, 60 * 60 * 1000); // 20/hr
 *   if (!result.allowed) return c.json({ error: 'Rate limit exceeded' }, 429);
 */

type Bucket = {
  count: number;
  resetAt: number; // unix ms
};

export class RateLimiter {
  private store = new Map<string, Bucket>();
  private lastGc = Date.now();

  /**
   * Check and increment the rate limit for a key.
   *
   * @param key       Unique key, e.g. `${userId}:places/nearby`
   * @param limit     Max requests allowed in the window
   * @param windowMs  Window duration in milliseconds
   */
  check(
    key: string,
    limit: number,
    windowMs: number,
  ): { allowed: boolean; remaining: number; resetAt: number } {
    this.maybeGc();

    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now >= existing.resetAt) {
      // New window
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
    }

    if (existing.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: limit - existing.count,
      resetAt: existing.resetAt,
    };
  }

  /** Garbage-collect expired buckets once per hour to prevent memory leak. */
  private maybeGc() {
    const now = Date.now();
    if (now - this.lastGc < 60 * 60 * 1000) return;
    for (const [key, bucket] of this.store) {
      if (now >= bucket.resetAt) this.store.delete(key);
    }
    this.lastGc = now;
  }
}

/** Singleton — one limiter per API process. */
export const rateLimiter = new RateLimiter();

/**
 * Per-endpoint limits for Google Places API calls.
 * These are intentionally generous for real users but prevent scraping.
 *
 * Each limit = max per user per window.
 * A single motive creation uses: 1 nearby + ~8 autocomplete + 1 detail.
 * A very active user creating 5 motives/hour uses: 5 + 40 + 5 = 50 calls.
 * Our limits are 4–6× above that to never affect legitimate use.
 */
export const PLACES_LIMITS = {
  nearby: { limit: 30,  windowMs: 60 * 60 * 1000 },       // 30/hour
  search: { limit: 120, windowMs: 10 * 60 * 1000 },        // 120 per 10 min
  detail: { limit: 50,  windowMs: 60 * 60 * 1000 },        // 50/hour
} as const;

/**
 * Per-endpoint limits for general API mutations.
 */
export const API_LIMITS = {
  chatMessage:       { limit: 60,  windowMs: 60 * 1000 },          // 60/min
  motiveCreate:      { limit: 20,  windowMs: 60 * 60 * 1000 },     // 20/hr
  motiveInvite:      { limit: 30,  windowMs: 60 * 60 * 1000 },     // 30/hr
  avatarUpload:      { limit: 10,  windowMs: 60 * 60 * 1000 },     // 10/hr
  connectionRequest: { limit: 30,  windowMs: 60 * 60 * 1000 },     // 30/hr
  phoneStart:        { limit: 5,   windowMs: 60 * 60 * 1000 },     // 5 SMS/hr per phone
  verifyCode:        { limit: 10,  windowMs: 15 * 60 * 1000 },     // 10 attempts per 15 min
} as const;
