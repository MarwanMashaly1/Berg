import { describe, it, expect, beforeEach, vi } from 'vitest';

// Re-import fresh module per test to reset in-memory store state
let storeCode: (code: string, token: string) => void;
let lookupCode: (code: string) => string | null;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../../lib/code-store.js');
  storeCode = mod.storeCode;
  lookupCode = mod.lookupCode;
});

describe('storeCode / lookupCode', () => {
  it('returns token for valid code', () => {
    storeCode('ABCD1234', 'full-token-abc');
    expect(lookupCode('ABCD1234')).toBe('full-token-abc');
  });

  it('is case-insensitive on lookup', () => {
    storeCode('ABCD1234', 'full-token-abc');
    expect(lookupCode('abcd1234')).toBe('full-token-abc');
  });

  it('is single-use — returns null on second lookup', () => {
    storeCode('ABCD1234', 'full-token-abc');
    lookupCode('ABCD1234');
    expect(lookupCode('ABCD1234')).toBeNull();
  });

  it('returns null for unknown code', () => {
    expect(lookupCode('XXXXXXXX')).toBeNull();
  });

  it('returns null for expired code', () => {
    vi.useFakeTimers();
    storeCode('EXPRD000', 'token-xyz');
    vi.advanceTimersByTime(15 * 60 * 1000 + 1); // past 15-min TTL
    expect(lookupCode('EXPRD000')).toBeNull();
    vi.useRealTimers();
  });

  it('returns token for non-expired code', () => {
    vi.useFakeTimers();
    storeCode('VALID000', 'token-valid');
    vi.advanceTimersByTime(14 * 60 * 1000); // within TTL
    expect(lookupCode('VALID000')).toBe('token-valid');
    vi.useRealTimers();
  });

  it('different codes stored independently', () => {
    storeCode('CODE0001', 'token-1');
    storeCode('CODE0002', 'token-2');
    expect(lookupCode('CODE0001')).toBe('token-1');
    expect(lookupCode('CODE0002')).toBe('token-2');
  });
});
