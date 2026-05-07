import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { db } from '../db';
import { pendingPhone, users } from '@berg/shared';
import { randomUUID } from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import { rateLimiter, API_LIMITS } from '../lib/rate-limiter.js';
import { auth } from '../auth.js';

export const phoneRoutes = new Hono();

const startSchema = z.object({
  phoneNumber: z.string().min(7).max(20),
  countryCode: z.string().length(2).optional(),
});

phoneRoutes.post('/start', zValidator('json', startSchema), async (c) => {
  const { phoneNumber, countryCode } = c.req.valid('json');

  // Validate and normalize to E.164 first so we can rate-limit on the canonical number
  let e164: string;
  try {
    if (!isValidPhoneNumber(phoneNumber, countryCode as any)) {
      return c.json({ error: 'Invalid phone number' }, 400);
    }
    const parsed = parsePhoneNumber(phoneNumber, countryCode as any);
    e164 = parsed.format('E.164');
  } catch {
    return c.json({ error: 'Invalid phone number format' }, 400);
  }

  // Rate limit: 5 SMS per phone number per hour (prevents SMS flooding)
  const rl = rateLimiter.check(`phone:${e164}`, API_LIMITS.phoneStart.limit, API_LIMITS.phoneStart.windowMs);
  if (!rl.allowed) {
    c.header('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return c.json({ error: 'Too many requests. Try again later.' }, 429);
  }

  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // Delete any existing pending entry for this phone number
  await db.delete(pendingPhone).where(eq(pendingPhone.phoneNumber, e164));

  // Insert a fresh pending entry (deletes any existing one for this number above)
  await db.insert(pendingPhone).values({
    id: randomUUID(),
    sessionId,
    phoneNumber: e164,
    expiresAt,
  });

  return c.json({ sessionId, expiresAt: expiresAt.toISOString() });
});

// POST /api/phone/link — link a pending phone number to the authenticated user
phoneRoutes.post('/link', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);

  let sessionId: string;
  try {
    const body = await c.req.json<{ sessionId?: string }>();
    sessionId = body.sessionId ?? '';
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }
  if (!sessionId) return c.json({ error: 'sessionId is required' }, 400);

  const pending = await db
    .select()
    .from(pendingPhone)
    .where(and(eq(pendingPhone.sessionId, sessionId), gt(pendingPhone.expiresAt, new Date())))
    .limit(1);

  if (!pending[0]) return c.json({ error: 'Invalid or expired session' }, 400);

  const { encryptPhone, hashPhone } = await import('../utils/crypto.js');
  const encryptedPhone = encryptPhone(pending[0].phoneNumber);
  const phoneHash = hashPhone(pending[0].phoneNumber);

  await db
    .update(users)
    .set({ phoneNumber: encryptedPhone, phoneHash, phoneVerified: true } as any)
    .where(eq(users.id, session.user.id));

  await db.delete(pendingPhone).where(eq(pendingPhone.sessionId, sessionId));

  return c.json({ ok: true });
});
