import { Hono } from 'hono';
import { eq, and, inArray, count, sql } from 'drizzle-orm';
import { randomUUID, randomBytes } from 'crypto';
import { db } from '../db.js';
import {
  circles, users, fofSuggestions, vibeTags, userVibeTags,
  groupCircles, groupCircleMembers, chats, chatMembers,
  dailyPrompts, promptResponses,
} from '@berg/shared';
import { requireAuth } from '../middleware/auth.js';
import { sendPush, filterByPreference } from '../lib/notifications.js';
import { enqueue } from '../lib/queue.js';
import { rateLimiter, API_LIMITS } from '../lib/rate-limiter.js';
import { cache, TTL, CK } from '../lib/cache.js';
import type { auth } from '../auth.js';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const discoveryRoutes = new Hono<{ Variables: Variables }>();
discoveryRoutes.use('*', requireAuth);

// GET /api/discovery/people â€” FOF suggestions, cached 10 min per user
discoveryRoutes.get('/people', async (c) => {
  const me = c.get('user')!;

  // Serve from cache if available â€” FOF is recomputed every 24h
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

  // â”€â”€ Primary: read pre-computed FOF suggestions (DESC = best first, fixes ASC bug) â”€â”€
  const fofRows = await db
    .select({
      id: fofSuggestions.suggestedUserId,
      score: fofSuggestions.score,
      sharedTagCount: fofSuggestions.sharedTagCount,
      mutualFriendIds: fofSuggestions.mutualFriendIds,
    })
    .from(fofSuggestions)
    .where(eq(fofSuggestions.userId, me.id))
    .orderBy(sql`${fofSuggestions.score} DESC`)
    .limit(10);

  let suggestionMeta: typeof fofRows = fofRows;
  let userIds: string[] = fofRows.map((s) => s.id);

  // â”€â”€ Fallback: circle members not yet connected (for users with no FOF data) â”€â”€
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

  // â”€â”€ Fetch user details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const suggestedUsers = await db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      availabilityStatus: users.availabilityStatus,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  // â”€â”€ Resolve mutual friend names (bulk â€” one query for all) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Shared vibe tags (bulk â€” one query per candidate, batched) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Build response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  const result = { people };
  cache.set(CK.fof(me.id), result, TTL.FOF_SUGGESTIONS);
  c.header('X-Cache', 'MISS');
  return c.json(result);
});

// GET /api/discovery/circles â€” scored suggestions, cached 10 min per user
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

  // Index: circleId â†’ member IDs
  const circleMembersMap = new Map<string, string[]>();
  for (const r of allMemberRows) {
    if (!circleMembersMap.has(r.groupCircleId)) circleMembersMap.set(r.groupCircleId, []);
    circleMembersMap.get(r.groupCircleId)!.push(r.userId);
  }

  // Index: userId â†’ Set of tagIds
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
    // Use a simple emoji â†’ tag category mapping
    const emojiCategoryMap: Record<string, string[]> = {
      'ðŸ•': ['food', 'foodie'],
      'ðŸ•': ['outdoor', 'outdoors', 'active'],
      'â˜•': ['social', 'catchup'],
      'ðŸŽ¬': ['creative', 'culture'],
      'ðŸƒ': ['active', 'sport', 'fitness'],
      'ðŸŽ‰': ['social', 'party'],
      'ðŸŽ®': ['gaming', 'tech'],
      'âœˆï¸': ['travel', 'adventure'],
      'ðŸŽ¨': ['creative', 'art'],
      'ðŸ’»': ['tech', 'professional'],
      'ðŸ“š': ['intellectual', 'learning'],
      'ðŸŽµ': ['music', 'creative'],
    };
    // For simplicity in Phase 1: category match = 1 if circle has any friends inside
    // (proxy: if friends joined this category, it's likely relevant)
    const categoryScore = friendsInside.length > 0 ? 1 : 0;

    const totalScore = friendScore * 0.40 + tagScore * 0.40 + categoryScore * 0.20;

    return {
      id: gc.id,
      name: gc.name,
      categoryEmoji: gc.categoryEmoji,
      categoryColor: gc.categoryColor,
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

// GET /api/discovery/pulse â€” real cards based on live data
discoveryRoutes.get('/pulse', async (c) => {
  const me = c.get('user')!;
  const today = new Date().toISOString().split('T')[0];
  const cards: Array<{
    type: string; text: string; emoji: string; actionLabel: string;
    actionTarget: { type: string; id: string };
  }> = [];

  // Card 1: prompt participation â€” how many circle friends answered today
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
          emoji: 'ðŸ”¥',
          actionLabel: 'See who agreed',
          actionTarget: { type: 'prompt_reveal', id: todayPrompt.id },
        });
      }
    }
  }

  // Card 2: new circle member â€” someone in your circle joined a group recently
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
        emoji: 'ðŸ‘¥',
        actionLabel: 'Check it out',
        actionTarget: { type: 'circle', id: r.circleId },
      });
    }
  }

  return c.json({ cards: cards.slice(0, 3) });
});

