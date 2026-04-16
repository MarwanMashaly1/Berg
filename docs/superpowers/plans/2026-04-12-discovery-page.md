# Discovery Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Discovery tab — cinematic prompt card with 5 answer types, full-screen match reveal, compact people rows, circle discovery, and the Circle Pulse activity layer.

**Architecture:** Schema-first (add new columns + run migration), then API endpoints (7 new routes across 2 files), then mobile UI (5 feature components composing into the Discovery screen). Each layer is independently testable before the next begins.

**Tech Stack:** Hono + Drizzle ORM (API), Expo Router + React Native (mobile), Supabase Postgres, `@tanstack/react-query` for server state, existing `apiFetch` auth wrapper, existing `useTheme` design tokens.

**Spec:** `docs/superpowers/specs/2026-04-12-discovery-page-design.md`

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `packages/api/src/routes/prompts.ts` | GET today's prompt, POST response, GET matches |
| `packages/api/src/routes/discovery.ts` | GET people, GET circles, POST join circle, GET pulse |
| `apps/mobile/components/features/discovery/PromptCard.tsx` | Cinematic prompt card (all 5 types, unanswered + compact answered) |
| `apps/mobile/components/features/discovery/MatchReveal.tsx` | Full-screen match reveal overlay (states A/B/C) |
| `apps/mobile/components/features/discovery/PeopleSection.tsx` | Compact collapsible FOF rows |
| `apps/mobile/components/features/discovery/CirclesSection.tsx` | Circle suggestion rows + join flow |
| `apps/mobile/components/features/discovery/CirclePulse.tsx` | 2-3 curated action cards |

### Modified files
| File | Change |
|---|---|
| `packages/shared/src/schema/prompts.ts` | Add `type`, `options`, `tags`, `is_universal` to `dailyPrompts`; add `option_key`, `option_index`, `story_text` to `promptResponses`; deprecate `response_text` |
| `packages/shared/src/schema/social.ts` | Add `categoryEmoji`, `categoryColor` columns to `groupCircles` |
| `packages/api/src/index.ts` | Register `promptRoutes`, `discoveryRoutes`, `circlesRoutes` |
| `apps/mobile/app/(app)/(tabs)/discovery/index.tsx` | Replace stub with composed screen |
| `apps/mobile/lib/api.ts` | Add discovery API helper functions |

---

## Task 1: Migrate the schema

**Files:**
- Modify: `packages/shared/src/schema/prompts.ts`
- Run: `packages/api/drizzle.config.ts` migration

- [ ] **Read the current schema**

  Open `packages/shared/src/schema/prompts.ts`. Note the existing `dailyPrompts` and `promptResponses` table definitions.

- [ ] **Add columns to `dailyPrompts`**

  Add these fields to the `dailyPrompts` table definition (after `activeDate`):
  ```ts
  type: text('type').notNull().default('pick_your_camp'),
  // pick_your_camp | spectrum | this_or_that | for_you | have_you_ever
  options: text('options').notNull().default('[]'),
  // JSON string: array of {key, emoji, text, index}
  tags: text('tags').array().notNull().default([]),
  isUniversal: boolean('is_universal').notNull().default(true),
  ```

- [ ] **Add columns to `promptResponses`**

  Add these fields to the `promptResponses` table definition (after `respondedAt`):
  ```ts
  optionKey: text('option_key'),          // which option was selected; nullable for old data
  optionIndex: integer('option_index'),   // 0-based position; used for adjacent matching
  storyText: text('story_text'),          // optional elaboration (replaces responseText in new code)
  // IMPORTANT: Do NOT change responseText to nullable — keep notNull().
  // New API code writes responseText: '' (empty string shim) for backward compatibility.
  // New code only reads optionKey + storyText. responseText is fully ignored going forward.
  ```
  Add `integer` to the drizzle import at the top of the file.

- [ ] **Add categoryEmoji and categoryColor to `groupCircles` in `social.ts`**

  Open `packages/shared/src/schema/social.ts`. Add two new fields to the `groupCircles` table (after `requiresApproval`):
  ```ts
  categoryEmoji: text('category_emoji').notNull().default('👥'),
  categoryColor: text('category_color').notNull().default('#e8f0fe'),
  ```
  These are used by the Discovery circles section to render colored icons per circle category.

- [ ] **Generate and apply the migration**

  ```bash
  cd /Users/marwanmashaly/projects/iceTest/Icebreak/.worktrees/phase-0/packages/api
  DATABASE_URL="postgresql://postgres:IceBreak%402675@db.qzzhbyaejtmbayllyrnb.supabase.co:5432/postgres" npx drizzle-kit generate
  DATABASE_URL="postgresql://postgres:IceBreak%402675@db.qzzhbyaejtmbayllyrnb.supabase.co:5432/postgres" npx drizzle-kit migrate
  ```

- [ ] **Verify TypeScript compiles**

  ```bash
  cd /Users/marwanmashaly/projects/iceTest/Icebreak/.worktrees/phase-0/packages/api
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Seed one test prompt** (run in Supabase SQL Editor)

  ```sql
  INSERT INTO daily_prompts (id, question, category, active_date, type, options, tags, is_universal)
  VALUES (
    gen_random_uuid(),
    'How adventurous is your food order?',
    'lifestyle',
    CURRENT_DATE,
    'spectrum',
    '[{"key":"safe","emoji":"😌","text":"Same thing every time","index":0},{"key":"curious","emoji":"🙂","text":"Safe but curious","index":1},{"key":"adventurous","emoji":"🌶️","text":"Usually adventurous","index":2},{"key":"extreme","emoji":"🤯","text":"Weirdest thing on the menu","index":3}]',
    '{}',
    true
  );
  ```

- [ ] **Commit**

  ```bash
  cd /Users/marwanmashaly/projects/iceTest/Icebreak/.worktrees/phase-0
  git add packages/shared/src/schema/prompts.ts packages/api/drizzle/
  git commit -m "feat: add prompt type/options/tags columns and story_text to responses"
  ```

---

## Task 2: Prompt API routes

**Files:**
- Create: `packages/api/src/routes/prompts.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Create `packages/api/src/routes/prompts.ts`**

  ```ts
  import { Hono } from 'hono';
  import { zValidator } from '@hono/zod-validator';
  import { z } from 'zod';
  import { eq, and, sql } from 'drizzle-orm';
  import { db } from '../db.js';
  import { dailyPrompts, promptResponses, circles, users } from '@icebreaker/shared';
  import { requireAuth } from '../middleware/auth.js';
  import type { auth } from '../auth.js';

  type Variables = {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };

  export const promptRoutes = new Hono<{ Variables: Variables }>();
  promptRoutes.use('*', requireAuth);

  // GET /api/prompts/today
  promptRoutes.get('/today', async (c) => {
    const me = c.get('user')!;
    const today = new Date().toISOString().split('T')[0];

    // Get today's prompt (preference for interest-matched, fallback to universal)
    const [prompt] = await db
      .select()
      .from(dailyPrompts)
      .where(eq(dailyPrompts.activeDate, today))
      .limit(1);

    if (!prompt) {
      return c.json({ error: 'No prompt for today' }, 404);
    }

    // Check if user already responded
    const [existing] = await db
      .select()
      .from(promptResponses)
      .where(and(eq(promptResponses.userId, me.id), eq(promptResponses.promptId, prompt.id)))
      .limit(1);

    return c.json({
      prompt: {
        ...prompt,
        options: JSON.parse(prompt.options as string),
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
          responseText: '', // deprecated field, kept for schema compat
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

      return c.json({ ok: true });
    }
  );

  // GET /api/prompts/:id/matches
  promptRoutes.get('/:id/matches', async (c) => {
    const me = c.get('user')!;
    const promptId = c.req.param('id');

    // Get my response
    const [myResponse] = await db
      .select()
      .from(promptResponses)
      .where(and(eq(promptResponses.userId, me.id), eq(promptResponses.promptId, promptId)))
      .limit(1);

    if (!myResponse || !myResponse.optionKey) {
      return c.json({ state: 'not_answered', matches: [], adjacentMatches: [], totalCount: 0 });
    }

    // Get confirmed circle members who answered the same option
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

    // Adjacent matches for spectrum type (index ± 1)
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
  ```

