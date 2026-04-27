/**
 * In-memory cache for Google Places API responses.
 *
 * Caching strategy:
 * - Nearby search: keyed by (category, lat±0.01°, lng±0.01°) — ~1km precision
 *   TTL: 30 minutes. Venue density in an area doesn't change that fast.
 * - Autocomplete: keyed by (query, lat±0.01°, lng±0.01°)
 *   TTL: 10 minutes. Search results are stable for a session.
 *
 * GC runs every 5 minutes to remove expired entries (no memory leak).
 * Per-server (single Fly.io instance at early scale) — if you scale to
 * multiple instances, move this to Upstash Redis with the same interface.
 */

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

class PlacesCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private lastGc = Date.now();

  get<T>(key: string): T | null {
    this.maybeGc();
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      if (entry) this.store.delete(key); // expired
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  private maybeGc(): void {
    if (Date.now() - this.lastGc < 5 * 60 * 1000) return;
    for (const [k, v] of this.store) {
      if (Date.now() > v.expiresAt) this.store.delete(k);
    }
    this.lastGc = Date.now();
  }

  /** Snapshot for debugging / monitoring */
  stats() {
    const now = Date.now();
    let active = 0;
    for (const v of this.store.values()) {
      if (now < v.expiresAt) active++;
    }
    return { total: this.store.size, active };
  }
}

export const placesCache = new PlacesCache();

// TTLs
export const NEARBY_TTL_MS      = 30 * 60 * 1000; // 30 minutes
export const AUTOCOMPLETE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const DETAIL_TTL_MS       = 60 * 60 * 1000; // 1 hour

/**
 * Round a coordinate to 2 decimal places (~1.1km precision).
 * All users within the same ~1km cell share the same cache entry.
 */
export function roundCoord(n: number): number {
  return Math.round(n * 100) / 100;
}
