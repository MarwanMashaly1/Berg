# Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Profile tab — main profile screen, edit profile, connections management, circles management, settings, and QR code modal.

**Architecture:** Schema-first (add 4 boolean columns + migrate), then API routes (new `profile.ts` file), then mobile screens (profile tab gets a nested Stack with sub-screens for edit/connections/circles/settings). QR modal is a React Native Modal overlaid on the main screen rather than a route.

**Tech Stack:** Hono + Drizzle ORM (API), Expo Router nested Stack (mobile), `react-native-qrcode-svg` for QR code, existing `apiFetch` auth wrapper, `Colors.light` + `Fonts` design tokens.

**Spec:** `docs/superpowers/specs/2026-04-13-profile-page-design.md`

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `packages/api/src/routes/profile.ts` | Stats, connections, circles, invite-link, request/accept/decline |
| `apps/mobile/app/(app)/(tabs)/profile/_layout.tsx` | Nested Stack navigator for profile sub-screens |
| `apps/mobile/app/(app)/(tabs)/profile/edit.tsx` | Edit profile screen |
| `apps/mobile/app/(app)/(tabs)/profile/connections.tsx` | Connections screen |
| `apps/mobile/app/(app)/(tabs)/profile/circles.tsx` | Circles screen (joined + join by code) |
| `apps/mobile/app/(app)/(tabs)/profile/settings.tsx` | Settings screen |

### Modified files
| File | Change |
|---|---|
| `packages/shared/src/schema/auth.ts` | Add 4 boolean columns to `users` table |
| `packages/api/src/routes/users.ts` | Add new fields to `patchUserSchema` (remove `.strict()` or add new fields) |
| `packages/api/src/routes/discovery.ts` | Add `POST /api/circles/request/:userId`, `POST /api/circles/accept/:userId`, `DELETE /api/circles/decline/:userId`, `GET /api/circles/by-code/:code` to `circlesRoutes` |
| `packages/api/src/index.ts` | Register `profileRoutes` |
| `apps/mobile/app/(app)/(tabs)/profile/index.tsx` | Replace stub with full Profile main screen + QR Modal |
| `apps/mobile/lib/api.ts` | Add profile API helper functions |

---

## Task 1: Schema migration — 4 new boolean columns

**Files:**
- Modify: `packages/shared/src/schema/auth.ts`
- Run migration in `packages/api/`

- [ ] **Read `packages/shared/src/schema/auth.ts`** — note the current `users` table definition ends around line 27 with `lastActiveTab`.

- [ ] **Add 4 columns to the `users` pgTable definition** (after `lastActiveTab`):
  ```ts
  notifyPromptMatches: boolean('notify_prompt_matches').notNull().default(true),
  notifyCircleRequests: boolean('notify_circle_requests').notNull().default(true),
  notifyMotiveInvites: boolean('notify_motive_invites').notNull().default(false),
  showInDiscovery: boolean('show_in_discovery').notNull().default(true),
  ```

- [ ] **TypeScript check**
  ```bash
  cd /Users/marwanmashaly/projects/iceTest/Icebreak/.worktrees/phase-0/packages/api
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Generate and apply migration**
  ```bash
  DATABASE_URL="postgresql://postgres:IceBreak%402675@db.qzzhbyaejtmbayllyrnb.supabase.co:5432/postgres" npx drizzle-kit generate
  DATABASE_URL="postgresql://postgres:IceBreak%402675@db.qzzhbyaejtmbayllyrnb.supabase.co:5432/postgres" npx drizzle-kit migrate
  ```

---

## Task 2: Update `patchUserSchema` + add new fields

**Files:**
- Modify: `packages/api/src/routes/users.ts`

- [ ] **Read `packages/api/src/routes/users.ts`** — note the `patchUserSchema` uses `.strict()` which blocks any unlisted fields.

- [ ] **Add the 4 new preference fields to `patchUserSchema`** (before `.strict()`):
  ```ts
  notifyPromptMatches: z.boolean().optional(),
  notifyCircleRequests: z.boolean().optional(),
  notifyMotiveInvites: z.boolean().optional(),
  showInDiscovery: z.boolean().optional(),
  ```

- [ ] **Add handling in the PATCH handler** — in the `updates` block, add:
  ```ts
  if (body.notifyPromptMatches !== undefined) updates.notifyPromptMatches = body.notifyPromptMatches;
  if (body.notifyCircleRequests !== undefined) updates.notifyCircleRequests = body.notifyCircleRequests;
  if (body.notifyMotiveInvites !== undefined) updates.notifyMotiveInvites = body.notifyMotiveInvites;
  if (body.showInDiscovery !== undefined) updates.showInDiscovery = body.showInDiscovery;
  ```

- [ ] **Also add `GET /api/users/me/invite-link` route** to `users.ts`:
  ```ts
  import { inviteLinks } from '@icebreaker/shared';
  import { randomUUID } from 'crypto';

  userRoutes.get('/me/invite-link', async (c) => {
    const me = c.get('user')!;
    // Find or create invite link for this user
    const existing = await db
      .select()
      .from(inviteLinks)
      .where(eq(inviteLinks.userId, me.id))
      .limit(1);

    if (existing[0]) {
      const code = existing[0].code;
      return c.json({ code, url: `https://icebreaker.app/join/${code}` });
    }

    // Create new invite link
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.insert(inviteLinks).values({
      id: randomUUID(),
      userId: me.id,
      code,
      clickCount: 0,
      signupCount: 0,
      acceptedCount: 0,
      createdAt: new Date(),
    });
    return c.json({ code, url: `https://icebreaker.app/join/${code}` });
  });
  ```

- [ ] **TypeScript check**
  ```bash
  npx tsc --noEmit
  ```

---

## Task 3: Profile API routes

**Files:**
- Create: `packages/api/src/routes/profile.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Create `packages/api/src/routes/profile.ts`**:

  ```ts
  import { Hono } from 'hono';
  import { eq, and, inArray } from 'drizzle-orm';
  import { db } from '../db.js';
  import {
    circles, users, groupCircles, groupCircleMembers,
    vibeTags, userVibeTags,
  } from '@icebreaker/shared';
  import { requireAuth } from '../middleware/auth.js';
  import type { auth } from '../auth.js';

  type Variables = {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };

  export const profileRoutes = new Hono<{ Variables: Variables }>();
  profileRoutes.use('*', requireAuth);

  // GET /api/profile/stats
  profileRoutes.get('/stats', async (c) => {
    const me = c.get('user')!;
    const [connCount, circleCount] = await Promise.all([
      db.$count(circles, and(eq(circles.userId, me.id), eq(circles.status, 'confirmed'))),
      db.$count(groupCircleMembers, and(eq(groupCircleMembers.userId, me.id), eq(groupCircleMembers.status, 'active'))),
    ]);
    return c.json({ connections: connCount, circles: circleCount, motives: 0 });
  });

  // GET /api/profile/connections
  profileRoutes.get('/connections', async (c) => {
    const me = c.get('user')!;
    const myTagIds = (await db.select({ tagId: userVibeTags.tagId }).from(userVibeTags).where(eq(userVibeTags.userId, me.id))).map(r => r.tagId);

    // Confirmed connections
    const confirmedRows = await db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(circles)
      .innerJoin(users, eq(users.id, circles.friendId))
      .where(and(eq(circles.userId, me.id), eq(circles.status, 'confirmed')));

    // Pending incoming requests (others requesting to connect with me)
    const pendingRows = await db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(circles)
      .innerJoin(users, eq(users.id, circles.userId))
      .where(and(eq(circles.friendId, me.id), eq(circles.status, 'pending')));

    // Shared vibe tags for confirmed connections
    const confirmed = await Promise.all(confirmedRows.map(async (u) => {
      let sharedVibeTags: { emoji: string; label: string }[] = [];
      if (myTagIds.length > 0) {
        const theirTagIds = (await db.select({ tagId: userVibeTags.tagId }).from(userVibeTags).where(eq(userVibeTags.userId, u.id))).map(r => r.tagId);
        const sharedIds = myTagIds.filter(id => theirTagIds.includes(id));
        if (sharedIds.length > 0) {
          sharedVibeTags = await db.select({ emoji: vibeTags.emoji, label: vibeTags.label }).from(vibeTags).where(inArray(vibeTags.id, sharedIds)).limit(3);
        }
      }
      return { ...u, sharedVibeTags };
    }));

    return c.json({ confirmed, pending: pendingRows });
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

    const joined = await Promise.all(joinedCircles.map(async (gc) => {
      const members = await db.select({ userId: groupCircleMembers.userId }).from(groupCircleMembers).where(and(eq(groupCircleMembers.groupCircleId, gc.id), eq(groupCircleMembers.status, 'active')));
      const memberIds = members.map(m => m.userId);
      const friendsInsideCount = myFriendIds.filter(id => memberIds.includes(id)).length;
      const previewIds = memberIds.slice(0, 3);
      const memberPreviews = previewIds.length > 0
        ? await db.select({ id: users.id, name: users.name, image: users.image }).from(users).where(inArray(users.id, previewIds))
        : [];
      return {
        id: gc.id, name: gc.name,
        categoryEmoji: gc.categoryEmoji, categoryColor: gc.categoryColor,
        memberCount: memberIds.length, friendsInsideCount, memberPreviews,
      };
    }));

    return c.json({ joined });
  });
  ```

