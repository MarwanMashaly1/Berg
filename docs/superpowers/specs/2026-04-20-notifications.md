# Notifications Engine — Design Spec
**Date:** 2026-04-20
**Status:** Approved for implementation

---

## Overview

Icebreaker needs a full push notification engine. Currently: user preference booleans exist in the DB and settings UI, but zero delivery infrastructure exists — no push token storage, no Expo Notifications SDK, no Inngest, no server-side send code.

This spec covers everything needed from token registration to job scheduling.

---

## Notification Inventory

### Immediate (fired synchronously inside route handlers)

| # | Trigger | Who Gets It | Setting Guard | Deep Link |
|---|---------|-------------|---------------|-----------|
| N1 | Motive invite sent | Each invited user | `notifyMotiveInvites` | `/motives/[id]` |
| N2 | RSVP response (going/maybe/declined) | Motive creator | `notifyMotiveInvites` | `/motives/[id]` |
| N3 | 1:1 connection request | Target user | `notifyCircleRequests` | `/profile/connections` |
| N4 | 1:1 connection accepted | Requester | `notifyCircleRequests` | `/profile/connections` |
| N5 | Group circle join request (requires approval) | Circle admin | `notifyCircleRequests` | `/profile/circle-detail?id=` |
| N6 | Group circle join approved | Approved user | `notifyCircleRequests` | `/profile/circle-detail?id=` |
| N7 | New chat message | All chat members except sender | `notifyMotiveInvites` (reuse) | `/chat/[id]` |

### Scheduled (Inngest jobs, time-delayed)

| # | Trigger | Scheduled At | Who Gets It | Setting Guard | Deep Link |
|---|---------|-------------|-------------|---------------|-----------|
| N8 | Prompt 1st match | Immediately on respond → job fires within 30s | Respondent | `notifyPromptMatches` | `/discovery` (reveals prompt card) |
| N9 | Prompt 3rd match | Immediately on respond → job fires within 30s | Respondent | `notifyPromptMatches` | `/discovery` |
| N10 | Motive reminder | `scheduledAt − 2h`, set on motive creation | All `going` attendees | Always (no opt-out) | `/motives/[id]` |
| N11 | Post-motive memory prompt | `scheduledAt + 1h` | All `going` attendees with no memory yet | Always | `/motives/[id]/memory` |
| N12 | Memory resurfacing | `scheduledAt + 14 days` | Attendees who added a memory with a cardUrl | Always | `/motives/[id]/memory-card` |

---

## Notification Copy

```
N1  Motive invite:      "{CreatorName} wants to {MotiveTitle} — tap to RSVP"
N2  RSVP response:      "{Name} is {going/maybe/out} for {MotiveTitle}"
N3  Connection request:  "{Name} wants to connect with you"
N4  Connection accepted: "{Name} accepted your connection request"
N5  Circle join request: "{Name} wants to join {CircleName}"
N6  Circle approved:     "You're in! Welcome to {CircleName}"
N7  New message:        "{Name}: {first 60 chars of message}"  (group: "{GroupName}: {Name}: ...")
N8  First match:        "{Name} agrees with your take — see what they said"
N9  Third match:        "3 people in your circle agree — time for a Motive?"
N10 Motive reminder:   "Tonight: {MotiveTitle} starts in 2 hours 🎯"
N11 Memory prompt:     "How was {MotiveTitle}? Add your memories before they fade"
N12 Resurfacing:       "One year ago… remember {MotiveTitle}? 📸"
```

---

## Architecture

```
Mobile (expo-notifications)
  → registerForPushNotificationsAsync()
  → POST /api/users/me/push-token  { token }
  → stored in users.expoPushToken

API route triggers N1–N7:
  → import notificationService
  → notificationService.send(userId, { title, body, data })
  → looks up user.expoPushToken + preference
  → calls Expo Push API

API route triggers N8–N12 via Inngest:
  → inngest.send('prompt/new-response', { promptId, userId, optionKey })
  → inngest.send('motive/created', { motiveId, scheduledAt, attendeeIds })
  → Inngest job runs, handles logic, calls notificationService
```

---

## Schema Additions

### `users.expoPushToken` (new column)
```sql
ALTER TABLE users ADD COLUMN expo_push_token TEXT;
```

In Drizzle schema (`packages/shared/src/schema/auth.ts`):
```typescript
expoPushToken: text('expo_push_token'),
```

No new tables needed. `promptResponseNotifications` already exists and tracks per-user per-prompt state (`notificationsSent`, `firstMatchNotifiedAt`, `thresholdNotifiedAt`, `optedIn`, `expiresAt`).

---

## New Files

