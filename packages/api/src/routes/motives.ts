import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  motives,
  motiveAttendees,
  motiveMemories,
  chats,
  chatMembers,
  users,
  groupCircleMembers,
  promptMatches,
} from '@berg/shared';
import { or } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { sendPush, sendPushBatch, filterByPreference } from '../lib/notifications.js';
import { enqueueAt } from '../lib/queue.js';
import { rateLimit, API_LIMITS } from '../lib/rate-limiter.js';
import { cache, TTL, CK } from '../lib/cache.js';
import { posthog } from '../lib/posthog.js';
import type { auth } from '../auth.js';
import { log } from '../lib/logger.js';

const createMotiveSchema = z.object({
  title: z.string().min(1).max(120),
  category: z.enum(['food', 'outdoors', 'catchup', 'movies', 'active', 'party', 'gaming', 'travel', 'creative']),
  status: z.enum(['draft', 'planning', 'confirmed']).default('planning'),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  placeName: z.string().max(200).nullable().optional(),
  placeAddress: z.string().max(500).nullable().optional(),
  placeId: z.string().max(300).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  invitedUserIds: z.array(z.string().min(1)).max(50).default([]),
  invitedCircleIds: z.array(z.string().uuid()).max(20).default([]),
  // [align-2] Links this motive back to the prompt match that triggered it
  originPromptId: z.string().uuid().nullable().optional(),
});

const updateMotiveSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  status: z.enum(['draft', 'planning', 'confirmed', 'cancelled']).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  placeName: z.string().max(200).nullable().optional(),
  placeAddress: z.string().max(500).nullable().optional(),
  placeId: z.string().max(300).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

const memorySchema = z.object({
  vibeTags: z.array(z.string().max(50)).max(20).default([]),
  rating: z.number().int().min(1).max(5).optional(),
  venueRating: z.number().int().min(1).max(5).nullable().optional(),
  photoUrls: z.array(z.string().url()).max(10).default([]),
});

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const motivesRoutes = new Hono<{ Variables: Variables }>();
motivesRoutes.use('*', requireAuth);

// Creates a motive_thread chat for a confirmed motive (idempotent)
async function ensureMotiveChat(motiveId: string, title: string, attendeeUserIds: string[]) {
  const [existing] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.motiveId, motiveId))
    .limit(1);
  if (existing) return existing.id;

  const [chat] = await db
    .insert(chats)
    .values({ type: 'motive_thread', motiveId, name: title })
    .returning({ id: chats.id });

  if (attendeeUserIds.length > 0) {
    await db.insert(chatMembers).values(
      attendeeUserIds.map((uid) => ({ chatId: chat.id, userId: uid })),
    ).onConflictDoNothing();
  }
  return chat.id;
}