- [ ] **Register in `packages/api/src/index.ts`** — add before the BetterAuth handler:
  ```ts
  import { profileRoutes } from './routes/profile.js';
  // ...
  app.route('/api/profile', profileRoutes);
  ```

- [ ] **TypeScript check**
  ```bash
  npx tsc --noEmit
  ```

---

## Task 4: Circles management routes (request/accept/decline/by-code)

**Files:**
- Modify: `packages/api/src/routes/discovery.ts`

- [ ] **Read `packages/api/src/routes/discovery.ts`** — find the `circlesRoutes` export near the bottom.

- [ ] **Add 4 new routes to `circlesRoutes`** (after the existing `POST /:id/join`):

  ```ts
  // POST /api/circles/request/:userId — send connection request
  circlesRoutes.post('/request/:userId', async (c) => {
    const me = c.get('user')!;
    const targetId = c.req.param('userId');
    if (targetId === me.id) return c.json({ error: 'Cannot connect with yourself' }, 400);

    await db.insert(circles).values({
      id: randomUUID(),
      userId: me.id,
      friendId: targetId,
      status: 'pending',
      createdAt: new Date(),
    }).onConflictDoNothing();
    return c.json({ ok: true });
  });

  // POST /api/circles/accept/:userId — accept incoming request
  circlesRoutes.post('/accept/:userId', async (c) => {
    const me = c.get('user')!;
    const requesterId = c.req.param('userId');

    // Delete the pending row (requester → me)
    await db.delete(circles).where(and(
      eq(circles.userId, requesterId),
      eq(circles.friendId, me.id),
      eq(circles.status, 'pending')
    ));

    // Insert both confirmed rows
    await db.insert(circles).values([
      { id: randomUUID(), userId: me.id, friendId: requesterId, status: 'confirmed', createdAt: new Date() },
      { id: randomUUID(), userId: requesterId, friendId: me.id, status: 'confirmed', createdAt: new Date() },
    ]).onConflictDoNothing();

    return c.json({ ok: true });
  });

  // DELETE /api/circles/decline/:userId — decline incoming request
  circlesRoutes.delete('/decline/:userId', async (c) => {
    const me = c.get('user')!;
    const requesterId = c.req.param('userId');
    await db.delete(circles).where(and(
      eq(circles.userId, requesterId),
      eq(circles.friendId, me.id),
      eq(circles.status, 'pending')
    ));
    return c.json({ ok: true });
  });

  // GET /api/circles/by-code/:code — resolve group circle join code
  circlesRoutes.get('/by-code/:code', async (c) => {
    const code = c.req.param('code').toUpperCase();
    const [circle] = await db.select().from(groupCircles).where(eq(groupCircles.joinCode, code)).limit(1);
    if (!circle) return c.json({ error: 'Circle not found' }, 404);

    const memberCount = await db.$count(groupCircleMembers, and(
      eq(groupCircleMembers.groupCircleId, circle.id),
      eq(groupCircleMembers.status, 'active')
    ));

    return c.json({ id: circle.id, name: circle.name, memberCount, requiresApproval: circle.requiresApproval });
  });
  ```

  Also add these imports at the top of the file if not already present:
  ```ts
  import { randomUUID } from 'crypto';
  ```

- [ ] **TypeScript check**
  ```bash
  npx tsc --noEmit
  ```

---

## Task 5: Install react-native-qrcode-svg + mobile API helpers

- [ ] **Install package**
  ```bash
  cd /Users/marwanmashaly/projects/iceTest/Icebreak/.worktrees/phase-0
  pnpm add react-native-qrcode-svg --filter @icebreaker/mobile
  ```

- [ ] **Add profile API helpers to `apps/mobile/lib/api.ts`** — append at the bottom:

  ```ts
  // ─── Profile ──────────────────────────────────────────────────────────────────

  export type ProfileStats = { connections: number; circles: number; motives: number };
  export type ProfileConnection = { id: string; name: string | null; image: string | null; sharedVibeTags: Array<{ emoji: string; label: string }> };
  export type PendingConnection = { id: string; name: string | null; image: string | null };
  export type ProfileCircle = { id: string; name: string; categoryEmoji: string; categoryColor: string; memberCount: number; friendsInsideCount: number; memberPreviews: Array<{ id: string; name: string | null; image: string | null }> };
  export type InviteLink = { code: string; url: string };

  export function getProfileStats() {
    return apiFetch<ProfileStats>('/api/profile/stats');
  }

  export function getProfileConnections() {
    return apiFetch<{ confirmed: ProfileConnection[]; pending: PendingConnection[] }>('/api/profile/connections');
  }

  export function getProfileCircles() {
    return apiFetch<{ joined: ProfileCircle[] }>('/api/profile/circles');
  }

  export function getInviteLink() {
    return apiFetch<InviteLink>('/api/users/me/invite-link');
  }

  export function requestConnection(userId: string) {
    return apiFetch<{ ok: boolean }>(`/api/circles/request/${userId}`, { method: 'POST' });
  }

  export function acceptConnection(userId: string) {
    return apiFetch<{ ok: boolean }>(`/api/circles/accept/${userId}`, { method: 'POST' });
  }

  export function declineConnection(userId: string) {
    return apiFetch<{ ok: boolean }>(`/api/circles/decline/${userId}`, { method: 'DELETE' });
  }

  export function getCircleByCode(code: string) {
    return apiFetch<{ id: string; name: string; memberCount: number; requiresApproval: boolean }>(`/api/circles/by-code/${encodeURIComponent(code)}`);
  }
  ```