```
packages/api/src/
  lib/
    notifications.ts          ← sendPush(userId, payload) + sendPushBatch(userIds, payload)
    inngest.ts                ← Inngest client instance
  jobs/
    prompt-match.ts           ← Inngest function: prompt/new-response
    motive-reminder.ts        ← Inngest function: motive/reminder
    motive-memory-prompt.ts   ← Inngest function: motive/memory-prompt
    motive-resurface.ts       ← Inngest function: motive/resurface-memory

apps/mobile/
  lib/
    notifications.ts          ← registerForPushNotificationsAsync(), handleNotificationTap()
```

---

## Implementation Details

### `packages/api/src/lib/notifications.ts`

Uses the official Expo Push API (no SDK needed on server — it's just an HTTP call).

```typescript
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default' | null;
  badge?: number;
};

export async function sendPush(userId: string, payload: PushPayload): Promise<void> {
  const [user] = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.token) return; // no token registered — silently skip

  await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: user.token,
      sound: payload.sound ?? 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }),
  });
}

export async function sendPushBatch(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;

  const rows = await db
    .select({ id: users.id, token: users.expoPushToken })
    .from(users)
    .where(inArray(users.id, userIds));

  const messages = rows
    .filter((r) => !!r.token)
    .map((r) => ({ to: r.token!, sound: payload.sound ?? 'default', ...payload }));

  if (messages.length === 0) return;

  // Expo accepts batches of up to 100
  for (let i = 0; i < messages.length; i += 100) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }
}
```

### `packages/api/src/lib/inngest.ts`

```typescript
import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'icebreaker-api' });
```

### `packages/api/src/jobs/prompt-match.ts`

Key logic:
1. Triggered on every `POST /api/prompts/:id/respond`
2. Counts how many circle-friends have the same `optionKey`
3. On 1st match: send N8 if `notificationsSent === 0`, update record
4. On 3rd match: send N9 if `notificationsSent === 1`, update record
5. Never send more than 2 total
6. Check `expiresAt` — if past midnight, skip
7. Check quiet hours (10pm–8am) — if in quiet hours, skip (don't defer, just skip for now)
8. Check `optedIn` + `notifyPromptMatches` user preference

### `packages/api/src/jobs/motive-reminder.ts`

Triggered by Inngest `motive/created` event with `scheduledFor: scheduledAt - 2h`.
- Fetches motive's `going` attendees
- Skips if motive was cancelled
- Sends N10 to all going attendees
- No preference check (reminders are always-on)

### `packages/api/src/jobs/motive-memory-prompt.ts`

Triggered by Inngest `motive/memory-prompt` event with `scheduledFor: scheduledAt + 1h`.
- Fetches going attendees who have NO `motiveMemories` row yet
- Sends N11 only to those users

### `packages/api/src/jobs/motive-resurface.ts`

Triggered by Inngest `motive/resurface-memory` event with `scheduledFor: scheduledAt + 14 days`.
- Fetches attendees with a `motiveMemories` row that has a non-null `cardUrl`
- Sends N12 to those users only

---

## API Endpoint Changes

### New endpoint: `POST /api/users/me/push-token`

```typescript
// Body: { token: string }
// Validates it starts with 'ExponentPushToken['
// PATCH users SET expo_push_token = token WHERE id = me.id
```

### Modified routes (add notification calls)

**`motives.ts` — `POST /` (create motive):**
```typescript
// After inserting attendees, if status === 'planning' or 'confirmed':
if (body.invitedUserIds.length > 0) {
  const eligibleIds = await getUsersWithPreference(body.invitedUserIds, 'notifyMotiveInvites');
  await sendPushBatch(eligibleIds, {
    title: `${creator.name} invited you`,
    body: `${creator.name} wants to ${body.title} — tap to RSVP`,
    data: { screen: 'motives', motiveId: motive.id },
  });
}
```

**`motives.ts` — `POST /:id/rsvp`:**
```typescript
// After updating rsvpStatus, push to creator (if not the rsvper):
const statusVerb = { going: 'is going', maybe: 'might come', declined: 'can\'t make it' }[status];
await sendPush(motive.creatorId, {
  title: body.title,
  body: `${me.name} ${statusVerb}`,
  data: { screen: 'motives', motiveId: id },
});
```

**`motives.ts` — `POST /`:**
```typescript
// Schedule Inngest jobs after creating motive:
if (body.scheduledAt && body.status !== 'draft') {
  const scheduledAt = new Date(body.scheduledAt);
  await inngest.send([
    { name: 'motive/reminder',       data: { motiveId: motive.id }, ts: scheduledAt.getTime() - 2 * 3600 * 1000 },
    { name: 'motive/memory-prompt',  data: { motiveId: motive.id }, ts: scheduledAt.getTime() + 1 * 3600 * 1000 },
    { name: 'motive/resurface',      data: { motiveId: motive.id }, ts: scheduledAt.getTime() + 14 * 24 * 3600 * 1000 },
  ]);
}
```

**`discovery.ts`/`circlesRoutes` — connection requests/accepts:**
```typescript
// POST /request/:userId → send N3 to targetUserId
// POST /accept/:userId  → send N4 to requesterId
// POST /:id/join (requiresApproval) → send N5 to adminUserId
// POST /:id/approve/:userId → send N6 to userId
```

**`chats.ts` — `POST /:id/messages`:**
```typescript
// After inserting message, get all chat members except sender:
const otherMembers = members.filter(m => m.userId !== me.id).map(m => m.userId);
const chatName = chat.name ?? 'Someone';
const preview = content.length > 60 ? content.slice(0, 57) + '…' : content;
await sendPushBatch(otherMembers, {
  title: chat.type === 'group' ? chatName : me.name,
  body: chat.type === 'group' ? `${me.name}: ${preview}` : preview,
  data: { screen: 'chat', chatId: id },
});
```

**`prompts.ts` — `POST /:id/respond`:**
```typescript
// After upserting response, fire Inngest event:
await inngest.send({
  name: 'prompt/new-response',
  data: { promptId: id, userId: me.id, optionKey: body.optionKey },
});
```

---

## Mobile Changes

### `apps/mobile/lib/notifications.ts` (new file)

```typescript
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { apiFetch } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}

export async function savePushToken(token: string): Promise<void> {
  await apiFetch('/api/users/me/push-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function handleNotificationTap(notification: Notifications.Notification) {
  const data = notification.request.content.data as Record<string, string>;
  if (!data?.screen) return;

  switch (data.screen) {
    case 'motives':
      router.push(`/(app)/(tabs)/motives/${data.motiveId}` as any);
      break;
    case 'chat':
      router.push(`/(app)/(tabs)/chat/${data.chatId}` as any);
      break;
    case 'discovery':
      router.push('/(app)/(tabs)/discovery' as any);
      break;
    case 'connections':
      router.push('/(app)/(tabs)/profile/connections' as any);
      break;
    case 'circle':
      router.push({ pathname: '/(app)/(tabs)/profile/circle-detail', params: { id: data.circleId } } as any);
      break;
  }
}
```

### `apps/mobile/app/_layout.tsx` changes

After session loads, call `registerForPushNotificationsAsync()` and `savePushToken()`. Also wire up the notification tap listener.

### `apps/mobile/app.json` changes

Add `expo-notifications` plugin:
```json
{
  "plugins": [
    "expo-router",
    "expo-splash-screen",
    [
      "expo-notifications",
      {
        "icon": "./assets/images/icon.png",
        "color": "#FF6B35",
        "sounds": []
      }
    ]
  ]
}
```

---

## Dependency Installs

**Mobile:**
```bash
cd apps/mobile && npx expo install expo-notifications
```

**API:**
```bash
cd packages/api && pnpm add inngest
```

**Environment variables to add:**
```
INNGEST_EVENT_KEY=<from Inngest dashboard>
INNGEST_SIGNING_KEY=<from Inngest dashboard>
```

Add Inngest serve handler to `packages/api/src/index.ts`:
```typescript
import { serve } from 'inngest/hono';
import { inngest } from './lib/inngest';
import { promptMatchJob } from './jobs/prompt-match';
import { motiveReminderJob } from './jobs/motive-reminder';
import { motiveMemoryPromptJob } from './jobs/motive-memory-prompt';
import { motiveResurfaceJob } from './jobs/motive-resurface';

app.on(['GET', 'POST', 'PUT'], '/api/inngest', serve({
  client: inngest,
  functions: [promptMatchJob, motiveReminderJob, motiveMemoryPromptJob, motiveResurfaceJob],
}));
```

---

## Implementation Order

1. **Schema** — add `expoPushToken` column, run push
2. **`notifications.ts`** — server notification service (no deps except `db`)
3. **Push token endpoint** — `POST /api/users/me/push-token`
4. **Mobile registration** — `expo-notifications` install + `lib/notifications.ts` + `_layout.tsx` wiring
5. **Inngest setup** — install + client + serve handler in `index.ts`
6. **Direct push triggers** — add to motives, chats, circles routes (N1–N7)
7. **Prompt match job** — N8 + N9 with full threshold + expiry logic
8. **Motive time-based jobs** — N10, N11, N12

---

## Out of Scope
- Quiet hours enforcement (skip for now — just send immediately)
- Notification inbox / history UI
- Android notification channels beyond the default
- Read receipts / dismissal tracking
- Badge count management beyond initial set
