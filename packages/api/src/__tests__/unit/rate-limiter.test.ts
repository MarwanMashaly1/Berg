import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../../lib/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it('allows the first request', () => {
    const result = limiter.check('user1:test', 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('allows up to the limit', () => {
    for (let i = 0; i < 5; i++) {
      const r = limiter.check('user1:test', 5, 60_000);
      expect(r.allowed).toBe(true);
    }
  });

  it('blocks after the limit is exceeded', () => {
    for (let i = 0; i < 5; i++) limiter.check('user1:test', 5, 60_000);
    const blocked = limiter.check('user1:test', 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('resets after the window expires', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) limiter.check('user1:test', 5, 1_000);
    expect(limiter.check('user1:test', 5, 1_000).allowed).toBe(false);

    vi.advanceTimersByTime(1_001);
    expect(limiter.check('user1:test', 5, 1_000).allowed).toBe(true);
    vi.useRealTimers();
  });

  it('tracks different keys independently', () => {
    for (let i = 0; i < 5; i++) limiter.check('user1:test', 5, 60_000);
    const other = limiter.check('user2:test', 5, 60_000);
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(4);
  });

  it('decrements remaining correctly', () => {
    const r1 = limiter.check('u:test', 10, 60_000);
    expect(r1.remaining).toBe(9);
    const r2 = limiter.check('u:test', 10, 60_000);
    expect(r2.remaining).toBe(8);
  });

  it('returns correct resetAt timestamp', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const { resetAt } = limiter.check('u:test', 5, 60_000);
    expect(resetAt).toBe(now + 60_000);
    vi.useRealTimers();
  });
});
