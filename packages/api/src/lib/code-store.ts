/**
 * In-memory short code → full token mapping for magic link verification.
 * Short codes expire after 15 minutes matching the magic link TTL.
 */
const store = new Map<string, { token: string; expiresAt: number }>();

export function storeCode(shortCode: string, token: string) {
  store.set(shortCode, {
    token,
    expiresAt: Date.now() + 15 * 60 * 1000,
  });
}

export function lookupCode(shortCode: string): string | null {
  const entry = store.get(shortCode.toUpperCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(shortCode);
    return null;
  }
  store.delete(shortCode); // single-use
  return entry.token;
}