// --- POST /api/motives -- Create motive ---------------------------------------
motivesRoutes.post('/', zValidator('json', createMotiveSchema), async (c) => {
  const me = c.get('user')!;

  // Rate limit: 20 motives per user per hour
  const limitedCreate = rateLimit(c, `${me.id}:motive-create`, API_LIMITS.motiveCreate.limit, API_LIMITS.motiveCreate.windowMs);
  if (limitedCreate) return limitedCreate;

  const body = c.req.valid('json');

  const {
    title,
    category,
    status = 'planning',
    scheduledAt,
    placeName,
    placeAddress,
    placeId,
    lat,
    lng,
    note,
    invitedUserIds: rawInvitedUserIds = [],
    invitedCircleIds = [],
    originPromptId,
  } = body;

  // Expand circle members into the final invitedUserIds list
  let invitedUserIds: string[] = rawInvitedUserIds;
  if (invitedCircleIds.length > 0) {
    const circleMembers = await db
      .select({ userId: groupCircleMembers.userId })
      .from(groupCircleMembers)
      .where(and(inArray(groupCircleMembers.groupCircleId, invitedCircleIds), eq(groupCircleMembers.status, 'active')));
    const circleUserIds = circleMembers.map((m) => m.userId).filter((id) => id !== me.id);
    invitedUserIds = Array.from(new Set([...rawInvitedUserIds, ...circleUserIds]));
  }

  let motive: { id: string };
  try {
  [motive] = await db
    .insert(motives)
    .values({
      creatorId: me.id,
      title,
      category,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      venueName: placeName,
      venuePlaceId: placeId,
      placeAddress,
      lat,
      lng,
      note,
      originPromptId: originPromptId ?? null,
    })
    .returning({ id: motives.id });

  // Insert creator as organiser attendee
  await db.insert(motiveAttendees).values({
    motiveId: motive.id,
    userId: me.id,
    role: 'organiser',
    rsvpStatus: 'joined',
  });

  // Insert invited users as attendees -- filter to only real user IDs first
  if (invitedUserIds.length > 0) {
    const existingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, invitedUserIds));
    const validIds = existingUsers.map((u) => u.id);
    if (validIds.length > 0) {
      await db.insert(motiveAttendees).values(
        validIds.map((userId: string) => ({
          motiveId: motive.id,
          userId,
          role: 'attendee',
          rsvpStatus: 'invited',
        }))
      );
    }
  }

  // N1 -- Motive invite push notifications
  if (invitedUserIds.length > 0 && status !== 'draft') {
    const eligible = await filterByPreference(invitedUserIds, 'notifyMotiveInvites');
    if (eligible.length > 0) {
      const [creator] = await db.select({ name: users.name }).from(users).where(eq(users.id, me.id)).limit(1);
      void sendPushBatch(eligible, {
        title: creator?.name ?? 'Someone',
        body: `invited you -- ${title}`,
        data: { screen: 'motives', motiveId: motive.id },
      }).catch((err) => log.error({ err, motiveId: motive.id }, 'motives invite push failed'));
    }
  }

  // Schedule pg-boss jobs for reminders and memory prompts
  if (scheduledAt && status !== 'draft') {
    const t = new Date(scheduledAt).getTime();
    const data = { motiveId: motive.id };
    void Promise.all([
      enqueueAt('motive/reminder',      data, new Date(t - 2 * 3600 * 1000)),
      enqueueAt('motive/memory-prompt', data, new Date(t + 1 * 3600 * 1000)),
      enqueueAt('motive/resurface',     data, new Date(t + 14 * 24 * 3600 * 1000)),
    ]).catch((err) => log.error({ err, motiveId: motive.id }, 'motives reminder enqueue failed'));
  }

  // Auto-create group chat when motive is sent as confirmed
  if (status === 'confirmed') {
    const allIds = [me.id, ...(invitedUserIds ?? [])];
    await ensureMotiveChat(motive.id, title, allIds);
  }

  // [align-2] Mark prompt_matches as 'acted' when this motive originates from a match.
  // Finds any open match between the creator and any invited attendee on this prompt.
  if (originPromptId && invitedUserIds.length > 0) {
    for (const friendId of invitedUserIds) {
      const [userA, userB] = me.id < friendId ? [me.id, friendId] : [friendId, me.id];
      await db
        .update(promptMatches)
        .set({ status: 'acted', motiveId: motive.id, updatedAt: new Date() })
        .where(
          and(
            eq(promptMatches.promptId, originPromptId),
            eq(promptMatches.userAId, userA),
            eq(promptMatches.userBId, userB),
            inArray(promptMatches.status, ['pending', 'viewed']),
          ),
        );
    }
  }

  // Invalidate profile stats and motive list cache
  cache.del(CK.stats(me.id));
  cache.delPrefix(`motives:list:${me.id}:`);

  posthog.capture({
    distinctId: me.id,
    event: 'motive_created',
    properties: {
      category,
      status,
      invitee_count: invitedUserIds.length,
      has_place: !!placeName,
      has_date: !!scheduledAt,
      has_note: !!note,
      has_circle: invitedCircleIds.length > 0,
    },
  });

  return c.json({ id: motive.id }, 201);
  } catch (err) {
    log.error({ err, userId: me.id }, 'POST /motives failed');
    return c.json({ error: 'Failed to create motive' }, 500);
  }
});

