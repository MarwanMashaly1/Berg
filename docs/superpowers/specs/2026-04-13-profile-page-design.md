# Profile Page — Design Spec
**Date:** 2026-04-13
**Status:** Approved by user
**Scope:** Full Profile tab — 5 screens: main profile, edit profile, connections, circles, settings + QR modal

---

## Context

The Profile tab is the user's home base. Unlike Discovery (dark, outward-facing), Profile is warm and personal. It uses `#FBF5EC` warm cream to give it a distinct identity. All sub-screens stack within the Profile tab (no 5th tab).

**Design hybrid:** C's structure + atmosphere, B's stats row.

---

## Screen Map

```
Profile (main)
├── Edit Profile          ← "Edit profile" settings row
├── Connections           ← "Manage →" header link
├── Circles               ← "See all" header link
├── Settings              ← "Settings" settings row
└── QR Modal              ← QR button in header (Modal, not stack screen)
```

---

## Shared States (all screens)

- **Loading**: skeleton placeholders (same shimmer pattern as Discovery sections)
- **Error**: section hidden entirely; no error message shown (avoids drawing attention to failures)
- **Empty** (per section, specified below)
- **Pull-to-refresh**: all screens support `RefreshControl` with `#FF6B35` tint

---

## Screen 1 — Main Profile

**Background:** `#FBF5EC`

### Loading state
While `GET /api/users/me` and `GET /api/profile/stats` are in flight: show a shimmer skeleton for the header block and stats row. Connections and circles sections show their own skeleton rows.

### Header block
- **Name** (Fraunces 24px, `#1a1a1a`, letter-spacing -0.5px): `display_name ?? name`
- **@username** (9px DM Sans, `#b0a090`): shown only if `username` is set
- **Availability pill**: 🟢 "Down to hang" / 🟡 "Ask me" / 🔴 "Busy". Tapping opens an **inline 3-option horizontal strip** that replaces the pill in-place (no modal). Selecting an option immediately calls `PATCH /api/users/me` with `{ availabilityStatus: value }` and updates the pill. The strip dismisses after selection.
- **Avatar** (52×52, gradient fallback): top-right. Tapping does nothing on main screen (avatar editing only in Edit Profile).
- **QR button**: below avatar — small white card with `⊞ QR`. Tapping opens QR Modal.
- **Orange accent rule**: 32×2px `#FF6B35` below name block
- **Bio**: 9px DM Sans, `#9a8a7a` (shown only if bio is set)

### Stats row
Full-width white strip, top/bottom `#ede8e0` borders, 3 columns:
- **Connections** count → taps navigate to Connections screen
- **Circles** count → taps navigate to Circles screen
- **Motives** count → stub in V1 (count returned as `0`, tap does nothing)

Numbers: 16px bold DM Sans `#1a1a1a`. Labels: 8px `#999`. Source: `GET /api/profile/stats`.

### Connections section
- Header: "Connections" + "Manage →" (navigates to Connections screen)
- **Horizontal avatar strip**: up to 4 avatars (36×36, gradient colors, first name below in 8px). `+N more` overflow chip if >4. Each avatar tap = stub (future: open their profile).
- **Empty state**: "Add your first connection →" link that navigates to Connections screen

### Circles section
- Header: "Your circles" + "See all" (navigates to Circles screen)
- **Colored pill chips**: `[emoji] [name]`, max 3 visible, wraps to second line. Source: first 3 from `GET /api/profile/circles`.
- **Empty state**: "Join a circle →" link navigating to Circles screen

### Settings block (white background, top border `#ede8e0`)
- `✏️ Edit profile` → navigates to Edit Profile
- `⚙️ Settings` → navigates to Settings
- `🚪 Sign out` → calls `authClient.signOut()` → `router.replace('/(auth)/welcome')` (red `#E63946`)

