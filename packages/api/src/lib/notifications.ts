import { db } from '../db.js';
import { users, notificationInbox } from '@berg/shared';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// Per-chat debounce: coalesce rapid messages into one push notification AND one inbox write
type PendingPush = {
  timer: ReturnType<typeof setTimeout>;
  userIds: string[];
  payload: PushPayload;
};
const pendingPushes = new Map<string, PendingPush>();
const PUSH_DEBOUNCE_MS = 3_000;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_TIMEOUT_MS = 8_000;

function pushFetch(body: unknown): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), PUSH_TIMEOUT_MS);
  return fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: ac.signal,
  }).finally(() => clearTimeout(t));
}

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type NotifPref = 'notifyPromptMatches' | 'notifyCircleRequests' | 'notifyMotiveInvites';

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
 * Pass `pref` to skip both the inbox write and push if the user has opted out.
 */
export async function sendPush(
  userId: string,
  payload: PushPayload,
  pref?: NotifPref,
): Promise<void> {
  const targetIds = pref ? await filterByPreference([userId], pref) : [userId];
  if (targetIds.length === 0) return;

  await recordInbox(targetIds, payload);

  const tokens = await getTokens(targetIds);
  if (tokens.length === 0) return;

  await pushFetch({
    to: tokens[0].token,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }).catch((e) => console.error('[push] single send failed:', e));
}

/**
 * Send the same push notification to multiple users AND record in inbox for all.
 * Pass `pref` to filter out users who have opted out before writing any rows.
 */
export async function sendPushBatch(
  userIds: string[],
  payload: PushPayload,
  pref?: NotifPref,
): Promise<void> {
  if (userIds.length === 0) return;

  const filtered = pref ? await filterByPreference(userIds, pref) : userIds;
  if (filtered.length === 0) return;

  await recordInbox(filtered, payload);

  const tokens = await getTokens(filtered);
  if (tokens.length === 0) return;

  const collapseKey = payload.data?.chatId;
  const messages = tokens.map((t) => ({
    to: t.token,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    ...(collapseKey ? { channelId: collapseKey, tag: collapseKey } : {}),
  }));

  for (let i = 0; i < messages.length; i += 100) {
    await pushFetch(messages.slice(i, i + 100))
      .catch((e) => console.error('[push] batch send failed:', e));
  }
}

/**
 * Debounced push for chat messages: coalesces rapid messages in the same chat
 * into a single inbox write AND a single device push, 3 seconds after the last message.
 * This prevents N inbox rows per burst of N chat messages.
 */
export async function debouncedChatPush(
  chatId: string,
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (userIds.length === 0) return;

  const existing = pendingPushes.get(chatId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.userIds = Array.from(new Set([...existing.userIds, ...userIds]));
    existing.payload = payload;
  }

  // Write inbox row immediately — survives server restart; push is best-effort
  await recordInbox(userIds, payload);

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
      await pushFetch(messages.slice(i, i + 100))
        .catch((e) => console.error('[push] debounced batch failed:', e));
    }
  }, PUSH_DEBOUNCE_MS);

  if (!existing) pendingPushes.set(chatId, entry);
}

/**
 * Filter a list of user IDs to those who have a given boolean notification preference enabled.
 */
export async function filterByPreference(
  userIds: string[],
  pref: NotifPref,
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