- [ ] **TypeScript check**
  ```bash
  cd /Users/marwanmashaly/projects/iceTest/Icebreak/.worktrees/phase-0/apps/mobile
  npx tsc --noEmit
  ```

---

## Task 6: Profile tab Stack navigator

**Files:**
- Create: `apps/mobile/app/(app)/(tabs)/profile/_layout.tsx`

- [ ] **Create `_layout.tsx`** in the profile directory:

  ```tsx
  import { Stack } from 'expo-router';
  import { Colors } from '../../../../constants/theme';

  export default function ProfileLayout() {
    return (
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.light.backgroundWarm },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="edit" />
        <Stack.Screen name="connections" />
        <Stack.Screen name="circles" />
        <Stack.Screen name="settings" />
      </Stack>
    );
  }
  ```

- [ ] **TypeScript check**
  ```bash
  npx tsc --noEmit
  ```

---

## Task 7: Main Profile screen (index.tsx)

**Files:**
- Modify: `apps/mobile/app/(app)/(tabs)/profile/index.tsx`

- [ ] **Replace the stub** with the full screen. The screen has: header (name + avatar + QR button + availability pill), orange rule + bio, stats row, connections avatar strip, circles pills, settings block, and QR Modal overlay.

  ```tsx
  import { useState, useCallback, useEffect } from 'react';
  import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    Modal, Share, RefreshControl, Platform, Alert,
  } from 'react-native';
  import { router } from 'expo-router';
  import { useSafeAreaInsets } from 'react-native-safe-area-context';
  import QRCode from 'react-native-qrcode-svg';
  import { authClient } from '../../../../lib/auth';
  import { Colors, Fonts } from '../../../../constants/theme';
  import {
    getProfileStats, getProfileConnections, getProfileCircles, getInviteLink,
    patchUser, ProfileStats, ProfileConnection, ProfileCircle, InviteLink,
  } from '../../../../lib/api';

  const C = Colors.light;
  const AVAIL_OPTIONS = [
    { value: 'down_to_hang', emoji: '🟢', label: 'Down to hang', color: '#2D6A4F', bg: 'rgba(45,106,79,0.12)' },
    { value: 'ask_me',       emoji: '🟡', label: 'Ask me',       color: '#B7791F', bg: 'rgba(183,121,31,0.12)' },
    { value: 'busy',         emoji: '🔴', label: 'Busy',         color: '#C53030', bg: 'rgba(197,48,48,0.10)' },
  ];

  export default function ProfileScreen() {
    const insets = useSafeAreaInsets();
    const { data: session } = authClient.useSession();
    const user = session?.user as any;

    const [stats, setStats] = useState<ProfileStats | null>(null);
    const [connections, setConnections] = useState<ProfileConnection[]>([]);
    const [circles, setCircles] = useState<ProfileCircle[]>([]);
    const [inviteLink, setInviteLink] = useState<InviteLink | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [showQR, setShowQR] = useState(false);
    const [showAvailPicker, setShowAvailPicker] = useState(false);
    const [availability, setAvailability] = useState<string>(user?.availabilityStatus ?? 'down_to_hang');

    const loadAll = useCallback(async () => {
      const [s, c, ci, il] = await Promise.allSettled([
        getProfileStats(), getProfileConnections(), getProfileCircles(), getInviteLink(),
      ]);
      if (s.status === 'fulfilled') setStats(s.value);
      if (c.status === 'fulfilled') setConnections(c.value.confirmed.slice(0, 4));
      if (ci.status === 'fulfilled') setCircles(ci.value.joined.slice(0, 3));
      if (il.status === 'fulfilled') setInviteLink(il.value);
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    async function handleRefresh() {
      setRefreshing(true);
      await loadAll();
      setRefreshing(false);
    }

    async function handleAvailability(value: string) {
      setAvailability(value);
      setShowAvailPicker(false);
      await patchUser({ availabilityStatus: value });
    }

    const currentAvail = AVAIL_OPTIONS.find(o => o.value === availability) ?? AVAIL_OPTIONS[0];
    const displayName = user?.displayName ?? user?.name ?? 'Your Name';
    const username = user?.username;
    const bio = user?.bio;

    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.nameBlock}>
              <Text style={styles.name}>{displayName}</Text>
              {username ? <Text style={styles.username}>@{username}</Text> : null}
              {/* Availability pill / picker */}
              <TouchableOpacity onPress={() => setShowAvailPicker(v => !v)} activeOpacity={0.75} style={styles.availPill}>
                <View style={[styles.availDot, { backgroundColor: currentAvail.color }]} />
                <Text style={[styles.availText, { color: currentAvail.color }]}>{currentAvail.label}</Text>
              </TouchableOpacity>
              {/* Inline availability picker */}
              {showAvailPicker && (
                <View style={styles.availPicker}>
                  {AVAIL_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.availPickerOption, availability === opt.value && { backgroundColor: opt.bg, borderColor: opt.color }]}
                      onPress={() => handleAvailability(opt.value)}
                    >
                      <Text style={styles.availPickerEmoji}>{opt.emoji}</Text>
                      <Text style={[styles.availPickerLabel, availability === opt.value && { color: opt.color }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <View style={styles.avatarBlock}>
              <View style={styles.avatar}><Text style={{ fontSize: 28 }}>👤</Text></View>
              <TouchableOpacity style={styles.qrBtn} onPress={() => setShowQR(true)} activeOpacity={0.8}>
                <Text style={styles.qrIcon}>⊞</Text>
                <Text style={styles.qrLabel}>QR</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.rule} />
          {bio ? <Text style={styles.bio}>{bio}</Text> : null}

          {/* Stats row */}
          <View style={styles.statsRow}>
            <TouchableOpacity style={styles.statCell} onPress={() => router.push('/(app)/(tabs)/profile/connections')}>
              <Text style={styles.statNum}>{stats?.connections ?? '—'}</Text>
              <Text style={styles.statLabel}>Connections</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.statCell} onPress={() => router.push('/(app)/(tabs)/profile/circles')}>
              <Text style={styles.statNum}>{stats?.circles ?? '—'}</Text>
              <Text style={styles.statLabel}>Circles</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statNum}>{stats?.motives ?? '0'}</Text>
              <Text style={styles.statLabel}>Motives</Text>
            </View>
          </View>

          {/* Connections avatar strip */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Connections</Text>
              <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/profile/connections')}>
                <Text style={styles.sectionLink}>Manage →</Text>
              </TouchableOpacity>
            </View>
            {connections.length === 0 ? (
              <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/profile/connections')}>
                <Text style={styles.emptyLink}>Add your first connection →</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.avatarStrip}>
                {connections.map((conn, i) => (
                  <View key={conn.id} style={[styles.connAvatar, i > 0 && { marginLeft: -6 }]}>
                    <Text style={{ fontSize: 18 }}>👤</Text>
                    <Text style={styles.connName}>{conn.name?.split(' ')[0]}</Text>
                  </View>
                ))}
                {(stats?.connections ?? 0) > 4 && (
                  <View style={[styles.connAvatar, { marginLeft: -6, backgroundColor: '#f5f0eb' }]}>
                    <Text style={styles.connMore}>+{(stats?.connections ?? 0) - 4}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Circles pills */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your circles</Text>
              <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/profile/circles')}>
                <Text style={styles.sectionLink}>See all</Text>
              </TouchableOpacity>
            </View>
            {circles.length === 0 ? (
              <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/profile/circles')}>
                <Text style={styles.emptyLink}>Join a circle →</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.circlesPills}>
                {circles.map(ci => (
                  <View key={ci.id} style={[styles.circlePill, { backgroundColor: ci.categoryColor }]}>
                    <Text style={styles.circlePillEmoji}>{ci.categoryEmoji}</Text>
                    <Text style={styles.circlePillName}>{ci.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Settings block */}
          <View style={styles.settingsBlock}>
            <TouchableOpacity style={styles.settingsRow} onPress={() => router.push('/(app)/(tabs)/profile/edit')}>
              <Text style={styles.settingsIcon}>✏️</Text>
              <Text style={styles.settingsLabel}>Edit profile</Text>
              <Text style={styles.settingsArrow}>▸</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingsRow} onPress={() => router.push('/(app)/(tabs)/profile/settings')}>
              <Text style={styles.settingsIcon}>⚙️</Text>
              <Text style={styles.settingsLabel}>Settings</Text>
              <Text style={styles.settingsArrow}>▸</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.settingsRow, { borderBottomWidth: 0 }]} onPress={async () => { await authClient.signOut(); router.replace('/(auth)/welcome'); }}>
              <Text style={styles.settingsIcon}>🚪</Text>
              <Text style={[styles.settingsLabel, { color: C.error }]}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* QR Modal */}
        <Modal
          visible={showQR}
          animationType="slide"
          presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
          onRequestClose={() => setShowQR(false)}
        >
          <View style={styles.qrModal}>
            <TouchableOpacity style={styles.qrModalBack} onPress={() => setShowQR(false)}>
              <Text style={styles.qrModalBackText}>← Profile</Text>
            </TouchableOpacity>
            <View style={styles.qrContent}>
              <View style={styles.qrAvatar}><Text style={{ fontSize: 28 }}>👤</Text></View>
              <Text style={styles.qrName}>{displayName}</Text>
              {username ? <Text style={styles.qrUsername}>@{username}</Text> : null}
              {inviteLink ? (
                <>
                  <View style={styles.qrBox}>
                    <QRCode value={inviteLink.url} size={140} color="#1a1a1a" backgroundColor="#fff" />
                  </View>
                  <Text style={styles.qrUrl}>
                    icebreaker.app/join/<Text style={{ color: C.primary }}>{inviteLink.code}</Text>
                  </Text>
                  <TouchableOpacity style={styles.qrShareBtn} onPress={() => Share.share({ message: `Join me on Icebreaker!\n${inviteLink.url}` })}>
                    <Text style={styles.qrShareText}>📤  Share invite link</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: Fonts.body }}>Loading...</Text>
              )}
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.backgroundWarm },
    header: { flexDirection: 'row', padding: 18, paddingBottom: 0, alignItems: 'flex-start', gap: 12 },
    nameBlock: { flex: 1 },
    name: { fontFamily: Fonts.heading, fontSize: 24, color: C.text, letterSpacing: -0.5, lineHeight: 28 },
    username: { fontFamily: Fonts.body, fontSize: 9, color: '#b0a090', marginTop: 3 },
    availPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(45,106,79,0.12)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 8 },
    availDot: { width: 6, height: 6, borderRadius: 3 },
    availText: { fontFamily: Fonts.bodySemiBold, fontSize: 9 },
    availPicker: { marginTop: 8, flexDirection: 'row', gap: 6 },
    availPickerOption: { flex: 1, alignItems: 'center', padding: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#ede8e0', backgroundColor: '#fff', gap: 3 },
    availPickerEmoji: { fontSize: 14 },
    availPickerLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 8, color: '#888', textAlign: 'center' },
    avatarBlock: { alignItems: 'center', gap: 6 },
    avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffe8dc', alignItems: 'center', justifyContent: 'center' },
    qrBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#ede8e0' },
    qrIcon: { fontSize: 11, color: '#555' },
    qrLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 8, color: '#888' },
    rule: { width: 32, height: 2, backgroundColor: C.primary, borderRadius: 2, marginHorizontal: 18, marginTop: 10, marginBottom: 6 },
    bio: { fontFamily: Fonts.body, fontSize: 11, color: '#9a8a7a', paddingHorizontal: 18, marginBottom: 10, lineHeight: 17 },
    statsRow: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#ede8e0', marginBottom: 14 },
    statCell: { flex: 1, alignItems: 'center', paddingVertical: 10 },
    statNum: { fontFamily: Fonts.bodyBold, fontSize: 18, color: C.text },
    statLabel: { fontFamily: Fonts.body, fontSize: 9, color: '#999', marginTop: 2 },
    statDivider: { width: 1, backgroundColor: '#ede8e0', marginVertical: 6 },
    section: { paddingHorizontal: 18, marginBottom: 14 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    sectionTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: C.text },
    sectionLink: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: C.primary },
    emptyLink: { fontFamily: Fonts.body, fontSize: 11, color: C.primary },
    avatarStrip: { flexDirection: 'row', alignItems: 'flex-end', gap: 0 },
    connAvatar: { alignItems: 'center', width: 44 },
    connName: { fontFamily: Fonts.body, fontSize: 8, color: '#555', marginTop: 3 },
    connMore: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: '#888' },
    circlesPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    circlePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
    circlePillEmoji: { fontSize: 13 },
    circlePillName: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: C.text },
    settingsBlock: { backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#ede8e0', marginTop: 4 },
    settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 18, borderBottomWidth: 1, borderColor: '#f5f5f5' },
    settingsIcon: { fontSize: 16 },
    settingsLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 11, flex: 1, color: C.text },
    settingsArrow: { fontSize: 10, color: '#ccc' },
    // QR Modal
    qrModal: { flex: 1, backgroundColor: '#1a1a1a' },
    qrModalBack: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8 },
    qrModalBackText: { fontFamily: Fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.4)' },
    qrContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 60 },
    qrAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffe8dc', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    qrName: { fontFamily: Fonts.heading, fontSize: 22, color: '#fff', marginBottom: 4 },
    qrUsername: { fontFamily: Fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 20 },
    qrBox: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 14 },
    qrUrl: { fontFamily: Fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 20 },
    qrShareBtn: { backgroundColor: '#FF6B35', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
    qrShareText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: '#fff' },
  });
  ```

