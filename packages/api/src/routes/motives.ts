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
} from '@berg/shared';
import { requireAuth } from '../middleware/auth.js';
import { sendPush, sendPushBatch, filterByPreference } from '../lib/notifications.js';
import { enqueueAt } from '../lib/queue.js';
import { rateLimiter, API_LIMITS } from '../lib/rate-limiter.js';
import { cache, CK } from '../lib/cache.js';
import { posthog } from '../lib/posthog.js';
import type { auth } from '../auth.js';

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
  invitedUserIds: z.array(z.string().uuid()).max(50).default([]),
  invitedCircleIds: z.array(z.string().uuid()).max(20).default([]),
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

// â”€â”€â”€ POST /api/motives â€” Create motive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
motivesRoutes.post('/', zValidator('json', createMotiveSchema), async (c) => {
  const me = c.get('user')!;

  // Rate limit: 20 motives per user per hour
  const rl = rateLimiter.check(
    `${me.id}:motive-create`,
    API_LIMITS.motiveCreate.limit,
    API_LIMITS.motiveCreate.windowMs,
  );
  if (!rl.allowed) {
    c.header('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return c.json({ error: 'Too many requests. Try again shortly.' }, 429);
  }

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

  const [motive] = await db
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
    })
    .returning({ id: motives.id });

  // Insert creator as organiser attendee
  await db.insert(motiveAttendees).values({
    motiveId: motive.id,
    userId: me.id,
    role: 'organiser',
    rsvpStatus: 'joined',
  });

  // Insert invited users as attendees â€” filter to only real user IDs first
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

  // N1 â€” Motive invite push notifications
  if (invitedUserIds.length > 0 && status !== 'draft') {
    const eligible = await filterByPreference(invitedUserIds, 'notifyMotiveInvites');
    if (eligible.length > 0) {
      const [creator] = await db.select({ name: users.name }).from(users).where(eq(users.id, me.id)).limit(1);
      void sendPushBatch(eligible, {
        title: creator?.name ?? 'Someone',
        body: `invited you â€” ${title}`,
        data: { screen: 'motives', motiveId: motive.id },
      }).catch(() => {});
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
    ]).catch(() => {});
  }

  // Auto-create group chat when motive is sent as confirmed
  if (status === 'confirmed') {
    const allIds = [me.id, ...(invitedUserIds ?? [])];
    await ensureMotiveChat(motive.id, title, allIds);
  }

  // Invalidate profile stats â€” motive count changed
  cache.del(CK.stats(me.id));

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
});

// â”€â”€â”€ GET /api/motives â€” List user's motives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
motivesRoutes.get('/', async (c) => {
  const me = c.get('user')!;
  const filter = c.req.query('filter') ?? 'all';

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

  return c.json({ motives: result });
});

// â”€â”€â”€ GET /api/motives/:id â€” Motive detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // Basic activity feed â€” last 5 attendees who responded (status changes)
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

// â”€â”€â”€ PATCH /api/motives/:id â€” Update motive (creator only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ DELETE /api/motives/:id â€” Soft delete (creator only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  return c.json({ ok: true });
});

// â”€â”€â”€ POST /api/motives/:id/rsvp â€” RSVP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
motivesRoutes.post('/:id/rsvp', async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');
  const body = await c.req.json();
  const { status } = body as { status: 'going' | 'maybe' | 'declined' };

  if (!['going', 'maybe', 'declined'].includes(status)) {
    return c.json({ error: 'status must be going, maybe, or declined' }, 400);
  }

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

  // N2 â€” RSVP response push to creator
  if (motiveRow.creatorId !== me.id) {
    const verb: Record<string, string> = { going: 'is going', maybe: 'might come', declined: "can't make it" };
    void sendPush(motiveRow.creatorId, {
      title: motiveRow.title,
      body: `${me.name ?? 'Someone'} ${verb[status] ?? status}`,
      data: { screen: 'motives', motiveId },
    }).catch(() => {});
  }

  return c.json({ ok: true });
});

// â”€â”€â”€ POST /api/motives/:id/confirm â€” Confirm whether motive happened â”€â”€â”€â”€â”€â”€â”€â”€
// Called when the user taps "Yes it happened" or "No it was cancelled"
// in the post-motive confirmation prompt.
motivesRoutes.post('/:id/confirm', async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');
  const { happened } = await c.req.json<{ happened: boolean }>();

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

  return c.json({ ok: true, status: newStatus });
});

// â”€â”€â”€ POST /api/motives/:id/invite â€” Invite users post-creation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
motivesRoutes.post('/:id/invite', async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');

  // Rate limit: 30 invites per user per hour
  const rlInvite = rateLimiter.check(
    `${me.id}:motive-invite`,
    API_LIMITS.motiveInvite.limit,
    API_LIMITS.motiveInvite.windowMs,
  );
  if (!rlInvite.allowed) {
    c.header('Retry-After', String(Math.ceil((rlInvite.resetAt - Date.now()) / 1000)));
    return c.json({ error: 'Too many requests. Try again shortly.' }, 429);
  }

  const body = await c.req.json();
  const { userIds = [] } = body as { userIds: string[] };

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

// â”€â”€â”€ POST /api/motives/:id/memory â€” Save memory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ GET /api/motives/:id/memory â€” Get memory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