- [ ] **Register in `index.ts`**

  Add to `packages/api/src/index.ts` (after the vibe-tags route, before BetterAuth handler):
  ```ts
  import { promptRoutes } from './routes/prompts.js';
  // ...
  app.route('/api/prompts', promptRoutes);
  ```

- [ ] **Test manually — restart server and curl**

  ```bash
  cd /Users/marwanmashaly/projects/iceTest/Icebreak/.worktrees/phase-0/packages/api
  npx tsx src/index.ts
  ```
  In another terminal (replace TOKEN with a real session cookie):
  ```bash
  curl -s http://localhost:3000/api/prompts/today \
    -H "Cookie: icebreaker_cookie=$(cat /tmp/test-cookie 2>/dev/null || echo '{}')"
  ```
  Expected: `{ prompt: { id, question, type, options: [...], ... }, userResponse: null }`

- [ ] **Compile check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Commit**

  ```bash
  git add packages/api/src/routes/prompts.ts packages/api/src/index.ts
  git commit -m "feat: add prompt today/respond/matches API routes"
  ```

---

## Task 3: Discovery API routes (people, circles, pulse)

**Files:**
- Create: `packages/api/src/routes/discovery.ts`
- Modify: `packages/api/src/index.ts`

  > **Route path note:** The join endpoint is registered on a separate `circlesRoutes` object mounted at `/api/circles` (not `/api/discovery`) to match the spec path `POST /api/circles/:id/join`. Register it in `index.ts` with `app.route('/api/circles', circlesRoutes)`.

- [ ] **Create `packages/api/src/routes/discovery.ts`**

  ```ts
  import { Hono } from 'hono';
  import { eq, and, inArray } from 'drizzle-orm';
  import { db } from '../db.js';
  import {
    circles, users, fofSuggestions, vibeTags, userVibeTags,
    groupCircles, groupCircleMembers, chats, chatMembers,
  } from '@icebreaker/shared';
  import { requireAuth } from '../middleware/auth.js';
  import type { auth } from '../auth.js';

  type Variables = {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };

  export const discoveryRoutes = new Hono<{ Variables: Variables }>();
  discoveryRoutes.use('*', requireAuth);

  // GET /api/discovery/people — FOF suggestions
  discoveryRoutes.get('/people', async (c) => {
    const me = c.get('user')!;

    // Get top FOF suggestions for this user (pre-computed, capped at 10)
    const suggestions = await db
      .select({
        id: fofSuggestions.suggestedUserId,
        score: fofSuggestions.score,
        sharedTagCount: fofSuggestions.sharedTagCount,
        mutualFriendIds: fofSuggestions.mutualFriendIds,
      })
      .from(fofSuggestions)
      .where(eq(fofSuggestions.userId, me.id))
      .orderBy(fofSuggestions.score)
      .limit(10);

    if (suggestions.length === 0) {
      return c.json({ people: [] });
    }

    const userIds = suggestions.map((s) => s.id);

    // Get user details
    const suggestedUsers = await db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(users)
      .where(inArray(users.id, userIds));

    // Get shared vibe tags (tags both me and the suggested user have)
    const myTagIds = (await db
      .select({ tagId: userVibeTags.tagId })
      .from(userVibeTags)
      .where(eq(userVibeTags.userId, me.id))
    ).map((r) => r.tagId);

    // Get mutual friend name (first mutual friend)
    const mutualFriendNames: Record<string, string> = {};
    for (const s of suggestions) {
      const ids = (s.mutualFriendIds ?? []) as string[];
      if (ids.length > 0) {
        const [friend] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, ids[0]))
          .limit(1);
        if (friend) mutualFriendNames[s.id] = friend.name ?? 'a friend';
      }
    }

    // Get vibe tags for suggested users
    const sharedTagsMap: Record<string, Array<{ emoji: string; label: string }>> = {};
    if (myTagIds.length > 0) {
      for (const uid of userIds) {
        const sharedRows = await db
          .select({ emoji: vibeTags.emoji, label: vibeTags.label })
          .from(userVibeTags)
          .innerJoin(vibeTags, eq(vibeTags.id, userVibeTags.tagId))
          .where(and(eq(userVibeTags.userId, uid), inArray(userVibeTags.tagId, myTagIds)))
          .limit(3);
        sharedTagsMap[uid] = sharedRows;
      }
    }

    const people = suggestedUsers.map((u) => ({
      id: u.id,
      name: u.name,
      avatarUrl: u.image,
      mutualFriendName: mutualFriendNames[u.id] ?? null,
      sharedVibeTags: sharedTagsMap[u.id] ?? [],
    }));

    return c.json({ people });
  });

  // GET /api/discovery/circles
  discoveryRoutes.get('/circles', async (c) => {
    const me = c.get('user')!;

    // Get circles the user is NOT already a member of
    const alreadyJoined = (await db
      .select({ id: groupCircleMembers.groupCircleId })
      .from(groupCircleMembers)
      .where(eq(groupCircleMembers.userId, me.id))
    ).map((r) => r.id);

    const allCircles = await db
      .select()
      .from(groupCircles)
      .limit(20);

    const eligibleCircles = alreadyJoined.length > 0
      ? allCircles.filter((gc) => !alreadyJoined.includes(gc.id))
      : allCircles;

    // For each circle, count members and count friends inside
    const myFriendIds = (await db
      .select({ friendId: circles.friendId })
      .from(circles)
      .where(and(eq(circles.userId, me.id), eq(circles.status, 'confirmed')))
    ).map((r) => r.friendId);

    const result = await Promise.all(
      eligibleCircles.slice(0, 5).map(async (gc) => {
        const members = await db
          .select({ userId: groupCircleMembers.userId })
          .from(groupCircleMembers)
          .where(and(
            eq(groupCircleMembers.groupCircleId, gc.id),
            eq(groupCircleMembers.status, 'active')
          ));

        const memberIds = members.map((m) => m.userId);
        const friendsInsideCount = myFriendIds.length > 0
          ? memberIds.filter((id) => myFriendIds.includes(id)).length
          : 0;

        return {
          id: gc.id,
          name: gc.name,
          categoryEmoji: gc.categoryEmoji,
          categoryColor: gc.categoryColor,
          memberCount: memberIds.length,
          friendsInsideCount,
          requiresApproval: gc.requiresApproval,
        };
      })
    );

    return c.json({ circles: result });
  });

  // POST /api/circles/:id/join
  discoveryRoutes.post('/:id/join', async (c) => {
    const me = c.get('user')!;
    const circleId = c.req.param('id');

    // Check circle exists
    const [circle] = await db
      .select()
      .from(groupCircles)
      .where(eq(groupCircles.id, circleId))
      .limit(1);

    if (!circle) return c.json({ error: 'Circle not found' }, 404);

    const status = circle.requiresApproval ? 'pending' : 'active';

    // Upsert membership
    await db
      .insert(groupCircleMembers)
      .values({ groupCircleId: circleId, userId: me.id, status, joinedAt: new Date() })
      .onConflictDoNothing();

    // Get or create the circle's group chat
    let chatId: string | null = null;
    if (status === 'active') {
      const existingChats = await db
        .select()
        .from(chats)
        .where(and(eq(chats.type, 'group'), eq(chats.name, circle.name)))
        .limit(1);

      if (existingChats[0]) {
        chatId = existingChats[0].id;
        // Add user to chat members
        await db
          .insert(chatMembers)
          .values({ chatId, userId: me.id, joinedAt: new Date() })
          .onConflictDoNothing();
      }
    }

    // Count active members (standalone db.$count call — do NOT nest inside select/from/where)
    const memberCount = await db.$count(
      groupCircleMembers,
      and(
        eq(groupCircleMembers.groupCircleId, circleId),
        eq(groupCircleMembers.status, 'active')
      )
    );

    return c.json({ ok: true, status, memberCount, chatId });
  });

  // GET /api/discovery/pulse
  discoveryRoutes.get('/pulse', async (c) => {
    const me = c.get('user')!;
    const cards: Array<{
      type: string;
      text: string;
      emoji: string;
      actionLabel: string;
      actionTarget: { type: string; id: string };
    }> = [];

    // 1. Prompt participation card (if ≥3 circle members answered today and user has answered)
    const today = new Date().toISOString().split('T')[0];
    // (Simplified: just count - full implementation in Phase 2 with Inngest)
    // For now return empty pulse
    // TODO: implement full pulse logic once prompts have real data

    return c.json({ cards: cards.slice(0, 3) });
  });
  ```

  > Note: The pulse endpoint is a placeholder for V1 — it returns an empty array until real Motive and prompt data accumulates. The section hides itself on empty, so this is safe.

