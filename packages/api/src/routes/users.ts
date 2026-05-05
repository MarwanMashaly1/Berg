import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, inArray, or, ilike, ne, and, sql } from 'drizzle-orm';
import { randomUUID, randomBytes } from 'crypto';
import { db } from '../db.js';
import { users, userVibeTags, vibeTags, inviteLinks, circles } from '@berg/shared';
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

// GET /api/users/me -- return current user (explicit projection, no phone data)
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

// PATCH /api/users/me -- update profile fields + advance onboarding step
const patchUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  displayName: z.string().min(1).max(100).optional(),
  username: z.string().min(3).max(20).optional(),
  bio: z.string().max(500).optional(),
  image: z.string().url().optional(),
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
  if (body.image !== undefined) updates.image = body.image;
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

// POST /api/users/me/vibe-tags -- save selected vibe tags (replaces existing)
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

  // Vibe tags changed -> recompute FOF (tag Jaccard is 30% of the score)
  void enqueue('discovery/recompute-fof-user', { userId: user.id }).catch(() => {});

  return c.json({ ok: true, count: tagIds.length });
});

// GET /api/users/check-username?username= — check if a username is available
userRoutes.get('/check-username', async (c) => {
  const me = c.get('user');
  const username = c.req.query('username')?.toLowerCase().trim();
  if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
    return c.json({ available: false, reason: 'invalid' });
  }
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), me ? ne(users.id, me.id) : sql`true`))
    .limit(1);
  return c.json({ available: existing.length === 0 });
});

// GET /api/users/search?q= — search users by name or @handle, returns connection status
userRoutes.get('/search', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const q = c.req.query('q')?.trim();
  if (!q || q.length < 2) return c.json({ users: [] });

  const pattern = `%${q.replace(/[%_]/g, '\\$&')}%`;

  const results = await db
    .select({ id: users.id, name: users.name, username: users.username, image: users.image })
    .from(users)
    .where(and(
      ne(users.id, me.id),
      or(ilike(users.name, pattern), ilike(users.username, pattern)),
    ))
    .limit(20);

  if (results.length === 0) return c.json({ users: [] });

  // Fetch connection status for each result
  const resultIds = results.map((u) => u.id);
  const myCircles = await db
    .select({ friendId: circles.friendId, status: circles.status })
    .from(circles)
    .where(and(eq(circles.userId, me.id), inArray(circles.friendId, resultIds)));

  const statusMap = new Map(myCircles.map((c) => [c.friendId, c.status]));

  return c.json({
    users: results.map((u) => ({
      ...u,
      connectionStatus: statusMap.get(u.id) ?? null, // null | 'pending' | 'confirmed'
    })),
  });
});

// GET /api/users/me/invite-link -- get or create a personalised invite link
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

// POST /api/users/me/avatar-upload-url -- get Supabase signed URL to upload a profile photo
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

  // Always overwrite the same path -- one avatar per user
  const path = `${me.id}/avatar.${ext}`;

  const { data, error } = await supabaseAdmin.storage
    .from(AVATARS_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    console.error('[avatar] Failed to create upload URL:', error);
    return c.json({ error: 'Could not create upload URL' }, 500);
  }

  // Public URL -- avatars bucket should be public
  const { data: urlData } = supabaseAdmin.storage.from(AVATARS_BUCKET).getPublicUrl(path);

  return c.json({ uploadUrl: data.signedUrl, path, publicUrl: urlData.publicUrl });
});

// GET /api/users/:userId/public -- public profile card
userRoutes.get('/:userId/public', async (c) => {
  const me = c.get('user');
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

  // Vibe tags
  const tags = await db
    .select({ emoji: vibeTags.emoji, label: vibeTags.label })
    .from(userVibeTags)
    .innerJoin(vibeTags, eq(userVibeTags.tagId, vibeTags.id))
    .where(eq(userVibeTags.userId, userId));

  // Connection status (null if viewing own profile or not connected)
  let connectionStatus: 'pending' | 'confirmed' | null = null;
  if (me && me.id !== userId) {
    const [circle] = await db
      .select({ status: circles.status })
      .from(circles)
      .where(and(eq(circles.userId, me.id), eq(circles.friendId, userId)))
      .limit(1);
    connectionStatus = (circle?.status as typeof connectionStatus) ?? null;
  }

  return c.json({ user: { ...user, vibeTags: tags, connectionStatus } });
});

// POST /api/users/me/push-token -- register Expo push token for this device
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