### Data sources
| Data | Source |
|---|---|
| Profile fields | `GET /api/users/me` |
| Stats | `GET /api/profile/stats` |
| Connection previews | `GET /api/profile/connections` (first 4 confirmed) |
| Circle pills | `GET /api/profile/circles` (first 3 joined) |
| Invite code (for QR) | `GET /api/users/me/invite-link` (lazy-created if none exists) |

All loaded in parallel with `Promise.allSettled` on mount.

---

## Screen 2 — Edit Profile

**Header**: "← Cancel" (dismisses without saving) + "Edit profile" + "Save" (`#FF6B35`)

### Loading state
While `GET /api/users/me` is loading: disabled skeleton for each field.

### Fields

**Avatar section**: 64×64 avatar, ✏️ badge tap → image picker (stub in V1 — picker opens but no upload; shows a "Coming soon" toast). Avatar not required.

**White card with `#ede8e0` borders, each field separated by `#f5f0eb`:**
- **Display name** — TextInput, max 50 chars
- **Username** — TextInput with `@` prefix label, 3–20 chars, alphanumeric + underscore, validated client-side
- **Bio** — multiline TextInput, max 150 chars, 2 visible lines

**Availability picker** (horizontal, same 3 options as main screen inline strip):
- 🟢 Down to hang / 🟡 Ask me / 🔴 Busy
- Selected: category color background + colored border
- Unselected: `#fff` + `#ede8e0` border

**Vibe tags**: Current tags as read-only colored pills + "Edit →" link.
- Tapping "Edit →": `router.push('/(app)/onboarding/step-2?returnTo=profile')`
- Step-2 must read `useLocalSearchParams<{ returnTo?: string }>()` — if `returnTo === 'profile'`, after saving tags call `router.replace('/(app)/(tabs)/profile')` instead of `router.push('./step-3')`

### Save action
`PATCH /api/users/me` with `{ name, displayName, username, bio, availabilityStatus }`. On success: navigate back with `router.back()`. On error: show inline error message below the relevant field (username already taken, etc.).

---

## Screen 3 — Connections

**Header**: "← Profile" + "Connections"

### States
- **Loading**: 3 skeleton rows
- **Error**: hidden
- **Empty (no confirmed connections)**: single card — "Your circle is empty. Invite friends to get started." + orange invite strip below

### Search bar
White rounded input, 🔍 icon, placeholder "Search by name or @username". Calls `GET /api/users/search?q=` debounced 300ms. Results replace the main list while active; dismiss search to return to full list. (Existing endpoint.)

**Search result row shape**: `{ id, name, image, username, sharedVibeTags: [{ emoji, label }] }`. Each result row shows avatar + name + shared tags + **"Connect" button** (dark pill, right-aligned). Tapping "Connect" calls `POST /api/circles/request/:userId`, which inserts a `circles` row `(me → them, status: 'pending')`. The button changes to "Pending" (disabled, `#999` bg) after tap. No pagination in V1 — server caps results at 10.

### Invite strip
Orange gradient card (`#FF6B35` → `#E8450A`): 🔗 icon + "Invite friends" + "Share your link" + "Share" button. Tapping calls `Share.share({ message: 'Join me on Icebreaker!\n${inviteUrl}' })`. Always shown (not just when empty).

### Confirmed connections list (labelled "IN YOUR CIRCLE · N")
- **Show limit**: 5 by default, "See all N / Show less" toggle
- Each row: avatar (32×32) + name (bold 10px) + shared vibe tags (8px `#999`, comma-separated) + `▸`
- Empty (0 confirmed): show invite strip + empty state message, no section header

### Pending requests (labelled "PENDING · N", hidden if 0)
Each row: avatar + name + "Wants to connect" + two buttons:
- **Accept**: dark pill → `POST /api/circles/accept/:userId` — creates two `circles` rows: `(me→them, confirmed)` and `(them→me, confirmed)`, deletes the pending row
- **Decline**: ghost text → `DELETE /api/circles/decline/:userId` — deletes `circles` row where `userId = :userId AND friendId = me.id AND status = 'pending'`