- [ ] **Register in `index.ts`**

  Add to `packages/api/src/index.ts`:
  ```ts
  import { discoveryRoutes, circlesRoutes } from './routes/discovery.js';
  // ...
  app.route('/api/discovery', discoveryRoutes);
  app.route('/api/circles', circlesRoutes);  // spec path: POST /api/circles/:id/join
  ```

- [ ] **Compile check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Commit**

  ```bash
  git add packages/api/src/routes/discovery.ts packages/api/src/index.ts
  git commit -m "feat: add discovery people/circles/pulse/join API routes"
  ```

---

## Task 4: Mobile API helpers

**Files:**
- Modify: `apps/mobile/lib/api.ts`

- [ ] **Add discovery functions to `apps/mobile/lib/api.ts`**

  Append to the end of the file:
  ```ts
  // ─── Discovery ───────────────────────────────────────────────────────────────

  export type PromptOption = { key: string; emoji: string; text: string; index: number };

  export type TodayPromptResponse = {
    prompt: {
      id: string;
      question: string;
      type: 'pick_your_camp' | 'spectrum' | 'this_or_that' | 'for_you' | 'have_you_ever';
      options: PromptOption[];
      tags: string[];
      isUniversal: boolean;
      activeDate: string;
    };
    userResponse: {
      optionKey: string;
      optionIndex: number;
      storyText: string | null;
      respondedAt: string;
    } | null;
  };

  export function getTodayPrompt() {
    return apiFetch<TodayPromptResponse>('/api/prompts/today');
  }

  export function respondToPrompt(promptId: string, body: {
    optionKey: string;
    optionIndex: number;
    storyText?: string;
  }) {
    return apiFetch<{ ok: boolean }>(`/api/prompts/${promptId}/respond`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  export type MatchResult = {
    state: 'matches' | 'first_in_circle' | 'first_in_network' | 'not_answered';
    matches: Array<{ userId: string; name: string; avatarUrl: string | null; optionKey: string; storyText: string | null }>;
    adjacentMatches: Array<{ userId: string; name: string; avatarUrl: string | null; optionKey: string; storyText: string | null }>;
    totalCount: number;
  };

  export function getPromptMatches(promptId: string) {
    return apiFetch<MatchResult>(`/api/prompts/${promptId}/matches`);
  }

  export type PersonSuggestion = {
    id: string;
    name: string;
    avatarUrl: string | null;
    mutualFriendName: string | null;
    sharedVibeTags: Array<{ emoji: string; label: string }>;
  };

  export function getDiscoveryPeople() {
    return apiFetch<{ people: PersonSuggestion[] }>('/api/discovery/people');
  }

  export type CircleSuggestion = {
    id: string;
    name: string;
    categoryEmoji: string;
    categoryColor: string;
    memberCount: number;
    friendsInsideCount: number;
    requiresApproval: boolean;
  };

  export function getDiscoveryCircles() {
    return apiFetch<{ circles: CircleSuggestion[] }>('/api/discovery/circles');
  }

  export function joinCircle(circleId: string) {
    return apiFetch<{ ok: boolean; status: 'active' | 'pending'; memberCount: number; chatId: string | null }>(
      `/api/circles/${circleId}/join`,  // matches spec: POST /api/circles/:id/join
      { method: 'POST' }
    );
  }

  export type PulseCard = {
    type: 'prompt_participation' | 'open_motive' | 'new_circle_member' | 'memory';
    text: string;
    emoji: string;
    actionLabel: string;
    actionTarget: { type: string; id: string };
  };

  export function getDiscoveryPulse() {
    return apiFetch<{ cards: PulseCard[] }>('/api/discovery/pulse');
  }
  ```

- [ ] **TypeScript check**

  ```bash
  cd /Users/marwanmashaly/projects/iceTest/Icebreak/.worktrees/phase-0/apps/mobile
  npx tsc --noEmit
  ```

- [ ] **Commit**

  ```bash
  git add apps/mobile/lib/api.ts
  git commit -m "feat: add discovery API helper functions with TypeScript types"
  ```

---

## Task 5: PromptCard component

**Files:**
- Create: `apps/mobile/components/features/discovery/PromptCard.tsx`

- [ ] **Create directory**

  ```bash
  mkdir -p /Users/marwanmashaly/projects/iceTest/Icebreak/.worktrees/phase-0/apps/mobile/components/features/discovery
  ```

