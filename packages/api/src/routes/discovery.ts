import { Hono } from 'hono';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  circles, users, fofSuggestions, vibeTags, userVibeTags,
  groupCircles, groupCircleMembers,
  dailyPrompts, promptResponses,
} from '@berg/shared';
import { requireAuth } from '../middleware/auth.js';
import { enqueue } from '../lib/queue.js';
import { cache, TTL, CK } from '../lib/cache.js';
import { hashPhone } from '../utils/crypto.js';
import type { auth } from '../auth.js';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const discoveryRoutes = new Hono<{ Variables: Variables }>();
discoveryRoutes.use('*', requireAuth);

// GET /api/discovery/people -- FOF suggestions, cached 10 min per user
discoveryRoutes.get('/people', async (c) => {
  const me = c.get('user')!;

  // Serve from cache if available -- FOF is recomputed every 24h
  const cached = cache.get<{ people: unknown[] }>(CK.fof(me.id));
  if (cached) {
    c.header('X-Cache', 'HIT');
    return c.json(cached);
  }

  // My tag IDs (needed for shared tag computation)
  const myTagIds = (await db
    .select({ tagId: userVibeTags.tagId })
    .from(userVibeTags)
    .where(eq(userVibeTags.userId, me.id))
  ).map((r) => r.tagId);

  // My confirmed friend IDs (exclude from suggestions + use for fallback)
  const myFriendIds = new Set((await db
    .select({ friendId: circles.friendId })
    .from(circles)
    .where(and(eq(circles.userId, me.id), eq(circles.status, 'confirmed')))
  ).map((r) => r.friendId));

  // -- Primary: read pre-computed FOF suggestions (DESC = best first, fixes ASC bug) --
  const fofRows = await db
    .select({
      id: fofSuggestions.suggestedUserId,
      score: fofSuggestions.score,
      sharedTagCount: fofSuggestions.sharedTagCount,
      mutualFriendIds: fofSuggestions.mutualFriendIds,
      computedAt: fofSuggestions.computedAt,
    })
    .from(fofSuggestions)
    .where(eq(fofSuggestions.userId, me.id))
    .orderBy(sql`${fofSuggestions.score} DESC`)
    .limit(10);

  let suggestionMeta: typeof fofRows = fofRows;
  let userIds: string[] = fofRows.map((s) => s.id);

  // -- Fallback: circle members not yet connected (for users with no FOF data) --
  if (fofRows.length < 5) {
    const myCircleIds = (await db
      .select({ gcId: groupCircleMembers.groupCircleId })
      .from(groupCircleMembers)
      .where(and(eq(groupCircleMembers.userId, me.id), eq(groupCircleMembers.status, 'active')))
    ).map((r) => r.gcId);

    if (myCircleIds.length > 0) {
      const circleMembers = await db
        .select({ userId: groupCircleMembers.userId })
        .from(groupCircleMembers)
        .where(
          and(
            inArray(groupCircleMembers.groupCircleId, myCircleIds),
            eq(groupCircleMembers.status, 'active'),
          ),
        )
        .limit(30);

      const existingIds = new Set(userIds);
      const fallbackIds = circleMembers
        .map((m) => m.userId)
        .filter((id) => id !== me.id && !myFriendIds.has(id) && !existingIds.has(id));

      // Deduplicate and take enough to fill up to 10 total
      const dedupedFallback = [...new Set(fallbackIds)].slice(0, 10 - userIds.length);

      // Add fallback entries with score 0 and no mutual info
      suggestionMeta = [
        ...suggestionMeta,
        ...dedupedFallback.map((id) => ({
          id,
          score: '0.00',
          sharedTagCount: 0,
          mutualFriendIds: [] as string[],
        })),
      ];
      userIds = [...userIds, ...dedupedFallback];
    }
  }

  if (userIds.length === 0) return c.json({ people: [] });

  // -- Fetch user details ----------------------------------------------------
  const suggestedUsers = await db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      availabilityStatus: users.availabilityStatus,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  // -- Resolve mutual friend names (bulk -- one query for all) ----------------
  const allMutualIds = [...new Set(
    suggestionMeta.flatMap((s) => (s.mutualFriendIds ?? []) as string[]),
  )];

  const mutualUsers: Record<string, string> = {};
  if (allMutualIds.length > 0) {
    const rows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, allMutualIds));
    for (const r of rows) mutualUsers[r.id] = r.name ?? 'a friend';
  }

  // -- Shared vibe tags (bulk -- one query per candidate, batched) -----------
  const sharedTagsMap: Record<string, Array<{ emoji: string; label: string }>> = {};
  if (myTagIds.length > 0 && userIds.length > 0) {
    const tagRows = await db
      .select({ userId: userVibeTags.userId, emoji: vibeTags.emoji, label: vibeTags.label })
      .from(userVibeTags)
      .innerJoin(vibeTags, eq(vibeTags.id, userVibeTags.tagId))
      .where(and(inArray(userVibeTags.userId, userIds), inArray(userVibeTags.tagId, myTagIds)));

    for (const r of tagRows) {
      if (!sharedTagsMap[r.userId]) sharedTagsMap[r.userId] = [];
      if (sharedTagsMap[r.userId].length < 3) {
        sharedTagsMap[r.userId].push({ emoji: r.emoji, label: r.label });
      }
    }
  }

  // -- Build response --------------------------------------------------------
  const metaById = Object.fromEntries(suggestionMeta.map((s) => [s.id, s]));

  const people = suggestedUsers.map((u) => {
    const meta = metaById[u.id];
    const firstMutualId = ((meta?.mutualFriendIds ?? []) as string[])[0];
    return {
      id: u.id,
      name: u.name,
      avatarUrl: u.image,
      availabilityStatus: u.availabilityStatus,
      mutualFriendName: firstMutualId ? (mutualUsers[firstMutualId] ?? null) : null,
      sharedVibeTags: sharedTagsMap[u.id] ?? [],
      fofScore: meta?.score ?? '0.00',
    };
  });

  // Sort by fofScore DESC (in case fallback mixed them)
  people.sort((a, b) => parseFloat(b.fofScore) - parseFloat(a.fofScore));

  // Most recent computedAt across all FOF rows (null if no FOF data yet)
  const lastComputedAt = fofRows.reduce<Date | null>((max, r) => {
    if (!r.computedAt) return max;
    return max === null || r.computedAt > max ? r.computedAt : max;
  }, null);

  const result = { people, lastComputedAt: lastComputedAt?.toISOString() ?? null };
  cache.set(CK.fof(me.id), result, TTL.FOF_SUGGESTIONS);
  c.header('X-Cache', 'MISS');
  return c.json(result);
});