On success of either: remove row from pending list with a fade animation.

### Connections response shape
`GET /api/profile/connections` returns:
```json
{
  "confirmed": [{ "id": "uuid", "name": "string", "image": "string|null", "sharedVibeTags": [{ "emoji": "string", "label": "string" }] }],
  "pending": [{ "id": "uuid", "name": "string", "image": "string|null" }]
}
```

---

## Screen 4 — Circles

**Header**: "← Profile" + "Your circles"

### States
- **Loading**: 2 skeleton cards
- **Error**: hidden
- **Empty (0 joined)**: "You haven't joined any circles yet. Enter a code below." + join-by-code field visible

### Joined circles (labelled "JOINED · N")
Each circle card (white, `#ede8e0` border, 14px radius):
- Category icon (36×36, colored bg) + circle name (11px bold) + member/friend count + `▸`
- Member avatar strip: up to 3 overlapping 20×20 circles + `+N` overflow
- Tapping: stub screen ("Coming in a future update")

### Join by code (labelled "JOIN A CIRCLE")
- Code input: 6-char, auto-uppercase, `#f5f0eb` background
- "Join" dark button
- Flow:
  1. `GET /api/circles/by-code/:code` → `{ id, name, memberCount, requiresApproval }`
  2. If code invalid: inline error "That code doesn't exist. Check and try again."
  3. `POST /api/circles/:id/join` → `{ status: 'active' | 'pending', memberCount }`
  4. If `status === 'active'`: full-screen dark takeover "YOU'RE IN ✦" (same as Discovery join confirmation)
  5. If `status === 'pending'`: smaller toast-style confirmation "Request sent — the admin will review it."

### Circles response shape
`GET /api/profile/circles` returns:
```json
{
  "joined": [{ "id": "uuid", "name": "string", "categoryEmoji": "string", "categoryColor": "string", "memberCount": 0, "friendsInsideCount": 0, "memberPreviews": [{ "id": "uuid", "name": "string", "image": "string|null" }] }]
}
```

---

## Screen 5 — Settings

**Background**: `#FBF5EC`. Section labels: 9px DM Sans, `#b0a090`, uppercase, 0.5px letter-spacing.

### Account
- **Phone number**: masked (`+44 ••• ••• 1234`) or "Not added" if null. "Change" link → **stub in V1** (shows toast "Coming soon — phone change will be available in the next update"). Not wired to onboarding step 4 to avoid step counter conflicts.
- **Email**: shows email, `▸` → stub
- **Contacts sync**: "On — N contacts scanned" or "Off". "Re-sync" → **stub in V1** (shows toast "Re-syncing..." then "Done" — no actual API call until contact sync is fully built).

### Notifications (toggle rows, Switch component, `#FF6B35` track)
Three toggles persisted via `PATCH /api/users/me`:
- **Prompt matches** (`notifyPromptMatches: boolean`) — default `true`
- **Circle requests** (`notifyCircleRequests: boolean`) — default `true`
- **Motive invites** (`notifyMotiveInvites: boolean`) — default `false`

These fields plus `showInDiscovery` (from Privacy section) must all be added to:
1. `users` table schema (4 new boolean columns, default values above + `showInDiscovery DEFAULT true`)
2. `patchUserSchema` in `packages/api/src/routes/users.ts` (add all 4 to the `.object()` before `.strict()`)

### Privacy
- **Show in discovery** toggle → `PATCH /api/users/me` with `{ showInDiscovery: boolean }` — also needs schema addition
- **Blocked users** `▸` → stub screen: "No blocked users"

