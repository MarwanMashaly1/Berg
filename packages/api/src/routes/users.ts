import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID, randomBytes } from 'crypto';
import { db } from '../db.js';
import { users, userVibeTags, vibeTags, inviteLinks } from '@berg/shared';
import { enqueue } from '../lib/queue.js';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin, AVATARS_BUCKET } from '../lib/supabase-admin.js';
import { rateLimiter, API_LIMITS } from '../lib/rate-limiter.js';
import type { auth } from '../auth.js';

/** Generates a cryptographically secure invite code (no ambiguous characters). */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const userRoutes = new Hono<{ Variables: Variables }>();

// All routes require authentication
userRoutes.use('*', requireAuth);

// GET /api/users/me â€” return current user (explicit projection, no phone data)
userRoutes.get('/me', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      displayName: users.displayName,
      username: users.username,
      bio: users.bio,
      availabilityStatus: users.availabilityStatus,
      onboardingStep: users.onboardingStep,
      onboardingCompleted: users.onboardingCompleted,
      notifyPromptMatches: users.notifyPromptMatches,
      notifyCircleRequests: users.notifyCircleRequests,
      notifyMotiveInvites: users.notifyMotiveInvites,
      showInDiscovery: users.showInDiscovery,
    })
    .from(users)
    .where(eq(users.id, me.id))
    .limit(1);
  return c.json({ user: user ?? null });
});

// PATCH /api/users/me â€” update profile fields + advance onboarding step
const patchUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  displayName: z.string().min(1).max(100).optional(),
  username: z.string().min(3).max(20).optional(),
  bio: z.string().max(500).optional(),
  availabilityStatus: z.enum(['down_to_hang', 'busy', 'ask_me']).optional(),
  onboardingStep: z.string().optional(),
  onboardingCompleted: z.boolean().optional(),
  notifyPromptMatches: z.boolean().optional(),
  notifyCircleRequests: z.boolean().optional(),
  notifyMotiveInvites: z.boolean().optional(),
  showInDiscovery: z.boolean().optional(),
}).strict();

userRoutes.patch('/me', zValidator('json', patchUserSchema), async (c) => {
  const currentUser = c.get('user')!;
  const body = c.req.valid('json');

  // Only allow onboarding_step to increment, never go back
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.displayName !== undefined) updates.displayName = body.displayName;
  if (body.username !== undefined) updates.username = body.username;
  if (body.bio !== undefined) updates.bio = body.bio;
  if (body.availabilityStatus !== undefined) updates.availabilityStatus = body.availabilityStatus;
  if (body.onboardingCompleted !== undefined) updates.onboardingCompleted = body.onboardingCompleted;
  if (body.notifyPromptMatches !== undefined) updates.notifyPromptMatches = body.notifyPromptMatches;
  if (body.notifyCircleRequests !== undefined) updates.notifyCircleRequests = body.notifyCircleRequests;
  if (body.notifyMotiveInvites !== undefined) updates.notifyMotiveInvites = body.notifyMotiveInvites;
  if (body.showInDiscovery !== undefined) updates.showInDiscovery = body.showInDiscovery;
  if (body.onboardingStep !== undefined) {
    const newStep = parseInt(body.onboardingStep, 10);
    const currentStep = parseInt(currentUser.onboardingStep ?? '0', 10);
    // Only increment, never go back
    if (newStep > currentStep) {
      updates.onboardingStep = String(newStep);
    }
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ user: currentUser });
  }

  await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, currentUser.id));

  // Re-fetch with explicit projection to avoid leaking phoneNumber/phoneHash/expoPushToken
  const [updated] = await db
    .select({
      id: users.id,
      name: users.name,
      displayName: users.displayName,
      username: users.username,
      bio: users.bio,
      availabilityStatus: users.availabilityStatus,
      onboardingStep: users.onboardingStep,
      onboardingCompleted: users.onboardingCompleted,
      image: users.image,
      notifyPromptMatches: users.notifyPromptMatches,
      notifyCircleRequests: users.notifyCircleRequests,
      notifyMotiveInvites: users.notifyMotiveInvites,
      showInDiscovery: users.showInDiscovery,
    })
    .from(users)
    .where(eq(users.id, currentUser.id))
    .limit(1);

  return c.json({ user: updated ?? null });
});