- [ ] **TypeScript check**
  ```bash
  npx tsc --noEmit
  ```

---

## Task 8: Edit Profile screen

**Files:**
- Create: `apps/mobile/app/(app)/(tabs)/profile/edit.tsx`

- [ ] **Create the file**:

  ```tsx
  import { useState } from 'react';
  import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    KeyboardAvoidingView, Platform, StyleSheet, Alert,
  } from 'react-native';
  import { router } from 'expo-router';
  import { useSafeAreaInsets } from 'react-native-safe-area-context';
  import { authClient } from '../../../../lib/auth';
  import { Colors, Fonts } from '../../../../constants/theme';
  import { patchUser } from '../../../../lib/api';

  const C = Colors.light;
  const AVAIL_OPTIONS = [
    { value: 'down_to_hang', emoji: '🟢', label: 'Down to hang', color: '#2D6A4F', bg: 'rgba(45,106,79,0.12)' },
    { value: 'ask_me',       emoji: '🟡', label: 'Ask me',       color: '#B7791F', bg: 'rgba(183,121,31,0.12)' },
    { value: 'busy',         emoji: '🔴', label: 'Busy',         color: '#C53030', bg: 'rgba(197,48,48,0.10)' },
  ];

  export default function EditProfileScreen() {
    const insets = useSafeAreaInsets();
    const { data: session } = authClient.useSession();
    const user = session?.user as any;

    const [name, setName] = useState<string>(user?.displayName ?? user?.name ?? '');
    const [username, setUsername] = useState<string>(user?.username ?? '');
    const [bio, setBio] = useState<string>(user?.bio ?? '');
    const [availability, setAvailability] = useState<string>(user?.availabilityStatus ?? 'down_to_hang');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function handleSave() {
      if (!name.trim()) { setError('Display name is required'); return; }
      if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        setError('Username must be 3-20 chars, letters/numbers/underscores only');
        return;
      }
      setSaving(true);
      setError('');
      try {
        await patchUser({ displayName: name.trim(), name: name.trim(), username: username || undefined, bio: bio || undefined, availabilityStatus: availability });
        router.back();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        setSaving(false);
      }
    }

    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Edit profile</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={[styles.save, saving && { opacity: 0.5 }]}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Avatar */}
            <TouchableOpacity style={styles.avatarSection} onPress={() => Alert.alert('Coming soon', 'Photo upload will be available in the next update.')}>
              <View style={styles.avatar}><Text style={{ fontSize: 32 }}>👤</Text></View>
              <View style={styles.editBadge}><Text style={{ fontSize: 11 }}>✏️</Text></View>
              <Text style={styles.changePhoto}>Change photo</Text>
            </TouchableOpacity>

            {/* Fields */}
            <View style={styles.card}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
                <TextInput style={styles.fieldInput} value={name} onChangeText={setName} maxLength={50} placeholder="Your name" placeholderTextColor={C.textTertiary} />
              </View>
              <View style={[styles.field, styles.fieldBorder]}>
                <Text style={styles.fieldLabel}>USERNAME</Text>
                <View style={styles.usernameRow}>
                  <Text style={styles.atSign}>@</Text>
                  <TextInput style={[styles.fieldInput, { flex: 1 }]} value={username} onChangeText={setUsername} maxLength={20} autoCapitalize="none" placeholder="username" placeholderTextColor={C.textTertiary} />
                </View>
              </View>
              <View style={[styles.field, styles.fieldBorder, { borderBottomWidth: 0 }]}>
                <Text style={styles.fieldLabel}>BIO</Text>
                <TextInput style={[styles.fieldInput, { minHeight: 36 }]} value={bio} onChangeText={setBio} maxLength={150} multiline placeholder="Tell people about yourself…" placeholderTextColor={C.textTertiary} />
              </View>
            </View>

            {/* Availability */}
            <Text style={styles.sectionLabel}>AVAILABILITY</Text>
            <View style={styles.availRow}>
              {AVAIL_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.availOption, availability === opt.value && { backgroundColor: opt.bg, borderColor: opt.color }]}
                  onPress={() => setAvailability(opt.value)}
                >
                  <Text style={styles.availEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.availLabel, availability === opt.value && { color: opt.color }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Vibe tags */}
            <Text style={styles.sectionLabel}>VIBE TAGS</Text>
            <TouchableOpacity style={styles.vibeTagsRow} onPress={() => router.push({ pathname: '/(app)/onboarding/step-2', params: { returnTo: 'profile' } } as any)}>
              <Text style={styles.vibeTagsText}>Edit your interests</Text>
              <Text style={styles.vibeTagsLink}>Edit →</Text>
            </TouchableOpacity>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.backgroundWarm },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 10 },
    cancel: { fontFamily: Fonts.body, fontSize: 14, color: '#b0a090' },
    title: { fontFamily: Fonts.heading, fontSize: 17, color: C.text },
    save: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.primary },
    scroll: { padding: 16, paddingTop: 4, paddingBottom: 40 },
    avatarSection: { alignItems: 'center', marginBottom: 20, position: 'relative' },
    avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ffe8dc', alignItems: 'center', justifyContent: 'center' },
    editBadge: { position: 'absolute', bottom: 22, right: '50%', marginRight: -44, width: 24, height: 24, background: C.primary, backgroundColor: C.primary, borderRadius: 12, borderWidth: 2, borderColor: C.backgroundWarm, alignItems: 'center', justifyContent: 'center' },
    changePhoto: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: C.primary, marginTop: 6 },
    card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#ede8e0', marginBottom: 16 },
    field: { padding: 12 },
    fieldBorder: { borderTopWidth: 1, borderTopColor: '#f5f0eb' },
    fieldLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: '#b0a090', letterSpacing: 0.5, marginBottom: 4 },
    fieldInput: { fontFamily: Fonts.body, fontSize: 13, color: C.text, padding: 0 },
    usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    atSign: { fontFamily: Fonts.body, fontSize: 13, color: '#b0a090' },
    sectionLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: '#b0a090', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
    availRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    availOption: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#ede8e0', backgroundColor: '#fff', gap: 4 },
    availEmoji: { fontSize: 16 },
    availLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: '#888', textAlign: 'center' },
    vibeTagsRow: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#ede8e0', padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    vibeTagsText: { fontFamily: Fonts.body, fontSize: 12, color: C.text },
    vibeTagsLink: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.primary },
    error: { fontFamily: Fonts.body, fontSize: 12, color: C.error, textAlign: 'center', marginTop: 8 },
  });
  ```

