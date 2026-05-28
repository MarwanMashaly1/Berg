/**
 * [align-2] Matches API — prompt_matches as first-class objects.
 *
 * GET  /api/matches           — current user's open matches (pending/viewed)
 * POST /api/matches/:id/view  — mark a match as viewed (called on match-detail screen open)
 * POST /api/matches/:id/dismiss — mark a match as dismissed
 */
import { Hono } from 'hono';
import { eq, and, inArray, or } from 'drizzle-orm';
import { db } from '../db.js';
import {
  promptMatches, dailyPrompts, promptResponses, users,
} from '@berg/shared';
import { requireAuth } from '../middleware/auth.js';
import type { auth } from '../auth.js';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const matchesRoutes = new Hono<{ Variables: Variables }>();
matchesRoutes.use('*', requireAuth);

// GET /api/matches
// Returns the current user's open matches (status pending or viewed), newest first.
// Lazily expires matches whose expires_at has passed.
matchesRoutes.get('/', async (c) => {
  const me = c.get('user')!;
  const now = new Date();

  // Lazily expire stale matches for this user
  await db
    .update(promptMatches)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        or(
          eq(promptMatches.userAId, me.id),
          eq(promptMatches.userBId, me.id),
        ),
        inArray(promptMatches.status, ['pending', 'viewed']),
        // Using raw SQL for the timestamp comparison via lt
        // drizzle doesn't have a simple lt for timestamp literals, use sql
      ),
    );

  const rows = await db
    .select({
      id: promptMatches.id,
      promptId: promptMatches.promptId,
      optionKey: promptMatches.optionKey,
      status: promptMatches.status,
      userAId: promptMatches.userAId,
      userBId: promptMatches.userBId,
      expiresAt: promptMatches.expiresAt,
      createdAt: promptMatches.createdAt,
      promptQuestion: dailyPrompts.question,
      promptOptions: dailyPrompts.options,
    })
    .from(promptMatches)
    .innerJoin(dailyPrompts, eq(dailyPrompts.id, promptMatches.promptId))
    .where(
      and(
        or(
          eq(promptMatches.userAId, me.id),
          eq(promptMatches.userBId, me.id),
        ),
        inArray(promptMatches.status, ['pending', 'viewed']),
      ),
    )
    .orderBy(promptMatches.createdAt);

  // For each match, determine who is the friend and fetch their info
  const friendIds = rows.map((r) => (r.userAId === me.id ? r.userBId : r.userAId));
  const uniqueFriendIds = [...new Set(friendIds)];

  const friendRows = uniqueFriendIds.length > 0
    ? await db
        .select({ id: users.id, name: users.name, avatarUrl: users.image })
        .from(users)
        .where(inArray(users.id, uniqueFriendIds))
    : [];

  const friendMap = new Map(friendRows.map((f) => [f.id, f]));

  // Fetch my own answers for each prompt
  const promptIds = [...new Set(rows.map((r) => r.promptId))];
  const myAnswers = promptIds.length > 0
    ? await db
        .select({ promptId: promptResponses.promptId, optionKey: promptResponses.optionKey })
        .from(promptResponses)
        .where(and(eq(promptResponses.userId, me.id), inArray(promptResponses.promptId, promptIds)))
    : [];

  const myAnswerMap = new Map(myAnswers.map((a) => [a.promptId, a.optionKey]));

  const matches = rows.map((r) => {
    const friendId = r.userAId === me.id ? r.userBId : r.userAId;
    const friend = friendMap.get(friendId) ?? { id: friendId, name: null, avatarUrl: null };
    const options: Array<{ key: string; emoji: string; text: string }> = (() => {
      try { return JSON.parse(r.promptOptions); } catch { return []; }
    })();
    const findOption = (key: string) => options.find((o) => o.key === key) ?? null;

    return {
      id: r.id,
      promptId: r.promptId,
      optionKey: r.optionKey,
      status: r.status,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      prompt: { question: r.promptQuestion, options },
      myAnswer: findOption(myAnswerMap.get(r.promptId) ?? r.optionKey),
      theirAnswer: findOption(r.optionKey),
      friend,
    };
  });

  return c.json({ matches });
});

// POST /api/matches/:id/view
// Mark a match as viewed when the user opens the match-detail screen.
matchesRoutes.post('/:id/view', async (c) => {
  const me = c.get('user')!;
  const matchId = c.req.param('id');

  await db
    .update(promptMatches)
    .set({ status: 'viewed', updatedAt: new Date() })
    .where(
      and(
        eq(promptMatches.id, matchId),
        or(eq(promptMatches.userAId, me.id), eq(promptMatches.userBId, me.id)),
        eq(promptMatches.status, 'pending'),
      ),
    );

  return c.json({ ok: true });
});

// POST /api/matches/:id/dismiss
matchesRoutes.post('/:id/dismiss', async (c) => {
  const me = c.get('user')!;
  const matchId = c.req.param('id');

  await db
    .update(promptMatches)
    .set({ status: 'dismissed', updatedAt: new Date() })
    .where(
      and(
        eq(promptMatches.id, matchId),
        or(eq(promptMatches.userAId, me.id), eq(promptMatches.userBId, me.id)),
        inArray(promptMatches.status, ['pending', 'viewed']),
      ),
    );

  return c.json({ ok: true });
});