- [ ] **Create `PromptCard.tsx`**

  This component handles both the **unanswered state** (cinematic dark card with options) and the **compact answered state**.

  ```tsx
  import { useState } from 'react';
  import {
    View, Text, TouchableOpacity, TextInput,
    StyleSheet, ActivityIndicator, Animated,
  } from 'react-native';
  import { Colors, Fonts } from '../../../constants/theme';
  import { PromptOption, TodayPromptResponse, respondToPrompt } from '../../../lib/api';

  const C = Colors.light;

  type Props = {
    prompt: TodayPromptResponse['prompt'];
    userResponse: TodayPromptResponse['userResponse'];
    onReveal: () => void; // called after response submitted, triggers match reveal
  };

  export function PromptCard({ prompt, userResponse, onReveal }: Props) {
    const [selectedKey, setSelectedKey] = useState(userResponse?.optionKey ?? null);
    const [selectedIndex, setSelectedIndex] = useState(userResponse?.optionIndex ?? null);
    const [storyText, setStoryText] = useState(userResponse?.storyText ?? '');
    const [submitting, setSubmitting] = useState(false);

    const hasAnswered = !!userResponse;

    async function handleSelect(option: PromptOption) {
      setSelectedKey(option.key);
      setSelectedIndex(option.index);
    }

    async function handleReveal() {
      if (!selectedKey || selectedIndex === null) return;
      setSubmitting(true);
      try {
        await respondToPrompt(prompt.id, {
          optionKey: selectedKey,
          optionIndex: selectedIndex,
          storyText: storyText || undefined,
        });
        onReveal();
      } catch (e) {
        console.error('Failed to respond:', e);
      } finally {
        setSubmitting(false);
      }
    }

    // Compact answered state
    if (hasAnswered) {
      const answeredOption = prompt.options.find((o) => o.key === userResponse.optionKey);
      return (
        <TouchableOpacity onPress={onReveal} activeOpacity={0.85} style={styles.cardCompact}>
          <View style={styles.glow} />
          <Text style={styles.tag}>ANSWERED ✓</Text>
          <Text style={styles.questionCompact} numberOfLines={1}>{prompt.question}</Text>
          <Text style={styles.answerCompact}>
            {answeredOption?.emoji} {answeredOption?.text}
          </Text>
          <View style={styles.matchTeaser}>
            <Text style={styles.matchTeaserText}>See who agreed →</Text>
          </View>
        </TouchableOpacity>
      );
    }

    // Full unanswered state
    return (
      <View style={styles.card}>
        <View style={styles.glow} />
        <View style={styles.tagRow}>
          <View style={styles.tagDot} />
          <Text style={styles.tag}>DAILY PROMPT</Text>
        </View>

        <Text style={styles.question}>{prompt.question}</Text>

        {/* Options container */}
        <View style={styles.optionsContainer}>
          {prompt.type === 'this_or_that' ? (
            // Special layout for this_or_that: side by side
            <View style={styles.totRow}>
              {prompt.options.slice(0, 2).map((opt, i) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.totOption, selectedKey === opt.key && styles.optionSelected]}
                  onPress={() => handleSelect(opt)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.optionText, selectedKey === opt.key && styles.optionTextSelected]}>
                    {opt.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            // Standard layout: vertical list
            prompt.options.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.option,
                  selectedKey === opt.key && styles.optionSelected,
                  selectedKey && selectedKey !== opt.key && styles.optionDimmed,
                ]}
                onPress={() => handleSelect(opt)}
                activeOpacity={0.75}
              >
                <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                <Text style={[styles.optionText, selectedKey === opt.key && styles.optionTextSelected]}>
                  {opt.text}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Optional story field — slides in after selection */}
        {selectedKey && (
          <View style={styles.storyContainer}>
            <Text style={styles.storyLabel}>✨ Add your story (optional)</Text>
            <TextInput
              style={styles.storyInput}
              value={storyText}
              onChangeText={setStoryText}
              placeholder="What happened?"
              placeholderTextColor="rgba(255,255,255,0.25)"
              multiline
              maxLength={280}
            />
          </View>
        )}

        {/* CTA */}
        {selectedKey && (
          <TouchableOpacity
            style={styles.cta}
            onPress={handleReveal}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.ctaText}>See who agrees →</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const styles = StyleSheet.create({
    card: {
      marginHorizontal: 14,
      marginTop: 8,
      backgroundColor: 'transparent',
      borderRadius: 20,
      padding: 16,
      overflow: 'hidden',
      // Dark gradient via wrapper — React Native doesn't support CSS gradients
      // The parent View provides the dark background
    },
    cardCompact: {
      marginHorizontal: 14,
      marginTop: 8,
      borderRadius: 18,
      padding: 13,
      overflow: 'hidden',
    },
    glow: {
      position: 'absolute',
      top: -15,
      right: -15,
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: 'rgba(255,107,53,0.2)',
    },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
    tagDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#FF6B35' },
    tag: { fontSize: 8, color: '#FF6B35', fontFamily: Fonts.bodySemiBold, letterSpacing: 0.5 },
    question: {
      fontFamily: Fonts.heading,
      fontSize: 15,
      color: '#fff',
      lineHeight: 22,
      marginBottom: 14,
    },
    questionCompact: {
      fontFamily: Fonts.heading,
      fontSize: 11,
      color: 'rgba(255,255,255,0.65)',
      lineHeight: 16,
      marginBottom: 3,
    },
    answerCompact: {
      fontFamily: Fonts.headingRegular,
      fontSize: 12,
      color: '#fff',
      fontStyle: 'italic',
    },
    matchTeaser: { marginTop: 8 },
    matchTeaserText: { fontSize: 9, color: '#FF6B35', fontFamily: Fonts.bodySemiBold },
    optionsContainer: {
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderRadius: 14,
      padding: 8,
      gap: 4,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    optionSelected: {
      backgroundColor: 'rgba(255,107,53,0.2)',
      borderColor: 'rgba(255,107,53,0.6)',
    },
    optionDimmed: { opacity: 0.45 },
    totRow: { flexDirection: 'row', gap: 8 },
    totOption: {
      flex: 1,
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.1)',
      backgroundColor: 'rgba(255,255,255,0.07)',
      gap: 6,
    },
    optionEmoji: { fontSize: 18 },
    optionText: {
      fontSize: 9,
      color: 'rgba(255,255,255,0.85)',
      fontFamily: Fonts.bodySemiBold,
      textAlign: 'center',
    },
    optionTextSelected: { color: '#FF6B35' },
    storyContainer: { marginTop: 10 },
    storyLabel: { fontSize: 8, color: 'rgba(255,107,53,0.8)', fontFamily: Fonts.bodySemiBold, marginBottom: 5 },
    storyInput: {
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,107,53,0.4)',
      borderRadius: 12,
      padding: 10,
      fontSize: 11,
      color: '#fff',
      fontFamily: Fonts.headingRegular,
      fontStyle: 'italic',
      minHeight: 48,
    },
    cta: {
      marginTop: 10,
      backgroundColor: '#FF6B35',
      borderRadius: 10,
      padding: 10,
      alignItems: 'center',
    },
    ctaText: { fontSize: 11, fontFamily: Fonts.bodySemiBold, color: '#fff' },
  });
  ```

  > Note: React Native doesn't support CSS `linear-gradient` directly. The Discovery screen root will provide the dark card background via a `View` with `backgroundColor`. For V1, use `backgroundColor: '#1a1a1a'` on the card. Gradient can be added with `expo-linear-gradient` in a polish iteration.

- [ ] **TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Commit**

  ```bash
  git add apps/mobile/components/features/discovery/PromptCard.tsx
  git commit -m "feat: PromptCard component — unanswered + compact answered states"
  ```

---

## Task 6: MatchReveal component

**Files:**
- Create: `apps/mobile/components/features/discovery/MatchReveal.tsx`

