import { db } from '../db.js';
import { users, notificationInbox } from '@berg/shared';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// Per-chat debounce: coalesce rapid messages into one push notification
type PendingPush = {
  timer: ReturnType<typeof setTimeout>;
  userIds: string[];
  payload: PushPayload;
};
const pendingPushes = new Map<string, PendingPush>();
const PUSH_DEBOUNCE_MS = 3_000;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

type TokenRow = { id: string; token: string };

async function getTokens(userIds: string[]): Promise<TokenRow[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ id: users.id, token: users.expoPushToken })
    .from(users)
    .where(inArray(users.id, userIds));
  return rows.filter((r): r is TokenRow => typeof r.token === 'string' && r.token.length > 0);
}

/** Write notification rows to the inbox for multiple users. */
async function recordInbox(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;
  const dataStr = payload.data ? JSON.stringify(payload.data) : null;
  await db.insert(notificationInbox).values(
    userIds.map((userId) => ({
      id: randomUUID(),
      userId,
      title: payload.title,
      body: payload.body,
      data: dataStr,
      createdAt: new Date(),
    })),
  ).catch((e) => console.error('[inbox] record failed:', e));
}

/**
 * Send a push notification to a single user AND record it in the inbox.
 * Silently skips push if the user has no registered token, but always writes the inbox row.
 */
export async function sendPush(userId: string, payload: PushPayload): Promise<void> {
  // Always record in inbox regardless of token
  await recordInbox([userId], payload);

  const tokens = await getTokens([userId]);
  if (tokens.length === 0) return;

  await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: tokens[0].token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }),
  }).catch((e) => console.error('[push] single send failed:', e));
}

/**
 * Send the same push notification to multiple users AND record in inbox for all.
 * Skips push for users without tokens, but all users get an inbox row.
 * Pass `tag` in data to collapse multiple notifications from the same chat into one on device.
 */
export async function sendPushBatch(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;

  // Always record inbox rows for everyone
  await recordInbox(userIds, payload);

  const tokens = await getTokens(userIds);
  if (tokens.length === 0) return;

  const collapseKey = payload.data?.chatId;
  const messages = tokens.map((t) => ({
    to: t.token,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    // collapse multiple notifications from the same chat on device
    ...(collapseKey ? { channelId: collapseKey, tag: collapseKey } : {}),
  }));

  for (let i = 0; i < messages.length; i += 100) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    }).catch((e) => console.error('[push] batch send failed:', e));
  }
}

/**
 * Debounced push for chat messages: coalesces rapid messages in the same chat
 * into a single push notification sent 3 seconds after the last message.
 * Inbox rows are written immediately (per message); only the device push is debounced.
 */
export async function debouncedChatPush(
  chatId: string,
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (userIds.length === 0) return;

  // Always record inbox row immediately so in-app notification appears right away
  await recordInbox(userIds, payload);

  const existing = pendingPushes.get(chatId);
  if (existing) {
    clearTimeout(existing.timer);
    // Merge userIds (same chat, may have new members)
    const merged = Array.from(new Set([...existing.userIds, ...userIds]));
    existing.userIds = merged;
    existing.payload = payload; // use latest message as preview
  }

  const entry: PendingPush = existing ?? { timer: null as any, userIds, payload };
  entry.timer = setTimeout(async () => {
    pendingPushes.delete(chatId);
    const tokens = await getTokens(entry.userIds);
    if (tokens.length === 0) return;
    const collapseKey = entry.payload.data?.chatId ?? chatId;
    const messages = tokens.map((t) => ({
      to: t.token,
      sound: 'default',
      title: entry.payload.title,
      body: entry.payload.body,
      data: entry.payload.data ?? {},
      channelId: collapseKey,
      tag: collapseKey,
    }));
    for (let i = 0; i < messages.length; i += 100) {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      }).catch((e) => console.error('[push] debounced batch failed:', e));
    }
  }, PUSH_DEBOUNCE_MS);

  if (!existing) pendingPushes.set(chatId, entry);
}

/**
 * Filter a list of user IDs to those who have a given boolean notification preference enabled.
 */
export async function filterByPreference(
  userIds: string[],
  pref: 'notifyPromptMatches' | 'notifyCircleRequests' | 'notifyMotiveInvites',
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({
      id: users.id,
      notifyPromptMatches: users.notifyPromptMatches,
      notifyCircleRequests: users.notifyCircleRequests,
      notifyMotiveInvites: users.notifyMotiveInvites,
    })
    .from(users)
    .where(inArray(users.id, userIds));
  return rows.filter((r) => r[pref] === true).map((r) => r.id);
}