// â”€â”€â”€ Separate router mounted at /api/circles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const circlesRoutes = new Hono<{ Variables: Variables }>();
circlesRoutes.use('*', requireAuth);

// POST /api/circles â€” Create a new group circle
circlesRoutes.post('/', async (c) => {
  const me = c.get('user')!;

  let body: {
    name?: string; description?: string; categoryEmoji?: string;
    categoryColor?: string; requiresApproval?: boolean; isPublic?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.name?.trim()) {
    return c.json({ error: 'Circle name is required' }, 400);
  }

  try {
    // Generate a unique 6-char alphanumeric join code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const makeCode = () =>
      Array.from(randomBytes(6)).map(b => chars[b % chars.length]).join('');

    let joinCode = makeCode();
    const existing = await db
      .select({ id: groupCircles.id })
      .from(groupCircles)
      .where(eq(groupCircles.joinCode, joinCode))
      .limit(1);
    if (existing.length > 0) joinCode = makeCode();

    const [circle] = await db
      .insert(groupCircles)
      .values({
        id: randomUUID(),
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        adminUserId: me.id,
        joinCode,
        requiresApproval: body.requiresApproval ?? false,
        isPublic: body.isPublic ?? true,
        categoryEmoji: body.categoryEmoji ?? 'ðŸ‘¥',
        categoryColor: body.categoryColor ?? '#e8f0fe',
        createdAt: new Date(),
      })
      .returning({ id: groupCircles.id, joinCode: groupCircles.joinCode });

    // Add creator as active member
    await db.insert(groupCircleMembers).values({
      groupCircleId: circle.id,
      userId: me.id,
      status: 'active',
      joinedAt: new Date(),
    });

    // Auto-create a group chat for this circle â€” every circle gets a chat
    const [chat] = await db
      .insert(chats)
      .values({
        id: randomUUID(),
        type: 'group',
        name: body.name!.trim(),
        groupCircleId: circle.id,
        createdAt: new Date(),
      })
      .returning({ id: chats.id });

    // Add creator as chat member
    await db.insert(chatMembers).values({
      chatId: chat.id,
      userId: me.id,
      joinedAt: new Date(),
    });

    return c.json({ id: circle.id, joinCode: circle.joinCode, chatId: chat.id }, 201);
  } catch (err) {
    console.error('[circles] create failed:', err);
    return c.json({ error: 'Failed to create circle. Please try again.' }, 500);
  }
});

circlesRoutes.post('/:id/join', async (c) => {
  const me = c.get('user')!;
  const circleId = c.req.param('id');

  const [circle] = await db
    .select()
    .from(groupCircles)
    .where(eq(groupCircles.id, circleId))
    .limit(1);

  if (!circle) return c.json({ error: 'Circle not found' }, 404);

  const status = circle.requiresApproval ? 'pending' : 'active';

  await db
    .insert(groupCircleMembers)
    .values({ groupCircleId: circleId, userId: me.id, status, joinedAt: new Date() })
    .onConflictDoNothing();

  // N5 â€” Circle join request push to admin (only when approval is required)
  if (circle.requiresApproval) {
    const eligible = await filterByPreference([circle.adminUserId], 'notifyCircleRequests');
    if (eligible.length > 0) {
      void sendPush(circle.adminUserId, {
        title: circle.name,
        body: `${me.name ?? 'Someone'} wants to join`,
        data: { screen: 'circle', circleId },
      }).catch(() => {});
    }
  }

  let chatId: string | null = null;
  if (status === 'active') {
    // Look up the circle's group chat by groupCircleId (reliable) not by name (fragile)
    const [existingChat] = await db
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.type, 'group'), eq(chats.groupCircleId, circleId)))
      .limit(1);

    if (existingChat) {
      // Chat already exists â€” add the new member
      chatId = existingChat.id;
      await db
        .insert(chatMembers)
        .values({ chatId, userId: me.id, joinedAt: new Date() })
        .onConflictDoNothing();
    } else {
      // No chat yet â€” create one and add ALL current active members
      const [newChat] = await db
        .insert(chats)
        .values({
          id: randomUUID(),
          type: 'group',
          name: circle.name,
          groupCircleId: circleId,
          createdAt: new Date(),
        })
        .returning({ id: chats.id });

      const activeMembers = await db
        .select({ userId: groupCircleMembers.userId })
        .from(groupCircleMembers)
        .where(and(eq(groupCircleMembers.groupCircleId, circleId), eq(groupCircleMembers.status, 'active')));

      if (activeMembers.length > 0) {
        await db
          .insert(chatMembers)
          .values(activeMembers.map(m => ({ chatId: newChat.id, userId: m.userId, joinedAt: new Date() })))
          .onConflictDoNothing();
      }

      chatId = newChat.id;
    }
  }

  const [{ value: memberCount }] = await db
    .select({ value: count() })
    .from(groupCircleMembers)
    .where(and(
      eq(groupCircleMembers.groupCircleId, circleId),
      eq(groupCircleMembers.status, 'active')
    ));

  // Invalidate circle suggestions and stats for this user
  cache.del(CK.circles(me.id));
  if (status === 'active') cache.del(CK.stats(me.id));

  return c.json({ ok: true, status, memberCount, chatId });
});