- [ ] **Create `MatchReveal.tsx`**

  ```tsx
  import { View, Text, TouchableOpacity, Modal, StyleSheet, Switch } from 'react-native';
  import { Colors, Fonts } from '../../../constants/theme';
  import { MatchResult } from '../../../lib/api';

  const C = Colors.light;

  type Props = {
    visible: boolean;
    result: MatchResult | null;
    promptOption: { emoji: string; text: string } | null;
    onDismiss: () => void;
    onMakePlan: (userIds: string[]) => void;
  };

  export function MatchReveal({ visible, result, promptOption, onDismiss, onMakePlan }: Props) {
    if (!result) return null;

    const { state, matches, adjacentMatches } = result;

    return (
      <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.overlay}>
          {/* Particle dots */}
          <View style={[styles.particle, { top: 60, left: 24, width: 6, height: 6, opacity: 0.6 }]} />
          <View style={[styles.particle, { top: 100, right: 30, width: 4, height: 4, opacity: 0.4 }]} />
          <View style={[styles.particle, { top: 140, left: 70, width: 5, height: 5, opacity: 0.35 }]} />

          <View style={styles.content}>
            {state === 'matches' && (
              <StateMatches
                matches={matches}
                promptOption={promptOption}
                onDismiss={onDismiss}
                onMakePlan={onMakePlan}
              />
            )}
            {state === 'first_in_circle' && (
              <StateFirstInCircle
                adjacentMatches={adjacentMatches}
                onDismiss={onDismiss}
              />
            )}
            {state === 'first_in_network' && (
              <StateFirstInNetwork onDismiss={onDismiss} />
            )}
          </View>

          {/* Tab bar placeholder to prevent layout shift */}
          <View style={styles.tabBarDim} />
        </View>
      </Modal>
    );
  }

  function StateMatches({ matches, promptOption, onDismiss, onMakePlan }: {
    matches: MatchResult['matches'];
    promptOption: { emoji: string; text: string } | null;
    onDismiss: () => void;
    onMakePlan: (ids: string[]) => void;
  }) {
    return (
      <>
        {promptOption && (
          <View style={styles.echoPill}>
            <Text style={styles.echoText}>{promptOption.emoji} You all said: {promptOption.text}</Text>
          </View>
        )}
        <Text style={styles.bigNumber}>{matches.length}</Text>
        <Text style={styles.bigSub}>people in your circle agree</Text>

        {/* Overlapping avatars */}
        <View style={styles.avatarRow}>
          {matches.slice(0, 3).map((m, i) => (
            <View key={m.userId} style={[styles.avatar, { zIndex: 3 - i, marginLeft: i === 0 ? 0 : -16 }]}>
              <Text style={styles.avatarText}>👤</Text>
            </View>
          ))}
        </View>
        <Text style={styles.nameList}>
          {matches.slice(0, 3).map((m) => m.name?.split(' ')[0]).join(', ')}
        </Text>

        {/* Stories block */}
        {matches.some((m) => m.storyText) && (
          <View style={styles.storiesBlock}>
            {matches.filter((m) => m.storyText).slice(0, 3).map((m) => (
              <Text key={m.userId} style={styles.storyRow}>
                <Text style={styles.storyName}>{m.name?.split(' ')[0]} · </Text>
                <Text style={styles.storyQuote}>"{m.storyText}"</Text>
              </Text>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.ctaPrimary}
          onPress={() => onMakePlan(matches.map((m) => m.userId))}
        >
          <Text style={styles.ctaPrimaryText}>Make a plan together →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ctaSecondary} onPress={onDismiss}>
          <Text style={styles.ctaSecondaryText}>↓ Back to Discovery</Text>
        </TouchableOpacity>
      </>
    );
  }

  function StateFirstInCircle({ adjacentMatches, onDismiss }: {
    adjacentMatches: MatchResult['adjacentMatches'];
    onDismiss: () => void;
  }) {
    return (
      <>
        <Text style={styles.iconEmoji}>🌅</Text>
        <Text style={styles.warmHeading}>Nobody in your circle yet —</Text>
        <Text style={styles.warmSubHeading}>but these people nearby think the same</Text>
        {adjacentMatches.slice(0, 2).map((m) => (
          <View key={m.userId} style={styles.adjacentRow}>
            <Text style={styles.adjacentEmoji}>👤</Text>
            <Text style={styles.adjacentName}>{m.name} · suggested</Text>
          </View>
        ))}
        <View style={styles.notifToggle}>
          <View style={styles.notifTextBlock}>
            <Text style={styles.notifTitle}>Notify me when someone agrees</Text>
            <Text style={styles.notifSub}>Pre-set to ON for you</Text>
          </View>
          <Switch value={true} thumbColor="#fff" trackColor={{ true: '#FF6B35' }} />
        </View>
        <TouchableOpacity style={styles.ctaSecondary} onPress={onDismiss}>
          <Text style={styles.ctaSecondaryText}>↓ Swipe down to explore</Text>
        </TouchableOpacity>
      </>
    );
  }

  function StateFirstInNetwork({ onDismiss }: { onDismiss: () => void }) {
    return (
      <>
        <View style={styles.iconBadge}>
          <Text style={styles.iconEmoji}>🌅</Text>
        </View>
        <Text style={styles.boldTake}>Bold take.</Text>
        <Text style={styles.rareText}>You might be rarer than you think.</Text>
        <Text style={styles.pingText}>We'll ping you the moment someone agrees.</Text>
        <View style={styles.notifToggle}>
          <View style={styles.notifTextBlock}>
            <Text style={styles.notifTitle}>Notify me when someone agrees</Text>
            <Text style={styles.notifSub}>Pre-set to ON for you</Text>
          </View>
          <Switch value={true} thumbColor="#fff" trackColor={{ true: '#FF6B35' }} />
        </View>
        <TouchableOpacity style={styles.ctaSecondary} onPress={onDismiss}>
          <Text style={styles.ctaSecondaryText}>↓ Swipe down to explore</Text>
        </TouchableOpacity>
      </>
    );
  }

  const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#0f0f0f' },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 60 },
    particle: { position: 'absolute', backgroundColor: '#FF6B35', borderRadius: 3 },
    tabBarDim: { height: 50, backgroundColor: 'rgba(255,255,255,0.04)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
    echoPill: { backgroundColor: 'rgba(255,107,53,0.15)', borderWidth: 1, borderColor: 'rgba(255,107,53,0.3)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 16 },
    echoText: { fontSize: 11, color: '#FF6B35', fontFamily: Fonts.bodySemiBold },
    bigNumber: { fontSize: 48, fontFamily: Fonts.bodyBold, color: '#fff', lineHeight: 56 },
    bigSub: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: Fonts.body, marginBottom: 20 },
    avatarRow: { flexDirection: 'row', marginBottom: 8 },
    avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffe8dc', borderWidth: 3, borderColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 24 },
    nameList: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: Fonts.body, marginBottom: 6 },
    storiesBlock: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, width: '100%', marginBottom: 16 },
    storyRow: { marginBottom: 6 },
    storyName: { fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: Fonts.body },
    storyQuote: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontFamily: Fonts.headingRegular, fontStyle: 'italic' },
    ctaPrimary: { backgroundColor: '#FF6B35', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24, width: '100%', alignItems: 'center', marginBottom: 8 },
    ctaPrimaryText: { fontSize: 12, fontFamily: Fonts.bodySemiBold, color: '#fff' },
    ctaSecondary: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 24, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    ctaSecondaryText: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: Fonts.body },
    iconBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,107,53,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    iconEmoji: { fontSize: 32 },
    warmHeading: { fontFamily: Fonts.heading, fontSize: 18, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 4 },
    warmSubHeading: { fontFamily: Fonts.heading, fontSize: 18, color: '#fff', textAlign: 'center', marginBottom: 16 },
    adjacentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 10, width: '100%', marginBottom: 6, opacity: 0.6 },
    adjacentEmoji: { fontSize: 20 },
    adjacentName: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontFamily: Fonts.body },
    boldTake: { fontFamily: Fonts.heading, fontSize: 28, color: '#fff', marginBottom: 6 },
    rareText: { fontFamily: Fonts.heading, fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 8 },
    pingText: { fontFamily: Fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 20 },
    notifToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, width: '100%', marginBottom: 16, gap: 12 },
    notifTextBlock: { flex: 1 },
    notifTitle: { fontSize: 11, fontFamily: Fonts.bodySemiBold, color: '#fff' },
    notifSub: { fontSize: 9, fontFamily: Fonts.body, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  });
  ```

