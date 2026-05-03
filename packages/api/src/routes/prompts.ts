import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { dailyPrompts, promptResponses, circles, users } from '@berg/shared';
import { requireAuth } from '../middleware/auth.js';
import { enqueue } from '../lib/queue.js';
import { cache, TTL, CK } from '../lib/cache.js';
import { posthog } from '../lib/posthog.js';
import type { auth } from '../auth.js';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const promptRoutes = new Hono<{ Variables: Variables }>();
promptRoutes.use('*', requireAuth);

// GET /api/prompts/today
// The prompt itself is shared across all users -- cache until midnight.
// The user's personal response is always fetched fresh (per-user, changes on submit).
promptRoutes.get('/today', async (c) => {
  const me = c.get('user')!;
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = CK.promptToday(today);

  // Cache the prompt row (shared, same for all users all day)
  const prompt = await cache.wrap(
    cacheKey,
    TTL.PROMPT_TODAY(),
    async () => {
      const [row] = await db
        .select()
        .from(dailyPrompts)
        .where(eq(dailyPrompts.activeDate, today))
        .limit(1);
      return row ?? null;
    },
  );

  if (!prompt) {
    return c.json({ error: 'No prompt for today' }, 404);
  }

  // User response is always fresh -- it changes when user responds
  const [existing] = await db
    .select()
    .from(promptResponses)
    .where(and(eq(promptResponses.userId, me.id), eq(promptResponses.promptId, prompt.id)))
    .limit(1);

  return c.json({
    prompt: {
      ...prompt,
      options: (() => { try { return JSON.parse(prompt.options as string); } catch { return []; } })(),
    },
    userResponse: existing
      ? {
          optionKey: existing.optionKey,
          optionIndex: existing.optionIndex,
          storyText: existing.storyText,
          respondedAt: existing.respondedAt,
        }
      : null,
  });
});

// POST /api/prompts/:id/respond
promptRoutes.post(
  '/:id/respond',
  zValidator('json', z.object({
    optionKey: z.string(),
    optionIndex: z.number().int().min(0),
    storyText: z.string().max(280).optional(),
  })),
  async (c) => {
    const me = c.get('user')!;
    const promptId = c.req.param('id');
    const { optionKey, optionIndex, storyText } = c.req.valid('json');

    await db
      .insert(promptResponses)
      .values({
        userId: me.id,
        promptId,
        optionKey,
        optionIndex,
        storyText: storyText ?? null,
        responseText: '',
        respondedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [promptResponses.userId, promptResponses.promptId],
        set: {
          optionKey,
          optionIndex,
          storyText: storyText ?? null,
          respondedAt: new Date(),
        },
      });

    // Enqueue match-check job -- runs immediately, checks thresholds
    void enqueue('prompt/new-response', { promptId, userId: me.id, optionKey }).catch(() => {});

    posthog.capture({
      distinctId: me.id,
      event: 'prompt_answered',
      properties: { promptId, optionKey, has_story: !!storyText },
    });

    return c.json({ ok: true });
  }
);

// GET /api/prompts/:id/matches
promptRoutes.get('/:id/matches', async (c) => {
  const me = c.get('user')!;
  const promptId = c.req.param('id');

  const [myResponse] = await db
    .select()
    .from(promptResponses)
    .where(and(eq(promptResponses.userId, me.id), eq(promptResponses.promptId, promptId)))
    .limit(1);

  if (!myResponse || !myResponse.optionKey) {
    return c.json({ state: 'not_answered', matches: [], adjacentMatches: [], totalCount: 0 });
  }

  const matches = await db
    .select({
      userId: promptResponses.userId,
      name: users.name,
      avatarUrl: users.image,
      optionKey: promptResponses.optionKey,
      storyText: promptResponses.storyText,
    })
    .from(promptResponses)
    .innerJoin(users, eq(users.id, promptResponses.userId))
    .innerJoin(circles, and(
      eq(circles.friendId, promptResponses.userId),
      eq(circles.userId, me.id),
      eq(circles.status, 'confirmed')
    ))
    .where(and(
      eq(promptResponses.promptId, promptId),
      eq(promptResponses.optionKey, myResponse.optionKey ?? '')
    ))
    .limit(20);

  let adjacentMatches: typeof matches = [];
  if (myResponse.optionIndex !== null && myResponse.optionIndex !== undefined) {
    adjacentMatches = await db
      .select({
        userId: promptResponses.userId,
        name: users.name,
        avatarUrl: users.image,
        optionKey: promptResponses.optionKey,
        storyText: promptResponses.storyText,
      })
      .from(promptResponses)
      .innerJoin(users, eq(users.id, promptResponses.userId))
      .innerJoin(circles, and(
        eq(circles.friendId, promptResponses.userId),
        eq(circles.userId, me.id),
        eq(circles.status, 'confirmed')
      ))
      .where(and(
        eq(promptResponses.promptId, promptId),
        sql`ABS(${promptResponses.optionIndex} - ${myResponse.optionIndex}) = 1`
      ))
      .limit(5);
  }

  const state = matches.length > 0
    ? 'matches'
    : adjacentMatches.length > 0
    ? 'first_in_circle'
    : 'first_in_network';

  return c.json({
    state,
    matches,
    adjacentMatches,
    totalCount: matches.length,
  });
});