// POST /api/users/me/vibe-tags â€” save selected vibe tags (replaces existing)
userRoutes.post('/me/vibe-tags', zValidator('json', z.object({
  tagIds: z.array(z.string().uuid()).min(3, 'Select at least 3 vibe tags'),
})), async (c) => {
  const user = c.get('user')!;
  const { tagIds } = c.req.valid('json');

  // Verify all tag IDs exist
  const foundTags = await db
    .select({ id: vibeTags.id })
    .from(vibeTags)
    .where(inArray(vibeTags.id, tagIds));

  if (foundTags.length !== tagIds.length) {
    return c.json({ error: 'One or more tag IDs are invalid' }, 400);
  }

  // Replace all existing user vibe tags
  await db.delete(userVibeTags).where(eq(userVibeTags.userId, user.id));
  await db.insert(userVibeTags).values(
    tagIds.map((tagId) => ({ userId: user.id, tagId }))
  );

  // Vibe tags changed â†’ recompute FOF (tag Jaccard is 30% of the score)
  void enqueue('discovery/recompute-fof-user', { userId: user.id }).catch(() => {});

  return c.json({ ok: true, count: tagIds.length });
});

// GET /api/users/me/invite-link â€” get or create a personalised invite link
userRoutes.get('/me/invite-link', async (c) => {
  const me = c.get('user')!;
  const existing = await db.select().from(inviteLinks).where(eq(inviteLinks.userId, me.id)).limit(1);
  if (existing[0]) {
    const code = existing[0].code;
    return c.json({ code, url: `https://berg.app/join/${code}` });
  }
  const code = generateInviteCode();
  await db.insert(inviteLinks).values({
    id: randomUUID(), userId: me.id, code,
    clickCount: 0, signupCount: 0, acceptedCount: 0, createdAt: new Date(),
  });
  return c.json({ code, url: `https://berg.app/join/${code}` });
});

// POST /api/users/me/avatar-upload-url â€” get Supabase signed URL to upload a profile photo
userRoutes.post('/me/avatar-upload-url', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const rl = rateLimiter.check(
    `${me.id}:avatar-upload`,
    API_LIMITS.avatarUpload.limit,
    API_LIMITS.avatarUpload.windowMs,
  );
  if (!rl.allowed) {
    c.header('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return c.json({ error: 'Too many requests. Try again shortly.' }, 429);
  }

  const body = await c.req.json<{ ext?: string; contentType?: string }>();
  const ext = (body.ext ?? 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const contentType = body.contentType ?? 'image/jpeg';

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  if (!allowed.includes(contentType)) {
    return c.json({ error: 'Unsupported image type' }, 400);
  }

  // Always overwrite the same path â€” one avatar per user
  const path = `${me.id}/avatar.${ext}`;

  const { data, error } = await supabaseAdmin.storage
    .from(AVATARS_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    console.error('[avatar] Failed to create upload URL:', error);
    return c.json({ error: 'Could not create upload URL' }, 500);
  }

  // Public URL â€” avatars bucket should be public
  const { data: urlData } = supabaseAdmin.storage.from(AVATARS_BUCKET).getPublicUrl(path);

  return c.json({ uploadUrl: data.signedUrl, path, publicUrl: urlData.publicUrl });
});

// GET /api/users/:userId/public â€” public profile card (for QR scan connection flow)
userRoutes.get('/:userId/public', async (c) => {
  const userId = c.req.param('userId');
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      username: users.username,
      availabilityStatus: users.availabilityStatus,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json({ user });
});

// POST /api/users/me/push-token â€” register Expo push token for this device
userRoutes.post('/me/push-token', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);
  const body = await c.req.json<{ token?: string }>();
  if (!body.token || !body.token.startsWith('ExponentPushToken[')) {
    return c.json({ error: 'Invalid push token format' }, 400);
  }
  await db.update(users).set({ expoPushToken: body.token }).where(eq(users.id, me.id));
  return c.json({ ok: true });
});