// --- GET /api/motives -- List user's motives -----------------------------------
motivesRoutes.get('/', async (c) => {
  const me = c.get('user')!;
  const filter = c.req.query('filter') ?? 'all';

  const cacheKey = CK.motivesList(me.id, filter);
  const cached = cache.get<{ motives: unknown[] }>(cacheKey);
  if (cached) {
    c.header('X-Cache', 'HIT');
    return c.json(cached);
  }

  // Find all motives where the user is an attendee
  const attendeeRows = await db
    .select({ motiveId: motiveAttendees.motiveId })
    .from(motiveAttendees)
    .where(eq(motiveAttendees.userId, me.id));

  if (attendeeRows.length === 0) {
    return c.json({ motives: [] });
  }

  const motiveIds = attendeeRows.map((r) => r.motiveId);

  // Build status filter
  const activeStatuses = ['planning', 'confirmed', 'open'];
  const pastStatuses = ['completed', 'past'];

  let motiveRows;
  if (filter === 'active') {
    motiveRows = await db
      .select()
      .from(motives)
      .where(and(inArray(motives.id, motiveIds), inArray(motives.status, activeStatuses)));
  } else if (filter === 'past') {
    motiveRows = await db
      .select()
      .from(motives)
      .where(and(inArray(motives.id, motiveIds), inArray(motives.status, pastStatuses)));
  } else {
    motiveRows = await db
      .select()
      .from(motives)
      .where(inArray(motives.id, motiveIds));
  }

  if (motiveRows.length === 0) return c.json({ motives: [] });

  const filteredMotiveIds = motiveRows.map((m) => m.id);

  // Bulk fetch attendees for all motives in one query
  const allAttendeeRows = await db
    .select({
      motiveId: motiveAttendees.motiveId,
      userId: users.id,
      name: users.name,
      image: users.image,
      rsvpStatus: motiveAttendees.rsvpStatus,
      role: motiveAttendees.role,
    })
    .from(motiveAttendees)
    .innerJoin(users, eq(users.id, motiveAttendees.userId))
    .where(inArray(motiveAttendees.motiveId, filteredMotiveIds));

  // Bulk fetch memory counts for all motives in one GROUP BY query
  let memoryCountMap = new Map<string, number>();
  try {
    const memoryCounts = await db
      .select({
        motiveId: motiveMemories.motiveId,
        total: sql<number>`COALESCE(SUM(array_length(${motiveMemories.storagePaths}, 1)), 0)`,
      })
      .from(motiveMemories)
      .where(inArray(motiveMemories.motiveId, filteredMotiveIds))
      .groupBy(motiveMemories.motiveId);
    memoryCountMap = new Map(memoryCounts.map((r) => [r.motiveId, Number(r.total)]));
  } catch (err: any) {
    const code = err?.cause?.code ?? err?.code;
    if (code !== '42703') throw err;
    // Backward compat: storagePaths column not yet migrated, fall back to photoUrls
    const legacyCounts = await db
      .select({
        motiveId: motiveMemories.motiveId,
        total: sql<number>`COALESCE(SUM(array_length(${motiveMemories.photoUrls}, 1)), 0)`,
      })
      .from(motiveMemories)
      .where(inArray(motiveMemories.motiveId, filteredMotiveIds))
      .groupBy(motiveMemories.motiveId);
    memoryCountMap = new Map(legacyCounts.map((r) => [r.motiveId, Number(r.total)]));
  }

  // Group attendees by motiveId
  const attendeesMap = new Map<string, typeof allAttendeeRows>();
  for (const a of allAttendeeRows) {
    const list = attendeesMap.get(a.motiveId) ?? [];
    list.push(a);
    attendeesMap.set(a.motiveId, list);
  }

  const result = motiveRows.map((motive) => ({
    ...motive,
    attendees: attendeesMap.get(motive.id) ?? [],
    memoryCount: memoryCountMap.get(motive.id) ?? 0,
  }));

  const final = { motives: result };
  cache.set(cacheKey, final, TTL.MOTIVES_LIST);
  return c.json(final);
});