// POST /api/discovery/people/recompute -- on-demand FOF recompute for current user
discoveryRoutes.post('/people/recompute', async (c) => {
  const me = c.get('user')!;
  cache.del(CK.fof(me.id));
  await enqueue('discovery/recompute-fof-user', { userId: me.id });
  return c.json({ queued: true });
});

// GET /api/discovery/circles -- scored suggestions, cached 10 min per user
discoveryRoutes.get('/circles', async (c) => {
  const me = c.get('user')!;

  const cached = cache.get<{ circles: unknown[] }>(CK.circles(me.id));
  if (cached) {
    c.header('X-Cache', 'HIT');
    return c.json(cached);
  }

  // Circles already joined (any status)
  const alreadyJoined = new Set((await db
    .select({ id: groupCircleMembers.groupCircleId })
    .from(groupCircleMembers)
    .where(eq(groupCircleMembers.userId, me.id))
  ).map((r) => r.id));

  // All public circles not yet joined
  const allCircles = await db
    .select()
    .from(groupCircles)
    .where(eq(groupCircles.isPublic, true))
    .limit(50);

  const eligibleCircles = allCircles.filter((gc) => !alreadyJoined.has(gc.id));
  if (eligibleCircles.length === 0) return c.json({ circles: [] });

  // My confirmed friends
  const myFriendIds = new Set((await db
    .select({ friendId: circles.friendId })
    .from(circles)
    .where(and(eq(circles.userId, me.id), eq(circles.status, 'confirmed')))
  ).map((r) => r.friendId));

  // My vibe tag IDs
  const myTagIds = new Set((await db
    .select({ tagId: userVibeTags.tagId })
    .from(userVibeTags)
    .where(eq(userVibeTags.userId, me.id))
  ).map((r) => r.tagId));

  // Bulk fetch all active members for eligible circles
  const eligibleIds = eligibleCircles.map((gc) => gc.id);
  const allMemberRows = await db
    .select({
      groupCircleId: groupCircleMembers.groupCircleId,
      userId: groupCircleMembers.userId,
    })
    .from(groupCircleMembers)
    .where(
      and(
        inArray(groupCircleMembers.groupCircleId, eligibleIds),
        eq(groupCircleMembers.status, 'active'),
      ),
    );

  // Bulk fetch vibe tags for all unique members (to compute tag alignment)
  const uniqueMemberIds = [...new Set(allMemberRows.map((r) => r.userId))];
  const memberTagRows = uniqueMemberIds.length > 0
    ? await db
        .select({ userId: userVibeTags.userId, tagId: userVibeTags.tagId })
        .from(userVibeTags)
        .where(inArray(userVibeTags.userId, uniqueMemberIds))
    : [];

  // Index: circleId -> member IDs
  const circleMembersMap = new Map<string, string[]>();
  for (const r of allMemberRows) {
    if (!circleMembersMap.has(r.groupCircleId)) circleMembersMap.set(r.groupCircleId, []);
    circleMembersMap.get(r.groupCircleId)!.push(r.userId);
  }

  // Index: userId -> Set of tagIds
  const memberTagsMap = new Map<string, Set<string>>();
  for (const r of memberTagRows) {
    if (!memberTagsMap.has(r.userId)) memberTagsMap.set(r.userId, new Set());
    memberTagsMap.get(r.userId)!.add(r.tagId);
  }

  // Score each eligible circle
  const scored = eligibleCircles.map((gc) => {
    const memberIds = circleMembersMap.get(gc.id) ?? [];
    const memberCount = memberIds.length;

    // 1. Friend presence (40%): friends inside / min(memberCount, 5)
    const friendsInside = memberIds.filter((id) => myFriendIds.has(id));
    const friendScore = memberCount > 0
      ? Math.min(friendsInside.length / Math.min(memberCount, 5), 1)
      : 0;

    // 2. Tag alignment (40%): % of members who share â‰¥1 tag with me
    let membersWithSharedTag = 0;
    if (myTagIds.size > 0) {
      for (const memberId of memberIds) {
        const theirTags = memberTagsMap.get(memberId);
        if (theirTags) {
          for (const tagId of myTagIds) {
            if (theirTags.has(tagId)) { membersWithSharedTag++; break; }
          }
        }
      }
    }
    const tagScore = memberCount > 0 ? membersWithSharedTag / memberCount : 0;

    // 3. Category match (20%): circle emoji matches a category whose tags I have
    // Use a simple emoji -> tag category mapping
    const emojiCategoryMap: Record<string, string[]> = {
      '🍕': ['food', 'foodie'],
      'ðŸ•': ['outdoor', 'outdoors', 'active'],
      '☕': ['social', 'catchup'],
      '🎬': ['creative', 'culture'],
      'ðŸƒ': ['active', 'sport', 'fitness'],
      '🎉': ['social', 'party'],
      '🎮': ['gaming', 'tech'],
      '✈️': ['travel', 'adventure'],
      '🎨': ['creative', 'art'],
      '💻': ['tech', 'professional'],
      '📚': ['intellectual', 'learning'],
      '🎵': ['music', 'creative'],
    };
    // For simplicity in Phase 1: category match = 1 if circle has any friends inside
    // (proxy: if friends joined this category, it's likely relevant)
    const categoryScore = friendsInside.length > 0 ? 1 : 0;

    const totalScore = friendScore * 0.40 + tagScore * 0.40 + categoryScore * 0.20;

    return {
      id: gc.id,
      name: gc.name,
      description: gc.description ?? null,
      categoryEmoji: gc.categoryEmoji,
      categoryColor: gc.categoryColor,
      coverImage: gc.coverImage ?? null,
      memberCount,
      friendsInsideCount: friendsInside.length,
      requiresApproval: gc.requiresApproval,
      score: totalScore,
    };
  });

  // Sort by score DESC, return top 5
  scored.sort((a, b) => b.score - a.score);
  const circleResult = { circles: scored.slice(0, 5).map(({ score: _, ...rest }) => rest) };

  cache.set(CK.circles(me.id), circleResult, TTL.CIRCLE_SUGGESTIONS);
  c.header('X-Cache', 'MISS');
  return c.json(circleResult);
});