// POST /api/circles/request/:userId
circlesRoutes.post('/request/:userId', async (c) => {
  const me = c.get('user')!;
  const targetId = c.req.param('userId');
  if (targetId === me.id) return c.json({ error: 'Cannot connect with yourself' }, 400);

  // Rate limit: 30 connection requests per user per hour
  const rl = rateLimiter.check(
    `${me.id}:connection-request`,
    API_LIMITS.connectionRequest.limit,
    API_LIMITS.connectionRequest.windowMs,
  );
  if (!rl.allowed) {
    c.header('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return c.json({ error: 'Too many requests. Try again shortly.' }, 429);
  }
  await db.insert(circles).values({
    id: randomUUID(), userId: me.id, friendId: targetId, status: 'pending', createdAt: new Date(),
  }).onConflictDoNothing();

  // N3 â€” Connection request push
  const eligible = await filterByPreference([targetId], 'notifyCircleRequests');
  if (eligible.length > 0) {
    void sendPush(targetId, {
      title: me.name ?? 'Someone',
      body: 'wants to connect with you',
      data: { screen: 'connections' },
    }).catch(() => {});
  }

  return c.json({ ok: true });
});

// POST /api/circles/accept/:userId
circlesRoutes.post('/accept/:userId', async (c) => {
  const me = c.get('user')!;
  const requesterId = c.req.param('userId');
  await db.delete(circles).where(and(eq(circles.userId, requesterId), eq(circles.friendId, me.id), eq(circles.status, 'pending')));
  await db.insert(circles).values([
    { id: randomUUID(), userId: me.id, friendId: requesterId, status: 'confirmed', createdAt: new Date() },
    { id: randomUUID(), userId: requesterId, friendId: me.id, status: 'confirmed', createdAt: new Date() },
  ]).onConflictDoNothing();

  // N4 â€” Connection accepted push to the requester
  const eligible = await filterByPreference([requesterId], 'notifyCircleRequests');
  if (eligible.length > 0) {
    void sendPush(requesterId, {
      title: me.name ?? 'Someone',
      body: 'accepted your connection request',
      data: { screen: 'connections' },
    }).catch(() => {});
  }

  // Recompute FOF suggestions for both users â€” new connection changes the graph
  void Promise.all([
    enqueue('discovery/recompute-fof-user', { userId: me.id }),
    enqueue('discovery/recompute-fof-user', { userId: requesterId }),
  ]).catch(() => {});

  // Invalidate cached suggestions and stats for both users immediately
  cache.del(CK.fof(me.id));
  cache.del(CK.fof(requesterId));
  cache.del(CK.stats(me.id));
  cache.del(CK.stats(requesterId));

  return c.json({ ok: true });
});

// DELETE /api/circles/decline/:userId
circlesRoutes.delete('/decline/:userId', async (c) => {
  const me = c.get('user')!;
  const requesterId = c.req.param('userId');
  await db.delete(circles).where(and(eq(circles.userId, requesterId), eq(circles.friendId, me.id), eq(circles.status, 'pending')));
  return c.json({ ok: true });
});

// DELETE /api/circles/cancel/:userId â€” cancel a request I sent
circlesRoutes.delete('/cancel/:userId', async (c) => {
  const me = c.get('user')!;
  const targetId = c.req.param('userId');
  await db.delete(circles).where(
    and(eq(circles.userId, me.id), eq(circles.friendId, targetId), eq(circles.status, 'pending')),
  );
  return c.json({ ok: true });
});

// GET /api/circles/by-code/:code
circlesRoutes.get('/by-code/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const [circle] = await db.select().from(groupCircles).where(eq(groupCircles.joinCode, code)).limit(1);
  if (!circle) return c.json({ error: 'Circle not found' }, 404);
  const [{ value: memberCount }] = await db.select({ value: count() }).from(groupCircleMembers).where(and(eq(groupCircleMembers.groupCircleId, circle.id), eq(groupCircleMembers.status, 'active')));
  return c.json({ id: circle.id, name: circle.name, memberCount: Number(memberCount), requiresApproval: circle.requiresApproval });
});