// --- GET /api/motives/:id -- Motive detail -------------------------------------
motivesRoutes.get('/:id', async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');

  const [motive] = await db
    .select()
    .from(motives)
    .where(eq(motives.id, motiveId))
    .limit(1);

  if (!motive) {
    return c.json({ error: 'Motive not found' }, 404);
  }

  // Verify user is an attendee
  const [membership] = await db
    .select()
    .from(motiveAttendees)
    .where(and(eq(motiveAttendees.motiveId, motiveId), eq(motiveAttendees.userId, me.id)))
    .limit(1);

  if (!membership) {
    return c.json({ error: 'Not found' }, 404);
  }

  // Fetch all attendees with user info
  const attendees = await db
    .select({
      userId: users.id,
      name: users.name,
      image: users.image,
      rsvpStatus: motiveAttendees.rsvpStatus,
      role: motiveAttendees.role,
      respondedAt: motiveAttendees.respondedAt,
    })
    .from(motiveAttendees)
    .innerJoin(users, eq(users.id, motiveAttendees.userId))
    .where(eq(motiveAttendees.motiveId, motiveId));

  // Basic activity feed -- last 5 attendees who responded (status changes)
  const activityFeed = attendees
    .filter((a) => a.respondedAt !== null)
    .sort((a, b) => {
      const aTime = a.respondedAt ? new Date(a.respondedAt).getTime() : 0;
      const bTime = b.respondedAt ? new Date(b.respondedAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 5)
    .map((a) => ({
      userId: a.userId,
      name: a.name,
      rsvpStatus: a.rsvpStatus,
      at: a.respondedAt,
    }));

  return c.json({ motive, attendees, activityFeed });
});

// --- PATCH /api/motives/:id -- Update motive (creator only) -------------------
motivesRoutes.patch('/:id', zValidator('json', updateMotiveSchema), async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');

  const [motive] = await db
    .select({ creatorId: motives.creatorId })
    .from(motives)
    .where(eq(motives.id, motiveId))
    .limit(1);

  if (!motive) {
    return c.json({ error: 'Motive not found' }, 404);
  }

  if (motive.creatorId !== me.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const {
    title,
    scheduledAt,
    placeName,
    placeAddress,
    placeId,
    lat,
    lng,
    status,
    note,
  } = c.req.valid('json');

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (scheduledAt !== undefined) updates.scheduledAt = new Date(scheduledAt);
  if (placeName !== undefined) updates.venueName = placeName;
  if (placeAddress !== undefined) updates.placeAddress = placeAddress;
  if (placeId !== undefined) updates.venuePlaceId = placeId;
  if (lat !== undefined) updates.lat = lat;
  if (lng !== undefined) updates.lng = lng;
  if (status !== undefined) updates.status = status;
  if (note !== undefined) updates.note = note;

  await db.update(motives).set(updates).where(eq(motives.id, motiveId));
  cache.delPrefix(`motives:list:${me.id}:`);

  // Auto-create chat when transitioning to confirmed
  if (status === 'confirmed') {
    const [updatedMotive] = await db
      .select({ title: motives.title })
      .from(motives)
      .where(eq(motives.id, motiveId))
      .limit(1);
    const attendeeRows = await db
      .select({ userId: motiveAttendees.userId })
      .from(motiveAttendees)
      .where(eq(motiveAttendees.motiveId, motiveId));
    await ensureMotiveChat(motiveId, updatedMotive?.title ?? 'Motive', attendeeRows.map((r) => r.userId));
  }

  return c.json({ ok: true });
});

// --- DELETE /api/motives/:id -- Soft delete (creator only) --------------------
motivesRoutes.delete('/:id', async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');

  const [motive] = await db
    .select({ creatorId: motives.creatorId })
    .from(motives)
    .where(eq(motives.id, motiveId))
    .limit(1);

  if (!motive) {
    return c.json({ error: 'Motive not found' }, 404);
  }

  if (motive.creatorId !== me.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db.update(motives).set({ status: 'cancelled' }).where(eq(motives.id, motiveId));
  cache.delPrefix(`motives:list:${me.id}:`);

  return c.json({ ok: true });
});

const rsvpSchema = z.object({ status: z.enum(['going', 'maybe', 'declined']) });
const confirmSchema = z.object({ happened: z.boolean() });
const inviteSchema = z.object({ userIds: z.array(z.string()).default([]) });

// --- POST /api/motives/:id/rsvp -- RSVP ---------------------------------------
motivesRoutes.post('/:id/rsvp', zValidator('json', rsvpSchema), async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');
  const { status } = c.req.valid('json');

  // Map incoming values to rsvpStatus column values
  const rsvpMap: Record<string, string> = {
    going: 'joined',
    maybe: 'going',
    declined: 'passed',
  };
  const rsvpStatus = rsvpMap[status];

  const [motiveRow] = await db
    .select({ id: motives.id, creatorId: motives.creatorId, title: motives.title })
    .from(motives)
    .where(eq(motives.id, motiveId))
    .limit(1);

  if (!motiveRow) {
    return c.json({ error: 'Motive not found' }, 404);
  }

  // Verify caller is an attendee before writing
  const [isRsvpAttendee] = await db
    .select({ motiveId: motiveAttendees.motiveId })
    .from(motiveAttendees)
    .where(and(eq(motiveAttendees.motiveId, motiveId), eq(motiveAttendees.userId, me.id)))
    .limit(1);
  if (!isRsvpAttendee) return c.json({ error: 'Not an attendee of this motive' }, 403);

  await db
    .update(motiveAttendees)
    .set({ rsvpStatus, respondedAt: new Date() })
    .where(and(eq(motiveAttendees.motiveId, motiveId), eq(motiveAttendees.userId, me.id)));

  cache.delPrefix(`motives:list:${me.id}:`);

  // N2 -- RSVP response push to creator
  if (motiveRow.creatorId !== me.id) {
    const verb: Record<string, string> = { going: 'is going', maybe: 'might come', declined: "can't make it" };
    void sendPush(motiveRow.creatorId, {
      title: motiveRow.title,
      body: `${me.name ?? 'Someone'} ${verb[status] ?? status}`,
      data: { screen: 'motives', motiveId },
    }).catch((err) => log.error({ err, motiveId }, 'motives RSVP push failed'));
  }

  return c.json({ ok: true });
});