- [ ] **Update `apps/mobile/app/(app)/onboarding/step-2.tsx`** — read the file and add `returnTo` param handling. Find the `router.push('/(app)/onboarding/step-3')` call and replace it:
  ```tsx
  import { useLocalSearchParams } from 'expo-router';
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  // ...
  // In the handleNext function, after saving tags:
  if (returnTo === 'profile') {
    router.replace('/(app)/(tabs)/profile');
  } else {
    router.push('/(app)/onboarding/step-3');
  }
  ```

- [ ] **TypeScript check**
  ```bash
  npx tsc --noEmit
  ```

---

## Task 9: Connections screen

**Files:**
- Create: `apps/mobile/app/(app)/(tabs)/profile/connections.tsx`

- [ ] **Create the file**:

  ```tsx
  import { useState, useEffect, useCallback } from 'react';
  import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Share, RefreshControl,
  } from 'react-native';
  import { router } from 'expo-router';
  import { useSafeAreaInsets } from 'react-native-safe-area-context';
  import { Colors, Fonts } from '../../../../constants/theme';
  import { getProfileConnections, getInviteLink, acceptConnection, declineConnection, requestConnection, ProfileConnection, PendingConnection, InviteLink } from '../../../../lib/api';

  const C = Colors.light;
  const SHOW_LIMIT = 5;

  export default function ConnectionsScreen() {
    const insets = useSafeAreaInsets();
    const [confirmed, setConfirmed] = useState<ProfileConnection[]>([]);
    const [pending, setPending] = useState<PendingConnection[]>([]);
    const [inviteLink, setInviteLink] = useState<InviteLink | null>(null);
    const [query, setQuery] = useState('');
    const [showAll, setShowAll] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [actioning, setActioning] = useState<string | null>(null);

    const loadData = useCallback(async () => {
      const [c, il] = await Promise.allSettled([getProfileConnections(), getInviteLink()]);
      if (c.status === 'fulfilled') { setConfirmed(c.value.confirmed); setPending(c.value.pending); }
      if (il.status === 'fulfilled') setInviteLink(il.value);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    async function handleRefresh() { setRefreshing(true); await loadData(); setRefreshing(false); }

    async function handleAccept(userId: string) {
      setActioning(userId);
      await acceptConnection(userId);
      await loadData();
      setActioning(null);
    }

    async function handleDecline(userId: string) {
      setActioning(userId);
      await declineConnection(userId);
      setPending(prev => prev.filter(p => p.id !== userId));
      setActioning(null);
    }

    const filtered = query.trim()
      ? confirmed.filter(c => c.name?.toLowerCase().includes(query.toLowerCase()))
      : confirmed;
    const visible = showAll ? filtered : filtered.slice(0, SHOW_LIMIT);

    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Profile</Text></TouchableOpacity>
          <Text style={styles.title}>Connections</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}>

          {/* Search */}
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search by name or @username" placeholderTextColor={C.textTertiary} autoCapitalize="none" />
          </View>

          {/* Invite strip */}
          {inviteLink && (
            <TouchableOpacity style={styles.inviteStrip} onPress={() => Share.share({ message: `Join me on Icebreaker!\n${inviteLink.url}` })}>
              <Text style={{ fontSize: 20 }}>🔗</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.inviteTitle}>Invite friends</Text>
                <Text style={styles.inviteSub}>Share your link</Text>
              </View>
              <View style={styles.inviteBtn}><Text style={styles.inviteBtnText}>Share</Text></View>
            </TouchableOpacity>
          )}

          {/* Pending */}
          {pending.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>PENDING · {pending.length}</Text>
              {pending.map(p => (
                <View key={p.id} style={styles.pendingRow}>
                  <View style={styles.rowAvatar}><Text style={{ fontSize: 16 }}>👤</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{p.name}</Text>
                    <Text style={styles.rowMeta}>Wants to connect</Text>
                  </View>
                  <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(p.id)} disabled={actioning === p.id}>
                    <Text style={styles.acceptText}>{actioning === p.id ? '…' : 'Accept'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDecline(p.id)} disabled={actioning === p.id}>
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {/* Confirmed */}
          {confirmed.length === 0 && !query ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Your circle is empty. Invite friends to get started.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>IN YOUR CIRCLE · {filtered.length}</Text>
              {visible.map(conn => (
                <View key={conn.id} style={styles.connRow}>
                  <View style={styles.rowAvatar}><Text style={{ fontSize: 16 }}>👤</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{conn.name}</Text>
                    {conn.sharedVibeTags.length > 0 && (
                      <Text style={styles.rowMeta}>{conn.sharedVibeTags.map(t => `${t.emoji} ${t.label}`).join(' · ')}</Text>
                    )}
                  </View>
                  <Text style={styles.rowArrow}>▸</Text>
                </View>
              ))}
              {filtered.length > SHOW_LIMIT && (
                <TouchableOpacity style={styles.showMore} onPress={() => setShowAll(v => !v)}>
                  <Text style={styles.showMoreText}>{showAll ? 'Show less' : `See all ${filtered.length}`}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.backgroundWarm },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
    back: { fontFamily: Fonts.body, fontSize: 12, color: '#b0a090' },
    title: { fontFamily: Fonts.heading, fontSize: 18, color: C.text, flex: 1 },
    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#ede8e0', margin: '0 14px 10px', marginHorizontal: 14, marginBottom: 10, padding: 10 },
    searchIcon: { fontSize: 13, color: '#ccc' },
    searchInput: { flex: 1, fontFamily: Fonts.body, fontSize: 12, color: C.text, padding: 0 },
    inviteStrip: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 14, marginBottom: 14, borderRadius: 14, padding: 14, backgroundColor: '#FF6B35' },
    inviteTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: '#fff' },
    inviteSub: { fontFamily: Fonts.body, fontSize: 9, color: 'rgba(255,255,255,0.7)' },
    inviteBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    inviteBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: '#fff' },
    sectionLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: '#b0a090', letterSpacing: 0.5, paddingHorizontal: 18, marginBottom: 6, marginTop: 8 },
    pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginBottom: 6, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#F4A261', padding: 10 },
    connRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginBottom: 6, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#ede8e0', padding: 10 },
    rowAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ffe8dc', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    rowName: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.text },
    rowMeta: { fontFamily: Fonts.body, fontSize: 9, color: '#999', marginTop: 1 },
    rowArrow: { fontSize: 10, color: '#ccc' },
    acceptBtn: { backgroundColor: C.text, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    acceptText: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: '#fff' },
    declineText: { fontFamily: Fonts.body, fontSize: 10, color: '#999' },
    emptyState: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32 },
    emptyText: { fontFamily: Fonts.body, fontSize: 13, color: '#9a8a7a', textAlign: 'center', lineHeight: 20 },
    showMore: { alignItems: 'center', paddingVertical: 12 },
    showMoreText: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.primary },
  });
  ```

