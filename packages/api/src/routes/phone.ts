import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { db } from '../db';
import { pendingPhone } from '@berg/shared';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { rateLimiter, API_LIMITS } from '../lib/rate-limiter.js';

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