- [ ] **TypeScript check + commit**

  ```bash
  npx tsc --noEmit
  git add apps/mobile/components/features/discovery/MatchReveal.tsx
  git commit -m "feat: MatchReveal component — states A/B/C match reveal full-screen"
  ```

---

## Task 7: PeopleSection component

**Files:**
- Create: `apps/mobile/components/features/discovery/PeopleSection.tsx`

- [ ] **Create `PeopleSection.tsx`**

  ```tsx
  import { useState } from 'react';
  import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
  import { Colors, Fonts } from '../../../constants/theme';
  import { PersonSuggestion } from '../../../lib/api';
  import { Button } from '../../ui/Button';

  const C = Colors.light;

  type Props = {
    people: PersonSuggestion[];
    loading: boolean;
    onAddToCircle: (userId: string) => void;
  };

  export function PeopleSection({ people, loading, onAddToCircle }: Props) {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    if (loading) {
      return (
        <View style={styles.section}>
          <View style={styles.header}>
            <Text style={styles.title}>People you might know</Text>
          </View>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.row, styles.skeleton]} />
          ))}
        </View>
      );
    }

    if (people.length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.header}>
          <Text style={styles.title}>People you might know</Text>
          <Text style={styles.seeAll}>See all</Text>
        </View>

        {people.map((person) => {
          const isExpanded = expandedId === person.id;
          return (
            <TouchableOpacity
              key={person.id}
              style={[styles.row, isExpanded && styles.rowExpanded]}
              onPress={() => setExpandedId(isExpanded ? null : person.id)}
              activeOpacity={0.75}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>👤</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{person.name}</Text>
                <Text style={styles.meta}>
                  {person.mutualFriendName ? `via ${person.mutualFriendName}` : 'suggested'}
                  {person.sharedVibeTags.length > 0
                    ? ' · ' + person.sharedVibeTags.map((t) => t.emoji + ' ' + t.label).join(', ')
                    : ''}
                </Text>
              </View>
              <Text style={styles.arrow}>{isExpanded ? '▾' : '▸'}</Text>

              {isExpanded && (
                <View style={styles.expanded}>
                  {person.sharedVibeTags.length > 0 && (
                    <View style={styles.tagRow}>
                      {person.sharedVibeTags.map((tag) => (
                        <View key={tag.label} style={styles.tag}>
                          <Text style={styles.tagText}>{tag.emoji} {tag.label}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <Button
                    label="+ Add to circle"
                    onPress={() => onAddToCircle(person.id)}
                    fullWidth
                    size="sm"
                    style={{ backgroundColor: C.text, borderRadius: 8, marginTop: 8 }}
                    textStyle={{ color: '#fff', fontFamily: Fonts.bodySemiBold, fontSize: 12 }}
                  />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  const styles = StyleSheet.create({
    section: { marginHorizontal: 12, marginTop: 10 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    title: { fontSize: 12, fontFamily: Fonts.bodySemiBold, color: C.text },
    seeAll: { fontSize: 10, color: C.primary, fontFamily: Fonts.bodySemiBold },
    skeleton: { height: 48, backgroundColor: '#f0ece8', borderRadius: 12, marginBottom: 6 },
    row: {
      backgroundColor: '#fff', borderWidth: 1, borderColor: C.border,
      borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9,
      marginBottom: 6, flexWrap: 'wrap',
    },
    rowExpanded: { borderColor: C.primary, borderWidth: 1.5 },
    avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ffe8dc', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    avatarText: { fontSize: 16 },
    info: { flex: 1 },
    name: { fontSize: 11, fontFamily: Fonts.bodySemiBold, color: C.text },
    meta: { fontSize: 9, color: C.textTertiary, marginTop: 1 },
    arrow: { fontSize: 11, color: C.textTertiary },
    expanded: { width: '100%', marginTop: 2 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    tag: { backgroundColor: '#fdf0e8', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
    tagText: { fontSize: 9, color: '#e8450a', fontFamily: Fonts.bodySemiBold },
  });
  ```

- [ ] **TypeScript check + commit**

  ```bash
  npx tsc --noEmit
  git add apps/mobile/components/features/discovery/PeopleSection.tsx
  git commit -m "feat: PeopleSection — compact collapsible FOF rows"
  ```

---

## Task 8: CirclesSection component

**Files:**
- Create: `apps/mobile/components/features/discovery/CirclesSection.tsx`