- [ ] **TypeScript check**
  ```bash
  npx tsc --noEmit
  ```

---

## Task 10: Circles screen

**Files:**
- Create: `apps/mobile/app/(app)/(tabs)/profile/circles.tsx`

- [ ] **Create the file**:

  ```tsx
  import { useState, useEffect, useCallback } from 'react';
  import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Modal, RefreshControl,
  } from 'react-native';
  import { router } from 'expo-router';
  import { useSafeAreaInsets } from 'react-native-safe-area-context';
  import { Colors, Fonts } from '../../../../constants/theme';
  import { getProfileCircles, getCircleByCode, joinCircle, ProfileCircle } from '../../../../lib/api';

  const C = Colors.light;

  export default function CirclesScreen() {
    const insets = useSafeAreaInsets();
    const [joined, setJoined] = useState<ProfileCircle[]>([]);
    const [code, setCode] = useState('');
    const [codeError, setCodeError] = useState('');
    const [joining, setJoining] = useState(false);
    const [confirmCircle, setConfirmCircle] = useState<{ name: string; memberCount: number; status: 'active' | 'pending' } | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = useCallback(async () => {
      const result = await getProfileCircles().catch(() => null);
      if (result) setJoined(result.joined);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    async function handleRefresh() { setRefreshing(true); await loadData(); setRefreshing(false); }

    async function handleJoinByCode() {
      const trimmed = code.trim().toUpperCase();
      if (trimmed.length !== 6) { setCodeError('Enter a 6-character code'); return; }
      setJoining(true);
      setCodeError('');
      try {
        const circle = await getCircleByCode(trimmed);
        const result = await joinCircle(circle.id);
        setConfirmCircle({ name: circle.name, memberCount: result.memberCount, status: result.status });
        setCode('');
        await loadData();
      } catch {
        setCodeError('That code doesn\'t exist. Check and try again.');
      } finally {
        setJoining(false);
      }
    }

    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Profile</Text></TouchableOpacity>
          <Text style={styles.title}>Your circles</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}>

          {/* Joined */}
          {joined.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>JOINED · {joined.length}</Text>
              {joined.map(ci => (
                <View key={ci.id} style={styles.circleCard}>
                  <View style={styles.cardTop}>
                    <View style={[styles.circleIcon, { backgroundColor: ci.categoryColor }]}>
                      <Text style={{ fontSize: 18 }}>{ci.categoryEmoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.circleName}>{ci.name}</Text>
                      <Text style={styles.circleMeta}>{ci.memberCount} members{ci.friendsInsideCount > 0 ? ` · ${ci.friendsInsideCount} friend${ci.friendsInsideCount > 1 ? 's' : ''}` : ''}</Text>
                    </View>
                    <Text style={styles.circleArrow}>▸</Text>
                  </View>
                  {ci.memberPreviews.length > 0 && (
                    <View style={styles.memberAvatars}>
                      {ci.memberPreviews.map((m, i) => (
                        <View key={m.id} style={[styles.memberAvatar, { marginLeft: i > 0 ? -5 : 4, zIndex: 3 - i }]}>
                          <Text style={{ fontSize: 10 }}>👤</Text>
                        </View>
                      ))}
                      {ci.memberCount > 3 && <Text style={styles.memberMore}>+{ci.memberCount - 3}</Text>}
                    </View>
                  )}
                </View>
              ))}
            </>
          )}

          {/* Join by code */}
          <Text style={styles.sectionLabel}>JOIN A CIRCLE</Text>
          <View style={styles.joinRow}>
            <Text style={{ fontSize: 18 }}>🔑</Text>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={t => { setCode(t.toUpperCase()); setCodeError(''); }}
              placeholder="Enter 6-char code…"
              placeholderTextColor="#b0a090"
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity style={[styles.joinBtn, joining && { opacity: 0.5 }]} onPress={handleJoinByCode} disabled={joining}>
              <Text style={styles.joinBtnText}>{joining ? '…' : 'Join'}</Text>
            </TouchableOpacity>
          </View>
          {codeError ? <Text style={styles.codeError}>{codeError}</Text> : null}

          {joined.length === 0 && (
            <Text style={styles.emptyText}>You haven't joined any circles yet.{'\n'}Enter a code above to get started.</Text>
          )}
        </ScrollView>

        {/* Join confirmation */}
        {confirmCircle && (
          <Modal visible animationType="fade" transparent statusBarTranslucent>
            <View style={styles.confirmOverlay}>
              <View style={styles.confirmContent}>
                <Text style={styles.confirmBadge}>{confirmCircle.status === 'active' ? 'YOU\'RE IN ✦' : 'REQUEST SENT'}</Text>
                <Text style={styles.confirmName}>{confirmCircle.name}</Text>
                {confirmCircle.status === 'active'
                  ? <Text style={styles.confirmCount}>{confirmCircle.memberCount} members now in your circle</Text>
                  : <Text style={styles.confirmCount}>The admin will review your request.</Text>
                }
                <TouchableOpacity style={styles.confirmBtn} onPress={() => setConfirmCircle(null)}>
                  <Text style={styles.confirmBtnText}>↓ Back to circles</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </View>
    );
  }

  const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.backgroundWarm },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
    back: { fontFamily: Fonts.body, fontSize: 12, color: '#b0a090' },
    title: { fontFamily: Fonts.heading, fontSize: 18, color: C.text, flex: 1 },
    sectionLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: '#b0a090', letterSpacing: 0.5, paddingHorizontal: 18, marginBottom: 8, marginTop: 8 },
    circleCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#ede8e0', marginHorizontal: 14, marginBottom: 8, padding: 12 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    circleIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    circleName: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: C.text },
    circleMeta: { fontFamily: Fonts.body, fontSize: 9, color: '#999', marginTop: 1 },
    circleArrow: { fontSize: 10, color: '#ccc' },
    memberAvatars: { flexDirection: 'row', alignItems: 'center', paddingLeft: 4 },
    memberAvatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#ffe8dc', borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    memberMore: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: '#888', marginLeft: 4 },
    joinRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#ede8e0', padding: 10 },
    codeInput: { flex: 1, backgroundColor: '#f5f0eb', borderRadius: 8, padding: 8, fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.text, letterSpacing: 2 },
    joinBtn: { backgroundColor: C.text, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    joinBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: '#fff' },
    codeError: { fontFamily: Fonts.body, fontSize: 11, color: C.error, paddingHorizontal: 18, marginTop: 6 },
    emptyText: { fontFamily: Fonts.body, fontSize: 13, color: '#9a8a7a', textAlign: 'center', paddingHorizontal: 32, marginTop: 20, lineHeight: 20 },
    confirmOverlay: { flex: 1, backgroundColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center', padding: 28 },
    confirmContent: { alignItems: 'center', width: '100%' },
    confirmBadge: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: '#FF6B35', letterSpacing: 0.4, marginBottom: 10 },
    confirmName: { fontFamily: Fonts.heading, fontSize: 22, color: '#fff', textAlign: 'center', marginBottom: 6 },
    confirmCount: { fontFamily: Fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 28 },
    confirmBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    confirmBtnText: { fontFamily: Fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  });
  ```