// GET /api/discovery/pulse -- real cards based on live data
discoveryRoutes.get('/pulse', async (c) => {
  const me = c.get('user')!;
  const today = new Date().toISOString().split('T')[0];
  const cards: Array<{
    type: string; text: string; emoji: string; actionLabel: string;
    actionTarget: { type: string; id: string };
  }> = [];

  // Card 1: prompt participation -- how many circle friends answered today
  const [todayPrompt] = await db
    .select({ id: dailyPrompts.id })
    .from(dailyPrompts)
    .where(eq(dailyPrompts.activeDate, today))
    .limit(1);

  if (todayPrompt) {
    const myFriendIds = (await db
      .select({ friendId: circles.friendId })
      .from(circles)
      .where(and(eq(circles.userId, me.id), eq(circles.status, 'confirmed')))
    ).map((r) => r.friendId);

    if (myFriendIds.length > 0) {
      // Check if I've already answered
      const [myResponse] = await db
        .select({ id: promptResponses.promptId })
        .from(promptResponses)
        .where(and(eq(promptResponses.userId, me.id), eq(promptResponses.promptId, todayPrompt.id)))
        .limit(1);

      const respondedFriends = await db
        .select({ userId: promptResponses.userId })
        .from(promptResponses)
        .where(and(
          eq(promptResponses.promptId, todayPrompt.id),
          inArray(promptResponses.userId, myFriendIds)
        ));

      if (respondedFriends.length >= 1 && myResponse) {
        cards.push({
          type: 'prompt_participation',
          text: `${respondedFriends.length} people in your circle answered today's prompt`,
          emoji: '🔥',
          actionLabel: 'See who agreed',
          actionTarget: { type: 'prompt_reveal', id: todayPrompt.id },
        });
      }
    }
  }

  // Card 2: new circle member -- someone in your circle joined a group recently
  const myFriendIdsFull = (await db
    .select({ friendId: circles.friendId })
    .from(circles)
    .where(and(eq(circles.userId, me.id), eq(circles.status, 'confirmed')))
  ).map((r) => r.friendId);

  if (myFriendIdsFull.length > 0) {
    const recentJoin = await db
      .select({
        userId: groupCircleMembers.userId,
        circleId: groupCircleMembers.groupCircleId,
        circleName: groupCircles.name,
        userName: users.name,
      })
      .from(groupCircleMembers)
      .innerJoin(groupCircles, eq(groupCircles.id, groupCircleMembers.groupCircleId))
      .innerJoin(users, eq(users.id, groupCircleMembers.userId))
      .where(and(
        inArray(groupCircleMembers.userId, myFriendIdsFull),
        eq(groupCircleMembers.status, 'active')
      ))
      .orderBy(groupCircleMembers.joinedAt)
      .limit(1);

    if (recentJoin[0]) {
      const r = recentJoin[0];
      cards.push({
        type: 'new_circle_member',
        text: `${r.userName?.split(' ')[0]} joined ${r.circleName}`,
        emoji: '👥',
        actionLabel: 'Check it out',
        actionTarget: { type: 'circle', id: r.circleId },
      });
    }
  }

  return c.json({ cards: cards.slice(0, 3) });
});