- [ ] **Create `CirclesSection.tsx`**

  ```tsx
  import { useState } from 'react';
  import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
  import { Colors, Fonts } from '../../../constants/theme';
  import { CircleSuggestion, joinCircle } from '../../../lib/api';

  const C = Colors.light;

  type Props = {
    circles: CircleSuggestion[];
    loading: boolean;
  };

  export function CirclesSection({ circles, loading }: Props) {
    const [joinedCircle, setJoinedCircle] = useState<CircleSuggestion | null>(null);
    const [joinResult, setJoinResult] = useState<{ status: 'active' | 'pending'; memberCount: number } | null>(null);
    const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

    async function handleJoin(circle: CircleSuggestion) {
      if (pendingIds.has(circle.id)) return;
      setPendingIds((prev) => new Set([...prev, circle.id]));
      try {
        const result = await joinCircle(circle.id);
        if (result.status === 'active') {
          setJoinedCircle(circle);
          setJoinResult({ status: result.status, memberCount: result.memberCount });
        } else {
          // Pending approval — show toast (simplified: just add to pending set)
        }
      } catch (e) {
        console.error('Join failed:', e);
        setPendingIds((prev) => { const next = new Set(prev); next.delete(circle.id); return next; });
      }
    }

    if (loading) {
      return (
        <View style={styles.section}>
          <View style={styles.header}><Text style={styles.title}>Circles you can join</Text></View>
          {[0, 1].map((i) => <View key={i} style={[styles.row, styles.skeleton]} />)}
        </View>
      );
    }

    if (circles.length === 0) return null;

    return (
      <>
        <View style={styles.section}>
          <View style={styles.header}>
            <Text style={styles.title}>Circles you can join</Text>
            <Text style={styles.seeAll}>Browse all</Text>
          </View>

          {circles.map((circle) => {
            const isPending = pendingIds.has(circle.id);
            return (
              <View key={circle.id} style={styles.row}>
                <View style={[styles.icon, { backgroundColor: circle.categoryColor }]}>
                  <Text style={styles.iconText}>{circle.categoryEmoji}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.name}>{circle.name}</Text>
                  <Text style={styles.meta}>
                    {circle.memberCount} members
                    {circle.friendsInsideCount > 0
                      ? ` · ${circle.friendsInsideCount} friend${circle.friendsInsideCount > 1 ? 's' : ''} inside`
                      : ' · no friends yet'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.joinBtn, isPending && styles.joinBtnPending]}
                  onPress={() => handleJoin(circle)}
                  disabled={isPending}
                >
                  <Text style={styles.joinText}>
                    {isPending
                      ? (circle.requiresApproval ? 'Pending ✓' : 'Joining…')
                      : (circle.requiresApproval ? 'Request' : 'Join')}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Join confirmation takeover */}
        {joinedCircle && joinResult && (
          <Modal visible animationType="fade" transparent statusBarTranslucent>
            <View style={styles.overlay}>
              <View style={styles.confirmContent}>
                <View style={[styles.confirmIcon, { backgroundColor: joinedCircle.categoryColor }]}>
                  <Text style={styles.confirmIconText}>{joinedCircle.categoryEmoji}</Text>
                </View>
                <Text style={styles.confirmBadge}>YOU'RE IN ✦</Text>
                <Text style={styles.confirmName}>{joinedCircle.name}</Text>
                <Text style={styles.confirmCount}>{joinResult.memberCount} members now in your circle</Text>

                <View style={styles.confirmList}>
                  {[
                    { icon: '💬', text: 'Added to the group chat' },
                    { icon: '👥', text: 'Members appear in Discovery as potential connections' },
                    { icon: '🎯', text: 'Prompts sometimes tailored to group's interests' },
                  ].map((item) => (
                    <View key={item.icon} style={styles.confirmItem}>
                      <Text style={styles.confirmItemIcon}>{item.icon}</Text>
                      <Text style={styles.confirmItemText}>{item.text}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.confirmCta}
                  onPress={() => { setJoinedCircle(null); setJoinResult(null); }}
                >
                  <Text style={styles.confirmCtaText}>↓ Back to Discovery</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </>
    );
  }

  const styles = StyleSheet.create({
    section: { marginHorizontal: 12, marginTop: 10 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    title: { fontSize: 12, fontFamily: Fonts.bodySemiBold, color: C.text },
    seeAll: { fontSize: 10, color: C.primary, fontFamily: Fonts.bodySemiBold },
    skeleton: { height: 48, backgroundColor: '#f0ece8', borderRadius: 12, marginBottom: 6 },
    row: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 6 },
    icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    iconText: { fontSize: 16 },
    info: { flex: 1 },
    name: { fontSize: 11, fontFamily: Fonts.bodySemiBold, color: C.text },
    meta: { fontSize: 9, color: C.textTertiary, marginTop: 1 },
    joinBtn: { backgroundColor: C.text, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 0 },
    joinBtnPending: { backgroundColor: C.textTertiary },
    joinText: { fontSize: 9, fontFamily: Fonts.bodySemiBold, color: '#fff' },
    overlay: { flex: 1, backgroundColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center', padding: 24 },
    confirmContent: { alignItems: 'center', width: '100%' },
    confirmIcon: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    confirmIconText: { fontSize: 36 },
    confirmBadge: { fontSize: 11, color: '#FF6B35', fontFamily: Fonts.bodySemiBold, letterSpacing: 0.4, marginBottom: 6 },
    confirmName: { fontFamily: Fonts.heading, fontSize: 22, color: '#fff', marginBottom: 4, textAlign: 'center' },
    confirmCount: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: Fonts.body, marginBottom: 24 },
    confirmList: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, width: '100%', gap: 10, marginBottom: 20 },
    confirmItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    confirmItemIcon: { fontSize: 14, marginTop: 1 },
    confirmItemText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: Fonts.body, flex: 1, lineHeight: 17 },
    confirmCta: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 12, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    confirmCtaText: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: Fonts.body },
  });
  ```

- [ ] **TypeScript check + commit**

  ```bash
  npx tsc --noEmit
  git add apps/mobile/components/features/discovery/CirclesSection.tsx
  git commit -m "feat: CirclesSection — compact rows + join confirmation takeover"
  ```

---

## Task 9: CirclePulse component

**Files:**
- Create: `apps/mobile/components/features/discovery/CirclePulse.tsx`

- [ ] **Create `CirclePulse.tsx`**

  ```tsx
  import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
  import { Colors, Fonts } from '../../../constants/theme';
  import { PulseCard } from '../../../lib/api';

  const C = Colors.light;

  type Props = {
    cards: PulseCard[];
    onAction: (card: PulseCard) => void;
  };

  export function CirclePulse({ cards, onAction }: Props) {
    if (cards.length === 0) return null;

    return (
      <View style={styles.section}>
        {cards.map((card, i) => (
          <TouchableOpacity key={i} style={styles.card} onPress={() => onAction(card)} activeOpacity={0.8}>
            <Text style={styles.emoji}>{card.emoji}</Text>
            <Text style={styles.text}>{card.text}</Text>
            <Text style={styles.action}>{card.actionLabel} →</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  const styles = StyleSheet.create({
    section: { marginHorizontal: 12, marginTop: 10, marginBottom: 20, gap: 6 },
    card: {
      backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.border,
      padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
    },
    emoji: { fontSize: 18 },
    text: { flex: 1, fontSize: 11, color: C.text, fontFamily: Fonts.body, lineHeight: 16 },
    action: { fontSize: 10, color: C.primary, fontFamily: Fonts.bodySemiBold },
  });
  ```

- [ ] **TypeScript check + commit**

  ```bash
  npx tsc --noEmit
  git add apps/mobile/components/features/discovery/CirclePulse.tsx
  git commit -m "feat: CirclePulse — curated 2-3 activity cards"
  ```

---

## Task 10: Compose the Discovery screen

**Files:**
- Modify: `apps/mobile/app/(app)/(tabs)/discovery/index.tsx`