// --- POST /api/motives/:id/confirm -- Confirm whether motive happened --------
// Called when the user taps "Yes it happened" or "No it was cancelled"
// in the post-motive confirmation prompt.
motivesRoutes.post('/:id/confirm', zValidator('json', confirmSchema), async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');
  const { happened } = c.req.valid('json');

  const [motive] = await db
    .select({ id: motives.id, creatorId: motives.creatorId, title: motives.title, status: motives.status })
    .from(motives)
    .where(eq(motives.id, motiveId))
    .limit(1);

  if (!motive) return c.json({ error: 'Motive not found' }, 404);

  // Only the creator or an attendee can confirm
  const [isAttendee] = await db
    .select({ motiveId: motiveAttendees.motiveId })
    .from(motiveAttendees)
    .where(and(eq(motiveAttendees.motiveId, motiveId), eq(motiveAttendees.userId, me.id)))
    .limit(1);

  if (!isAttendee && motive.creatorId !== me.id) {
    return c.json({ error: 'Not an attendee' }, 403);
  }

  const newStatus = happened ? 'past' : 'cancelled';
  await db
    .update(motives)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(motives.id, motiveId));

  cache.delPrefix(`motives:list:${me.id}:`);
  return c.json({ ok: true, status: newStatus });
});

// --- POST /api/motives/:id/invite -- Invite users post-creation ---------------
motivesRoutes.post('/:id/invite', zValidator('json', inviteSchema), async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');

  // Rate limit: 30 invites per user per hour
  const limitedInvite = rateLimit(c, `${me.id}:motive-invite`, API_LIMITS.motiveInvite.limit, API_LIMITS.motiveInvite.windowMs);
  if (limitedInvite) return limitedInvite;

  const { userIds } = c.req.valid('json');

  const [motive] = await db
    .select({ id: motives.id })
    .from(motives)
    .where(eq(motives.id, motiveId))
    .limit(1);

  if (!motive) {
    return c.json({ error: 'Motive not found' }, 404);
  }

  // Verify requestor is an attendee
  const [membership] = await db
    .select()
    .from(motiveAttendees)
    .where(and(eq(motiveAttendees.motiveId, motiveId), eq(motiveAttendees.userId, me.id)))
    .limit(1);

  if (!membership) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  if (userIds.length > 0) {
    await db
      .insert(motiveAttendees)
      .values(
        userIds.map((userId: string) => ({
          motiveId,
          userId,
          role: 'attendee',
          rsvpStatus: 'invited',
        }))
      )
      .onConflictDoNothing();
  }

  return c.json({ ok: true });
});