const contactsSyncSchema = z.object({ phones: z.array(z.string()).default([]) });

// POST /api/discovery/contacts/sync -- find Berg users from device contacts
discoveryRoutes.post('/contacts/sync', zValidator('json', contactsSyncSchema), async (c) => {
  const me = c.get('user')!;
  const { phones: rawPhones } = c.req.valid('json');

  if (rawPhones.length === 0) {
    return c.json({ users: [] });
  }

  const phones = rawPhones.slice(0, 500);
  const hashes = phones.map((p) => hashPhone(p));

  const matched = await db
    .select({ id: users.id, name: users.name, username: users.username, image: users.image })
    .from(users)
    .where(and(inArray(users.phoneHash, hashes), sql`${users.id} != ${me.id}`));

  if (matched.length === 0) {
    await db.update(users).set({ contactSyncGranted: true }).where(eq(users.id, me.id));
    return c.json({ users: [] });
  }

  const matchedIds = matched.map((u) => u.id);
  const existing = await db
    .select({ friendId: circles.friendId })
    .from(circles)
    .where(and(eq(circles.userId, me.id), inArray(circles.friendId, matchedIds)));

  const connectedSet = new Set(existing.map((r) => r.friendId));

  const result = matched
    .filter((u) => !connectedSet.has(u.id))
    .map((u) => ({ ...u, connectionStatus: null as 'pending' | 'confirmed' | null }));

  await db.update(users).set({ contactSyncGranted: true }).where(eq(users.id, me.id));

  return c.json({ users: result });
});