### Danger zone (white block)
- **Sign out**: `#E63946`, `authClient.signOut()` → `router.replace('/(auth)/welcome')`
- **Delete account**: `#E63946`, shows an `Alert.alert` confirmation ("This is permanent. All your data will be deleted.") with Cancel / Delete. In V1: delete only calls sign out and shows "Account deletion requested" toast — no actual deletion yet.

---

## QR Modal

**Trigger**: QR button in Profile header.
**Presentation**: `Modal`, `animationType="slide"` (slides up from bottom), dark background `#1a1a1a`.

### Data source
`GET /api/users/me/invite-link` returns `{ code: string, url: string }`. If the user has no invite link, the server creates one (upsert) and returns it.

### Content (centered, full height)
- Avatar (52×52)
- Display name (Fraunces 18px white)
- @username (10px `rgba(255,255,255,0.4)`)
- QR code: `react-native-qrcode-svg`, value = invite URL, size 140, dark `#1a1a1a`, light `#fff`
- URL text: `icebreaker.app/join/` + `code` (code in `#FF6B35`)
- "📤 Share invite link" primary button → `Share.share({ message, url })`

**Dismiss**: Uses `presentationStyle="pageSheet"` on iOS for native swipe-down gesture support. On Android uses a `TouchableWithoutFeedback` overlay wrapping the modal content to tap-to-dismiss.

**Dependency**: `pnpm add react-native-qrcode-svg --filter @icebreaker/mobile` (Expo Go compatible).

---

## New API Endpoints

| Method | Path | Purpose | Response |
|---|---|---|---|
| GET | `/api/profile/stats` | Connection/circle/motive counts | `{ connections: N, circles: N, motives: 0 }` |
| GET | `/api/profile/connections` | Confirmed + pending circle members | See shape above |
| GET | `/api/profile/circles` | Joined group circles with previews | See shape above |
| GET | `/api/users/me/invite-link` | Get or create user's invite link | `{ code, url }` |
| POST | `/api/circles/request/:userId` | Send a connection request to another user | `{ ok: true }` — inserts `(me→them, pending)` row |
| POST | `/api/circles/accept/:userId` | Accept pending circle request | `{ ok: true }` — creates both confirmed rows |
| DELETE | `/api/circles/decline/:userId` | Decline pending circle request | `{ ok: true }` |
| GET | `/api/circles/by-code/:code` | Resolve join code to circle | `{ id, name, memberCount, requiresApproval }` |
| POST | `/api/circles/:id/join` | Join a group circle | `{ ok, status, memberCount, chatId }` — **existing endpoint** (already in `discovery.ts`) |

**Removed**: `GET /api/profile/me` (redundant — use existing `GET /api/users/me`).

## Schema additions (new boolean columns on `users` table)
- `notifyPromptMatches BOOLEAN NOT NULL DEFAULT true`
- `notifyCircleRequests BOOLEAN NOT NULL DEFAULT true`
- `notifyMotiveInvites BOOLEAN NOT NULL DEFAULT false`
- `showInDiscovery BOOLEAN NOT NULL DEFAULT true`

These must be added to `packages/shared/src/schema/auth.ts` (users table) and `packages/api/src/routes/users.ts` (patchUserSchema).

---

## Verification

1. Profile loads with warm cream, large name, stats row showing real counts
2. Tapping availability pill shows 3-option strip inline, selecting immediately saves and updates pill
3. QR button opens dark modal with QR code, "Share" calls native share sheet
4. Edit Profile: bio change + Save → PATCH succeeds, back shows updated bio
5. Vibe tags "Edit →" opens step-2 with `returnTo=profile`, saving tags returns to Profile (not step-3)
6. Connections: pending row → Accept creates confirmed rows both directions, row disappears
7. Connections: pending row → Decline removes row
8. Circles: valid 6-char code → join → full-screen confirmation
9. Circles: code with `requiresApproval` → toast "Request sent"
10. Settings: toggle "Prompt matches" off → PATCH called → reopen Settings → still off
11. Sign out → navigates to Welcome screen, session cleared
