import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { users, sessions } from '@berg/shared';
import { eq } from 'drizzle-orm';

export const demoAuthRoutes = new Hono();

const DEMO_EMAIL = 'reviewer@joinberg.app';

/**
 * Sign a cookie value using Hono's signed-cookie format: `value.base64(HMAC-SHA256(value, secret))`
 * Must match what BetterAuth's setSignedCookie / getSignedCookie expect.
 */
async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  const base64Sig = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${value}.${base64Sig}`;
}

/**
 * Shared session creator for the demo reviewer account.
 * Called by verify-code when DEMO_CODE matches, keeping the normal 8-char code UX.
 */
export async function createDemoSession(ipAddress?: string | null): Promise<string> {
  let [demoUser] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);

  if (!demoUser) {
    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      name: 'Berg Reviewer',
      email: DEMO_EMAIL,
      emailVerified: true,
      onboardingCompleted: true,
      onboardingStep: '6',
      onboardingCompletedAt: new Date(),
      activatedAt: new Date(),
      availabilityStatus: 'down_to_hang',
      showInDiscovery: false,
      notifyPromptMatches: false,
      notifyCircleRequests: false,
      notifyMotiveInvites: false,
      lastActiveTab: 'discovery',
    });
    [demoUser] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  }

  const rawToken = randomUUID();
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: randomUUID(),
    token: rawToken,
    userId: demoUser!.id,
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: ipAddress ?? null,
    userAgent: 'Store Reviewer',
  });

  // Sign the token so BetterAuth's getSignedCookie can verify it on get-session
  const secret = process.env.BETTER_AUTH_SECRET!;
  const signedToken = await signCookieValue(rawToken, secret);
  const encodedToken = encodeURIComponent(signedToken);

  return `better-auth.session_token=${encodedToken}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}
