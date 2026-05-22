/**
 * Seed 200 load-test users with sessions, friend clusters, a shared group chat,
 * and today's prompt responses — enough data for k6 stress tests to exercise
 * every cached and uncached endpoint realistically.
 *
 * Run (from packages/api/):
 *   npx tsx src/scripts/seed-load-test.ts
 *
 * Clean + re-seed:
 *   npx tsx src/scripts/seed-load-test.ts --clean
 *
 * Writes: ../../k6/data/users.json  (array of {userId, sessionToken})
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { db } from '../db.js';
import {
  users, sessions, circles, promptResponses, dailyPrompts,
  chats, chatMembers, messages,
} from '@berg/shared';
import { eq, like, inArray } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const EMAIL_SUFFIX    = '@loadtest.berg.local';
const USER_COUNT      = 200;
const CLUSTER_SIZE    = 5;   // users per friend cluster
const CLUSTER_COUNT   = 10;  // 10×5 = 50 users pre-connected
const CHAT_MEMBER_N   = 60;  // first 60 users share one group chat
const PROMPT_ANSWER_N = 120; // first 120 users answer today's prompt

// ── Cookie signing (mirrors BetterAuth's getSignedCookie) ────────────────────
async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  const b64  = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${value}.${b64}`;
}

async function main() {
  const clean = process.argv.includes('--clean');

  // ── Optional clean ─────────────────────────────────────────────────────────
  if (clean) {
    console.log('[seed] Cleaning existing load-test data…');
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `%${EMAIL_SUFFIX}`));

    if (existing.length > 0) {
      const ids = existing.map((u) => u.id);
      await db.delete(sessions).where(inArray(sessions.userId, ids));
      await db.delete(circles).where(inArray(circles.userId, ids));
      await db.delete(circles).where(inArray(circles.friendId, ids));
      await db.delete(promptResponses).where(inArray(promptResponses.userId, ids));
      await db.delete(chatMembers).where(inArray(chatMembers.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
      console.log(`[seed] Deleted ${ids.length} load-test users.`);
    }
  }

  const now = new Date();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set in env');

  // ── Create users ───────────────────────────────────────────────────────────
  console.log(`[seed] Creating ${USER_COUNT} load-test users…`);
  const userRows = Array.from({ length: USER_COUNT }, (_, i) => ({
    id:                    randomUUID(),
    name:                  `Load Test User ${i + 1}`,
    email:                 `loadtest-${i + 1}${EMAIL_SUFFIX}`,
    emailVerified:         true,
    onboardingCompleted:   true,
    onboardingStep:        '6',
    onboardingCompletedAt: now,
    activatedAt:           now,
    availabilityStatus:    'down_to_hang' as const,
    showInDiscovery:       false,
    notifyPromptMatches:   false,
    notifyCircleRequests:  false,
    notifyMotiveInvites:   false,
  }));

  for (let i = 0; i < userRows.length; i += 50) {
    await db.insert(users).values(userRows.slice(i, i + 50)).onConflictDoNothing();
  }

  // Re-read actual IDs — onConflictDoNothing means existing rows keep their original IDs
  const seededUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `%${EMAIL_SUFFIX}`));

  const userIds = seededUsers.map((u) => u.id);
  console.log(`[seed] ${userIds.length} users ready (inserted or pre-existing).`);

  // ── Create sessions + collect tokens ──────────────────────────────────────
  // Always regenerate sessions so k6 tokens are fresh and match what's in the DB
  console.log('[seed] Replacing sessions…');
  for (let i = 0; i < userIds.length; i += 100) {
    await db.delete(sessions).where(inArray(sessions.userId, userIds.slice(i, i + 100)));
  }
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const userTokens: Array<{ userId: string; sessionToken: string }> = [];

  for (let i = 0; i < userIds.length; i += 50) {
    const batch = userIds.slice(i, i + 50);
    const sessionRows = await Promise.all(batch.map(async (userId) => {
      const rawToken    = randomUUID();
      const signed      = await signCookieValue(rawToken, secret);
      const encoded     = encodeURIComponent(signed);
      userTokens.push({ userId, sessionToken: encoded });
      return {
        id: randomUUID(), token: rawToken, userId,
        expiresAt, createdAt: now, updatedAt: now,
        ipAddress: '127.0.0.1', userAgent: 'k6-load-test',
      };
    }));
    await db.insert(sessions).values(sessionRows);
  }
  console.log(`[seed] ${userTokens.length} sessions created.`);

  // ── Create friend clusters (10 clusters × 5 users each) ──────────────────
  console.log('[seed] Creating friend clusters…');
  const clusterUsers = userIds.slice(0, CLUSTER_SIZE * CLUSTER_COUNT);
  const circleRows: Array<{
    id: string; userId: string; friendId: string;
    status: string; createdAt: Date;
  }> = [];

  for (let c = 0; c < CLUSTER_COUNT; c++) {
    const cluster = clusterUsers.slice(c * CLUSTER_SIZE, (c + 1) * CLUSTER_SIZE);
    for (let a = 0; a < cluster.length; a++) {
      for (let b = a + 1; b < cluster.length; b++) {
        circleRows.push({ id: randomUUID(), userId: cluster[a], friendId: cluster[b], status: 'confirmed', createdAt: now });
        circleRows.push({ id: randomUUID(), userId: cluster[b], friendId: cluster[a], status: 'confirmed', createdAt: now });
      }
    }
  }

  for (let i = 0; i < circleRows.length; i += 100) {
    await db.insert(circles).values(circleRows.slice(i, i + 100)).onConflictDoNothing();
  }
  console.log(`[seed] ${circleRows.length / 2} friendships created.`);

  // ── Create shared group chat for first 60 users ───────────────────────────
  console.log('[seed] Creating load-test group chat…');
  const [chat] = await db
    .insert(chats)
    .values({ id: randomUUID(), type: 'group', name: 'Load Test Chat', createdAt: now })
    .returning({ id: chats.id })
    .onConflictDoNothing();

  if (chat) {
    const chatMemberRows = userIds.slice(0, CHAT_MEMBER_N).map((userId) => ({
      chatId: chat.id, userId, joinedAt: now, lastReadAt: now,
    }));
    for (let i = 0; i < chatMemberRows.length; i += 50) {
      await db.insert(chatMembers).values(chatMemberRows.slice(i, i + 50)).onConflictDoNothing();
    }
    // Seed 10 messages so the chat list isn't empty
    const messageRows = Array.from({ length: 10 }, (_, i) => ({
      chatId:   chat.id,
      senderId: userIds[i % CHAT_MEMBER_N],
      content:  `Load test seed message ${i + 1}`,
      type:     'text',
      createdAt: new Date(now.getTime() - (10 - i) * 60_000),
    }));
    await db.insert(messages).values(messageRows).onConflictDoNothing();
    console.log(`[seed] Group chat ${chat.id} created with ${CHAT_MEMBER_N} members and 10 seed messages.`);

    // Store the chat ID in each user token so k6 scripts can use it
    for (const t of userTokens) {
      (t as any).groupChatId = chat.id;
    }
  }

  // ── Answer today's prompt ─────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const [todayPrompt] = await db
    .select({ id: dailyPrompts.id, options: dailyPrompts.options })
    .from(dailyPrompts)
    .where(eq(dailyPrompts.activeDate, today))
    .limit(1);

  if (todayPrompt) {
    console.log(`[seed] Seeding ${PROMPT_ANSWER_N} prompt responses for ${todayPrompt.id}…`);
    let opts: Array<{ key: string; index: number }> = [];
    try {
      const parsed = JSON.parse(todayPrompt.options as string);
      opts = parsed.slice(0, 2).map((o: any, i: number) => ({ key: o.key ?? String(i), index: i }));
    } catch {
      opts = [{ key: 'a', index: 0 }, { key: 'b', index: 1 }];
    }

    const responseRows = userIds.slice(0, PROMPT_ANSWER_N).map((userId, i) => {
      const opt = opts[i % opts.length];
      return { userId, promptId: todayPrompt.id, optionKey: opt.key, optionIndex: opt.index, responseText: '', respondedAt: now };
    });
    for (let i = 0; i < responseRows.length; i += 50) {
      await db.insert(promptResponses).values(responseRows.slice(i, i + 50)).onConflictDoNothing();
    }
    console.log(`[seed] ${responseRows.length} prompt responses created.`);

    // Embed today's prompt ID in user tokens for k6
    for (const t of userTokens) {
      (t as any).promptId = todayPrompt.id;
    }
  } else {
    console.log('[seed] No prompt for today — creating a load-test prompt…');
    const testOptions = JSON.stringify([
      { key: 'a', index: 0, label: 'Coffee shop' },
      { key: 'b', index: 1, label: 'Rooftop bar' },
    ]);
    const [inserted] = await db
      .insert(dailyPrompts)
      .values({
        question:    'Load test: coffee shop or rooftop bar?',
        category:    'social',
        status:      'active',
        activeDate:  today,
        type:        'pick_your_camp',
        options:     testOptions,
        tags:        [],
        isUniversal: true,
        generatedBy: 'manual',
      })
      .returning({ id: dailyPrompts.id, options: dailyPrompts.options });

    if (inserted) {
      console.log(`[seed] Test prompt created: ${inserted.id}`);
      const opts = [{ key: 'a', index: 0 }, { key: 'b', index: 1 }];
      const responseRows = userIds.slice(0, PROMPT_ANSWER_N).map((userId, i) => {
        const opt = opts[i % opts.length];
        return { userId, promptId: inserted.id, optionKey: opt.key, optionIndex: opt.index, responseText: '', respondedAt: now };
      });
      for (let i = 0; i < responseRows.length; i += 50) {
        await db.insert(promptResponses).values(responseRows.slice(i, i + 50)).onConflictDoNothing();
      }
      console.log(`[seed] ${responseRows.length} prompt responses created.`);
      for (const t of userTokens) {
        (t as any).promptId = inserted.id;
      }
    }
  }

  // ── Write k6/data/users.json ──────────────────────────────────────────────
  const outDir  = resolve(__dirname, '../../../../k6/data');
  const outPath = resolve(outDir, 'users.json');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(userTokens, null, 2));
  console.log(`\n[seed] ✓ Wrote ${userTokens.length} users to ${outPath}`);
  console.log('[seed] ✓ Done. Run: k6 run k6/run-smoke.js -e BASE_URL=http://localhost:3000');

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
