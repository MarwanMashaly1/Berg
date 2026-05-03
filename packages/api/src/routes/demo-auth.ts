import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { users, sessions } from '@berg/shared';
import { eq } from 'drizzle-orm';

export const demoAuthRoutes = new Hono();

const DEMO_EMAIL = 'reviewer@joinberg.app';

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

  const sessionToken = randomUUID();
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: randomUUID(),
    token: sessionToken,
    userId: demoUser!.id,
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: ipAddress ?? null,
    userAgent: 'Store Reviewer',
  });

  return `better-auth.session_token=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}
