import { db } from '../db.js';
import { verifications } from '@berg/shared';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const CODE_TTL_MS = 15 * 60 * 1000;

export async function storeCode(shortCode: string, token: string): Promise<void> {
  const key = `magic-code:${shortCode.toUpperCase()}`;
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  // Remove any stale entry for this code before inserting
  await db.delete(verifications).where(eq(verifications.identifier, key));
  await db.insert(verifications).values({
    id: randomUUID(),
    identifier: key,
    value: token,
    expiresAt,
  });
}

export async function lookupCode(shortCode: string): Promise<string | null> {
  const key = `magic-code:${shortCode.toUpperCase()}`;
  const [entry] = await db
    .select({ id: verifications.id, value: verifications.value, expiresAt: verifications.expiresAt })
    .from(verifications)
    .where(eq(verifications.identifier, key))
    .limit(1);

  if (!entry) return null;

  // Always delete — single-use whether valid or expired
  await db.delete(verifications).where(eq(verifications.id, entry.id));

  if (entry.expiresAt < new Date()) return null;
  return entry.value;
}