- [ ] **TypeScript check**
  ```bash
  npx tsc --noEmit
  ```

---

## Task 11: Settings screen

**Files:**
- Create: `apps/mobile/app/(app)/(tabs)/profile/settings.tsx`

- [ ] **Create the file**:

  ```tsx
  import { useState } from 'react';
  import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, StyleSheet, ToastAndroid, Platform } from 'react-native';
  import { router } from 'expo-router';
  import { useSafeAreaInsets } from 'react-native-safe-area-context';
  import { authClient } from '../../../../lib/auth';
  import { Colors, Fonts } from '../../../../constants/theme';
  import { patchUser } from '../../../../lib/api';

  const C = Colors.light;

  function showToast(msg: string) {
    if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
    else Alert.alert('', msg);
  }

  export default function SettingsScreen() {
    const insets = useSafeAreaInsets();
    const { data: session } = authClient.useSession();
    const user = session?.user as any;

    const [notifyPrompt, setNotifyPrompt] = useState<boolean>(user?.notifyPromptMatches ?? true);
    const [notifyCircle, setNotifyCircle] = useState<boolean>(user?.notifyCircleRequests ?? true);
    const [notifyMotive, setNotifyMotive] = useState<boolean>(user?.notifyMotiveInvites ?? false);
    const [showInDiscovery, setShowInDiscovery] = useState<boolean>(user?.showInDiscovery ?? true);

    async function toggle(field: string, value: boolean) {
      await patchUser({ [field]: value });
    }

    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Profile</Text></TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>

          {/* Account */}
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowIcon}>📱</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Phone number</Text>
                <Text style={styles.rowSub}>{user?.phoneNumber ? '+•• ••• •••• ••••' : 'Not added'}</Text>
              </View>
              <TouchableOpacity onPress={() => showToast('Coming soon — phone change will be available in the next update.')}>
                <Text style={styles.rowLink}>Change</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.row, styles.rowBorder]}>
              <Text style={styles.rowIcon}>✉️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Email</Text>
                <Text style={styles.rowSub}>{user?.email}</Text>
              </View>
              <Text style={styles.rowArrow}>▸</Text>
            </View>
            <View style={[styles.row, styles.rowBorder, styles.lastRow]}>
              <Text style={styles.rowIcon}>🔒</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Contacts sync</Text>
                <Text style={styles.rowSub}>Off</Text>
              </View>
              <TouchableOpacity onPress={() => showToast('Re-syncing...')}>
                <Text style={styles.rowLink}>Re-sync</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Notifications */}
          <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Prompt matches</Text>
                <Text style={styles.rowSub}>When someone agrees with you</Text>
              </View>
              <Switch value={notifyPrompt} thumbColor="#fff" trackColor={{ true: C.primary, false: '#ddd' }} onValueChange={v => { setNotifyPrompt(v); toggle('notifyPromptMatches', v); }} />
            </View>
            <View style={[styles.row, styles.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Circle requests</Text>
                <Text style={styles.rowSub}>When someone wants to connect</Text>
              </View>
              <Switch value={notifyCircle} thumbColor="#fff" trackColor={{ true: C.primary, false: '#ddd' }} onValueChange={v => { setNotifyCircle(v); toggle('notifyCircleRequests', v); }} />
            </View>
            <View style={[styles.row, styles.rowBorder, styles.lastRow]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Motive invites</Text>
                <Text style={styles.rowSub}>When you're invited to a plan</Text>
              </View>
              <Switch value={notifyMotive} thumbColor="#fff" trackColor={{ true: C.primary, false: '#ddd' }} onValueChange={v => { setNotifyMotive(v); toggle('notifyMotiveInvites', v); }} />
            </View>
          </View>

          {/* Privacy */}
          <Text style={styles.sectionLabel}>PRIVACY</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Show in discovery</Text>
                <Text style={styles.rowSub}>Let others find you via friends-of-friends</Text>
              </View>
              <Switch value={showInDiscovery} thumbColor="#fff" trackColor={{ true: C.primary, false: '#ddd' }} onValueChange={v => { setShowInDiscovery(v); toggle('showInDiscovery', v); }} />
            </View>
            <View style={[styles.row, styles.rowBorder, styles.lastRow]}>
              <Text style={styles.rowIcon}>🛑</Text>
              <Text style={[styles.rowLabel, { flex: 1 }]}>Blocked users</Text>
              <Text style={styles.rowArrow}>▸</Text>
            </View>
          </View>

          {/* Danger */}
          <View style={[styles.card, { marginTop: 20 }]}>
            <TouchableOpacity style={styles.row} onPress={async () => { await authClient.signOut(); router.replace('/(auth)/welcome'); }}>
              <Text style={styles.rowIcon}>🚪</Text>
              <Text style={[styles.rowLabel, { flex: 1, color: C.error }]}>Sign out</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.row, styles.rowBorder, styles.lastRow]} onPress={() => Alert.alert('Delete account', 'This is permanent. All your data will be deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => showToast('Account deletion requested.') }])}>
              <Text style={styles.rowIcon}>⚠️</Text>
              <Text style={[styles.rowLabel, { flex: 1, color: C.error }]}>Delete account</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </View>
    );
  }

  const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.backgroundWarm },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
    back: { fontFamily: Fonts.body, fontSize: 12, color: '#b0a090' },
    title: { fontFamily: Fonts.heading, fontSize: 18, color: C.text, flex: 1 },
    sectionLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: '#b0a090', letterSpacing: 0.5, paddingHorizontal: 18, marginBottom: 6, marginTop: 12 },
    card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#ede8e0', marginHorizontal: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
    rowBorder: { borderTopWidth: 1, borderTopColor: '#f5f0eb' },
    lastRow: {},
    rowIcon: { fontSize: 16 },
    rowLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.text },
    rowSub: { fontFamily: Fonts.body, fontSize: 9, color: '#999', marginTop: 1 },
    rowLink: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: C.primary },
    rowArrow: { fontSize: 10, color: '#ccc' },
  });
  ```

- [ ] **Final TypeScript check (both packages)**
  ```bash
  cd /Users/marwanmashaly/projects/iceTest/Icebreak/.worktrees/phase-0/packages/api && npx tsc --noEmit
  cd /Users/marwanmashaly/projects/iceTest/Icebreak/.worktrees/phase-0/apps/mobile && npx tsc --noEmit
  ```

---

## Verification

1. Profile tab loads warm cream background with large Fraunces name, stats row with real counts
2. Tapping availability pill shows inline 3-option picker, selecting saves immediately
3. QR button opens dark slide-up modal with QR code rendered via `react-native-qrcode-svg`
4. "Share" in QR modal opens native share sheet
5. Edit profile: changing bio and tapping Save → PATCH succeeds, back shows updated bio
6. Vibe tags "Edit →" navigates to step-2 with `returnTo=profile`, saving tags returns to Profile
7. Connections screen: pending row Accept creates confirmed connections, row disappears
8. Circles screen: valid 6-char code → join confirmation takeover
9. Settings: toggle off "Prompt matches" → PATCH called → reopen Settings → toggle is still off
10. Sign out → navigates to Welcome, session cleared