// --- POST /api/motives/:id/memory -- Save memory -------------------------------
motivesRoutes.post('/:id/memory', zValidator('json', memorySchema), async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');

  const {
    vibeTags = [],
    rating,
    venueRating,
    photoUrls = [],
  } = c.req.valid('json');

  const [motive] = await db
    .select({ id: motives.id })
    .from(motives)
    .where(eq(motives.id, motiveId))
    .limit(1);

  if (!motive) {
    return c.json({ error: 'Motive not found' }, 404);
  }

  // Verify caller is an attendee before writing
  const [isAttendee] = await db
    .select({ motiveId: motiveAttendees.motiveId })
    .from(motiveAttendees)
    .where(and(eq(motiveAttendees.motiveId, motiveId), eq(motiveAttendees.userId, me.id)))
    .limit(1);
  if (!isAttendee) return c.json({ error: 'Not an attendee of this motive' }, 403);

  // Upsert into motiveMemories
  await db
    .insert(motiveMemories)
    .values({
      motiveId,
      userId: me.id,
      vibeTags,
      rating,
      venueRating,
      photoUrls,
    })
    .onConflictDoNothing();

  // Update if already exists
  await db
    .update(motiveMemories)
    .set({ vibeTags, rating, venueRating, photoUrls })
    .where(and(eq(motiveMemories.motiveId, motiveId), eq(motiveMemories.userId, me.id)));

  // TODO: enqueue Inngest job motives/generate-memory-card

  posthog.capture({
    distinctId: me.id,
    event: 'memory_saved',
    properties: {
      motiveId,
      rating,
      venue_rating: venueRating,
      vibe_tag_count: vibeTags.length,
      photo_count: photoUrls.length,
    },
  });

  return c.json({ ok: true });
});

// --- GET /api/motives/:id/memory -- Get memory --------------------------------
motivesRoutes.get('/:id/memory', async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');

  const [memory] = await db
    .select()
    .from(motiveMemories)
    .where(and(eq(motiveMemories.motiveId, motiveId), eq(motiveMemories.userId, me.id)))
    .limit(1);

  if (!memory) {
    return c.json({ error: 'Memory not found' }, 404);
  }

  return c.json({ memory });
});
