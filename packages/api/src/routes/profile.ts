import { Hono } from 'hono';
import { eq, and, inArray, count } from 'drizzle-orm';
import { db } from '../db.js';
import {
  circles, users, groupCircles, groupCircleMembers,
  vibeTags, userVibeTags,
} from '@berg/shared';
import { requireAuth } from '../middleware/auth.js';
import { cache, TTL, CK } from '../lib/cache.js';
import type { auth } from '../auth.js';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const profileRoutes = new Hono<{ Variables: Variables }>();
profileRoutes.use('*', requireAuth);

// GET /api/profile/stats -- cached per user for 2 min, invalidated on mutations
profileRoutes.get('/stats', async (c) => {
  const me = c.get('user')!;
  const stats = await cache.wrap(
    CK.stats(me.id),
    TTL.PROFILE_STATS,
    async () => {
      const [connRows, circleRows] = await Promise.all([
        db.select({ count: count() }).from(circles).where(and(eq(circles.userId, me.id), eq(circles.status, 'confirmed'))),
        db.select({ count: count() }).from(groupCircleMembers).where(and(eq(groupCircleMembers.userId, me.id), eq(groupCircleMembers.status, 'active'))),
      ]);
      return {
        connections: Number(connRows[0]?.count ?? 0),
        circles: Number(circleRows[0]?.count ?? 0),
        motives: 0,
      };
    },
  );
  return c.json(stats);
});

// GET /api/profile/connections
// Returns: confirmed connections, incoming pending requests, sent pending requests
profileRoutes.get('/connections', async (c) => {
  const me = c.get('user')!;

  // Run all three circle queries in parallel
  const [confirmedRows, incomingRows, sentRows, myTagRows] = await Promise.all([
    // Confirmed connections (I confirmed them)
    db.select({ id: users.id, name: users.name, image: users.image, availabilityStatus: users.availabilityStatus })
      .from(circles)
      .innerJoin(users, eq(users.id, circles.friendId))
      .where(and(eq(circles.userId, me.id), eq(circles.status, 'confirmed'))),

    // Incoming requests (they requested me, I haven't responded)
    db.select({ id: users.id, name: users.name, image: users.image })
      .from(circles)
      .innerJoin(users, eq(users.id, circles.userId))
      .where(and(eq(circles.friendId, me.id), eq(circles.status, 'pending'))),

    // Sent requests (I requested them, they haven't responded)
    db.select({ id: users.id, name: users.name, image: users.image })
      .from(circles)
      .innerJoin(users, eq(users.id, circles.friendId))
      .where(and(eq(circles.userId, me.id), eq(circles.status, 'pending'))),

    // My vibe tag IDs
    db.select({ tagId: userVibeTags.tagId }).from(userVibeTags).where(eq(userVibeTags.userId, me.id)),
  ]);

  const myTagIds = myTagRows.map((r) => r.tagId);

  // Bulk fetch shared vibe tags for all confirmed connections in 2 queries (not N+1)
  let sharedTagsMap: Record<string, Array<{ emoji: string; label: string }>> = {};
  if (myTagIds.length > 0 && confirmedRows.length > 0) {
    const confirmedIds = confirmedRows.map((u) => u.id);

    const allTagRows = await db
      .select({ userId: userVibeTags.userId, emoji: vibeTags.emoji, label: vibeTags.label })
      .from(userVibeTags)
      .innerJoin(vibeTags, eq(vibeTags.id, userVibeTags.tagId))
      .where(and(inArray(userVibeTags.userId, confirmedIds), inArray(userVibeTags.tagId, myTagIds)));

    for (const r of allTagRows) {
      if (!sharedTagsMap[r.userId]) sharedTagsMap[r.userId] = [];
      if (sharedTagsMap[r.userId].length < 3) {
        sharedTagsMap[r.userId].push({ emoji: r.emoji, label: r.label });
      }
    }
  }

  const confirmed = confirmedRows.map((u) => ({
    ...u,
    sharedVibeTags: sharedTagsMap[u.id] ?? [],
  }));

  return c.json({ confirmed, pending: incomingRows, sent: sentRows });
});

// GET /api/profile/circles
profileRoutes.get('/circles', async (c) => {
  const me = c.get('user')!;
  const myFriendIds = (await db.select({ friendId: circles.friendId }).from(circles).where(and(eq(circles.userId, me.id), eq(circles.status, 'confirmed')))).map(r => r.friendId);

  const memberships = await db
    .select({ groupCircleId: groupCircleMembers.groupCircleId })
    .from(groupCircleMembers)
    .where(and(eq(groupCircleMembers.userId, me.id), eq(groupCircleMembers.status, 'active')));

  if (memberships.length === 0) return c.json({ joined: [] });

  const circleIds = memberships.map(m => m.groupCircleId);
  const joinedCircles = await db.select().from(groupCircles).where(inArray(groupCircles.id, circleIds));

  // Bulk fetch all members for all circles in one query
  const allCircleMembers = await db
    .select({ groupCircleId: groupCircleMembers.groupCircleId, userId: groupCircleMembers.userId })
    .from(groupCircleMembers)
    .where(and(inArray(groupCircleMembers.groupCircleId, circleIds), eq(groupCircleMembers.status, 'active')));

  // Bulk fetch user previews for all unique member IDs in one query
  const allMemberUserIds = [...new Set(allCircleMembers.map((m) => m.userId))];
  const allUserPreviews = allMemberUserIds.length > 0
    ? await db.select({ id: users.id, name: users.name, image: users.image }).from(users).where(inArray(users.id, allMemberUserIds))
    : [];

  const userPreviewById = new Map(allUserPreviews.map((u) => [u.id, u]));

  const memberIdsByCircle = new Map<string, string[]>();
  for (const m of allCircleMembers) {
    const list = memberIdsByCircle.get(m.groupCircleId) ?? [];
    list.push(m.userId);
    memberIdsByCircle.set(m.groupCircleId, list);
  }

  const joined = joinedCircles.map((gc) => {
    const memberIds = memberIdsByCircle.get(gc.id) ?? [];
    const friendsInsideCount = myFriendIds.filter((id) => memberIds.includes(id)).length;
    const memberPreviews = memberIds
      .slice(0, 3)
      .map((id) => userPreviewById.get(id))
      .filter((u): u is NonNullable<typeof u> => !!u);
    return { id: gc.id, name: gc.name, categoryEmoji: gc.categoryEmoji, categoryColor: gc.categoryColor, memberCount: memberIds.length, friendsInsideCount, memberPreviews };
  });

  return c.json({ joined });
});