- [ ] **Replace stub with the full composed screen**

  ```tsx
  import { useState, useEffect, useCallback } from 'react';
  import {
    View, ScrollView, SafeAreaView, StyleSheet, Text, RefreshControl,
  } from 'react-native';
  import { router } from 'expo-router';
  import { useSafeAreaInsets } from 'react-native-safe-area-context';
  import { Colors, Fonts } from '../../../../constants/theme';
  import {
    getTodayPrompt, getPromptMatches, getDiscoveryPeople,
    getDiscoveryCircles, getDiscoveryPulse,
    TodayPromptResponse, MatchResult, PersonSuggestion, CircleSuggestion, PulseCard,
  } from '../../../../lib/api';
  import { PromptCard } from '../../../../components/features/discovery/PromptCard';
  import { MatchReveal } from '../../../../components/features/discovery/MatchReveal';
  import { PeopleSection } from '../../../../components/features/discovery/PeopleSection';
  import { CirclesSection } from '../../../../components/features/discovery/CirclesSection';
  import { CirclePulse } from '../../../../components/features/discovery/CirclePulse';

  const C = Colors.light;

  export default function DiscoveryScreen() {
    const insets = useSafeAreaInsets();

    const [promptData, setPromptData] = useState<TodayPromptResponse | null>(null);
    const [promptLoading, setPromptLoading] = useState(true);

    const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
    const [showReveal, setShowReveal] = useState(false);
    const [revealLoading, setRevealLoading] = useState(false);

    const [people, setPeople] = useState<PersonSuggestion[]>([]);
    const [peopleLoading, setPeopleLoading] = useState(true);

    const [circles, setCircles] = useState<CircleSuggestion[]>([]);
    const [circlesLoading, setCirclesLoading] = useState(true);

    const [pulseCards, setPulseCards] = useState<PulseCard[]>([]);

    const [refreshing, setRefreshing] = useState(false);

    const loadAll = useCallback(async () => {
      const [p, pe, ci, pu] = await Promise.allSettled([
        getTodayPrompt(),
        getDiscoveryPeople(),
        getDiscoveryCircles(),
        getDiscoveryPulse(),
      ]);
      if (p.status === 'fulfilled') setPromptData(p.value);
      setPromptLoading(false);
      if (pe.status === 'fulfilled') setPeople(pe.value.people);
      setPeopleLoading(false);
      if (ci.status === 'fulfilled') setCircles(ci.value.circles);
      setCirclesLoading(false);
      if (pu.status === 'fulfilled') setPulseCards(pu.value.cards);
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    async function handleRefresh() {
      setRefreshing(true);
      await loadAll();
      setRefreshing(false);
    }

    async function handleReveal() {
      if (!promptData?.prompt) return;
      setRevealLoading(true);
      try {
        const result = await getPromptMatches(promptData.prompt.id);
        setMatchResult(result);
        setShowReveal(true);
      } catch (e) {
        console.error('Match fetch failed:', e);
      } finally {
        setRevealLoading(false);
      }
    }

    function handleMakePlan(userIds: string[]) {
      setShowReveal(false);
      // Navigate to Motive creation — stub for now
      router.push('/(app)/(tabs)/motives');
    }

    function handlePulseAction(card: PulseCard) {
      // Navigate based on card type — stubs for now
      if (card.actionTarget.type === 'prompt_reveal') setShowReveal(true);
    }

    const selectedOption = promptData?.prompt.options.find(
      (o) => o.key === promptData.userResponse?.optionKey
    );

    return (
      <SafeAreaView style={styles.safe} edges={[]}>
        {/* Status bar safe area */}
        <View style={{ height: insets.top }} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Discovery</Text>
          <View style={styles.notifBtn}>
            <Text>🔔</Text>
          </View>
        </View>
        <Text style={styles.dateLabel}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
        >
          {/* Prompt card — dark background wrapper */}
          <View style={styles.promptWrapper}>
            {promptLoading ? (
              <View style={styles.promptSkeleton} />
            ) : promptData ? (
              <PromptCard
                prompt={promptData.prompt}
                userResponse={promptData.userResponse}
                onReveal={handleReveal}
              />
            ) : (
              <View style={styles.promptError}>
                <Text style={styles.promptErrorText}>Couldn't load today's prompt. Pull to retry.</Text>
              </View>
            )}
          </View>

          <PeopleSection
            people={people}
            loading={peopleLoading}
            onAddToCircle={(userId) => console.log('Add:', userId)}
          />

          <CirclesSection circles={circles} loading={circlesLoading} />

          <CirclePulse cards={pulseCards} onAction={handlePulseAction} />
        </ScrollView>

        {/* Match reveal overlay */}
        <MatchReveal
          visible={showReveal}
          result={matchResult}
          promptOption={selectedOption ? { emoji: selectedOption.emoji, text: selectedOption.text } : null}
          onDismiss={() => setShowReveal(false)}
          onMakePlan={handleMakePlan}
        />
      </SafeAreaView>
    );
  }

  const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    header: { paddingHorizontal: 18, paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { fontFamily: Fonts.heading, fontSize: 20, color: C.text },
    notifBtn: { width: 30, height: 30, backgroundColor: '#ffe8dc', borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    dateLabel: { paddingHorizontal: 18, paddingTop: 4, fontSize: 9, color: '#b0a090', fontFamily: Fonts.bodySemiBold, letterSpacing: 0.4 },
    scroll: { flex: 1 },
    promptWrapper: { backgroundColor: '#1a1a1a', marginHorizontal: 14, marginTop: 8, borderRadius: 20, overflow: 'hidden' },
    promptSkeleton: { height: 200, backgroundColor: '#2a1a0e' },
    promptError: { padding: 20, alignItems: 'center' },
    promptErrorText: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: Fonts.body, textAlign: 'center' },
  });
  ```

- [ ] **TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Start the app and verify visually**

  ```bash
  cd /Users/marwanmashaly/projects/iceTest/Icebreak/.worktrees/phase-0/apps/mobile
  npx expo start --clear
  ```

  Open the app on device. Navigate to Discovery tab. Verify:
  - Dark card loads with today's prompt question and options
  - Tapping an option highlights it and dims others
  - Optional story field slides in
  - "See who agrees" calls the API and shows the reveal overlay
  - Swipe down / Back button dismisses reveal, prompt card shows in compact state
  - People section shows rows (or is hidden if no suggestions)
  - Circles section shows join buttons

- [ ] **Commit**

  ```bash
  git add apps/mobile/app/(app)/(tabs)/discovery/index.tsx
  git commit -m "feat: compose full Discovery screen — prompt, reveal, people, circles, pulse"
  ```

---

## Task 11: Add a real prompt to the DB (manual seed)

- [ ] **Run in Supabase SQL Editor** — add prompts for each type to test all 5 formats:

  ```sql
  -- Spectrum (already added in Task 1)
  -- This or That
  INSERT INTO daily_prompts (id, question, category, active_date, type, options, tags, is_universal)
  VALUES (
    gen_random_uuid(),
    'For the weekend — which pulls you harder?',
    'lifestyle',
    CURRENT_DATE + 1,
    'this_or_that',
    '[{"key":"adventure","emoji":"🏕️","text":"Somewhere new, no plan","index":0},{"key":"cozy","emoji":"🛋️","text":"Same cozy spot, no thinking","index":1}]',
    '{}',
    true
  );
  -- Pick your camp
  INSERT INTO daily_prompts (id, question, category, active_date, type, options, tags, is_universal)
  VALUES (
    gen_random_uuid(),
    'How do you handle a plan falling apart last minute?',
    'social',
    CURRENT_DATE + 2,
    'pick_your_camp',
    '[{"key":"chaos","emoji":"🔥","text":"Honestly love the chaos","index":0},{"key":"panic","emoji":"🥴","text":"Panic, then adapt","index":1},{"key":"backup","emoji":"🗓️","text":"Already had a backup plan","index":2}]',
    '{}',
    true
  );
  ```

- [ ] **Update the active_date of the test prompt to CURRENT_DATE** if needed:

  ```sql
  UPDATE daily_prompts SET active_date = CURRENT_DATE 
  WHERE type = 'spectrum' 
  ORDER BY created_at DESC LIMIT 1;
  ```

---

## Verification Checklist

- [ ] `GET /api/prompts/today` returns prompt + null userResponse for a new user
- [ ] `POST /api/prompts/:id/respond` upserts correctly (can re-answer before reveal)
- [ ] `GET /api/prompts/:id/matches` returns `state: 'first_in_network'` for a user with no circle (no crash)
- [ ] Prompt card renders all 5 types without layout overflow
- [ ] Tapping a reaction → story field animates in
- [ ] Match reveal Modal opens on top of everything, tab bar dimmed but visible
- [ ] All 3 reveal states (A/B/C) reachable via the `state` field
- [ ] People section hidden when API returns empty array
- [ ] Circles section: Join open circle → full-screen confirmation → Back to Discovery
- [ ] Circles section: Request to join approval circle → button becomes "Pending ✓"
- [ ] Pulse section hidden when API returns 0 cards (V1 baseline)
- [ ] Pull-to-refresh reloads all 4 sections simultaneously
- [ ] TypeScript compiles clean: `npx tsc --noEmit` in both `packages/api` and `apps/mobile`
