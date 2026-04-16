# Motives Feature — Design Spec
**Date:** 2026-04-17  
**Status:** Approved for implementation

---

## Overview

Motives are the core action unit of Icebreaker — a structured way to turn intent into a real plan with real people. Users can create a Motive from two entry points: the FAB on the Motives tab (standalone), or the "Make a plan together" CTA on the match reveal screen (pre-filled). After the motive happens, users can add memories that generate a sharable memory card.

**Dependencies:** React Native + Expo SDK 54, Expo Router, Hono API, Drizzle ORM, Supabase Postgres, BetterAuth, **Inngest** (server-side background jobs — already used for other jobs in the API package), `expo-image-picker`, Google Places API (server-proxied).

---

## 1. Navigation Structure

Stack-based navigation under the Motives tab, matching the profile tab pattern.

```
apps/mobile/app/(app)/(tabs)/motives/
  _layout.tsx          — Stack navigator
  index.tsx            — Motives list + FAB
  create.tsx           — 4-step creation wizard
  [id].tsx             — Motive detail view
  [id]/memory.tsx      — Post-motive memory flow (4 steps)
  [id]/memory-card.tsx — Generated memory card view
```

### Entry points into creation
1. **FAB** on `index.tsx` → `create.tsx` with no pre-fill
2. **Match reveal CTA** ("Make a plan together") → `create.tsx?category=food&userId=<id>` with category + people pre-filled

---

## 2. Motives Tab (`index.tsx`)

### Header
- Fraunces italic title "Motives" (left-aligned, 26px)
- Filter tabs right-aligned: `All | Active | Past` — compact rounded pill tabs, active tab is dark fill

### Empty state
- Geometric target icon (CSS-drawn, orange, no emoji)
- Serif italic heading: "No motives yet"
- Body text: "Plan something with friends and make memories worth keeping."
- Full-width orange gradient CTA: "Start a motive"
- No FAB on empty state (CTA replaces it)

### List state
- FAB (bottom-right, 50px circle, orange gradient, `+` at 24px) appears once list has items
- Motive cards sorted: active first (by date ascending), then past (by date descending)

### Motive card anatomy
- Top color band (3px, full-width gradient per category — see category colors below)
- **Title** — 12.5px semibold, no emoji prefix
- **Category · Date · Time** — 10.5px warm gray, plain text (e.g. "Food & Drinks · Fri 18 Apr · 7:30 pm")
- **Attendee strip** — overlapping gradient initials avatars (max 4, +N overflow)
- **People names** — "You, Jamie, Alex" at 10px
- **Status badge** (top-right): Going / Planning / Past / Cancelled

### Category colors (band gradient + selected state)
| Category | Band color | Selected tint |
|---|---|---|
| Food & Drinks | `#FF6B35 → #FF8C5A` | `rgba(255,107,53,0.07)` |
| Outdoors | `#4CAF81 → #64C896` | `rgba(76,175,129,0.07)` |
| Catch-up | `#C09060 → #D4A870` | `rgba(192,144,96,0.07)` |
| Movies | `#6488C8 → #8AAAE0` | `rgba(100,136,200,0.07)` |
| Active | `#2EC4B6 → #48D8CC` | `rgba(46,196,182,0.07)` |
| Party | `#C84B7A → #E06090` | `rgba(200,75,122,0.07)` |
| Gaming | `#7B5EA7 → #9B7EC7` | `rgba(123,94,167,0.07)` |
| Travel | `#3A8FC4 → #5AAFE4` | `rgba(58,143,196,0.07)` |
| Creative | `#E08040 → #F0A060` | `rgba(224,128,64,0.07)` |

### Initials avatars
Every person gets a gradient avatar based on their name initial. The app assigns a stable gradient per user ID using a hash of the user ID modulo 6 color presets:
- Preset 1 (orange): `#FF9060 → #FF6B35`
- Preset 2 (green): `#4CAF81 → #2D6A4F`
- Preset 3 (blue): `#64B4FF → #3A7FD4`
- Preset 4 (purple): `#C08FFF → #8B5CF6`
- Preset 5 (gold): `#FFD580 → #F5A623`
- Preset 6 (teal): `#48D8CC → #2EC4B6`

Initials = first letter of first name + first letter of last name, uppercase.

---

## 3. Creation Wizard (`create.tsx`)

4-step flow. Navigation: circular back button (34px white circle, SVG chevron). Step progress: numbered dot indicator (1→2→3→4), done steps show `✓` in orange, active is filled orange, future are muted.

### Step 1 — Category
- 3×3 grid of category cells
- Each cell: category emoji (18px) + label (10px bold)
- Selected state: category-specific tint background + matching accent border + orange checkmark badge (top-right)
- Single-select. "Next" CTA unlocks immediately on selection.

### Step 2 — People
- Sticky selected-people bar at top (shows initials avatars + names) — appears as soon as ≥1 selected
- Search input with SVG search icon
- Scrollable list of connections showing: initials avatar, name, availability pill ("Down to hang" / "Ask me" / "Busy")
- Multi-select: checkmark circle (orange filled when selected, muted border when not)
- Min 1 required. "Next" shows selected count: "Next (2 selected)"
- Pre-fill: if `userId` param is set, that person starts selected

### Step 3 — Details
**Title field:** Text input, pre-filled as `{Category} with {first friend name}` (e.g. "Dinner with Jamie"). Updates automatically when a place is selected.

**Date & Time field:** Tappable row with SVG chevron. Opens native `DateTimePicker`. Shows "Fri 18 Apr · 7:30 pm" after selection.

**Location field:**
- On mount: show "Search a place…" placeholder + contextual suggestions (see Places section below)
- On focus/type: show Google Places Autocomplete dropdown below the input — matched characters bold in orange, place type + distance + open/closed status
- On selection: field transforms into a confirmed place card (green border, place name + address + rating + "✓")
- Title field auto-updates to include the place name when a place is selected (only if title is still default)
- Clear (×) button appears while typing

**Note field:** Optional multiline, max 200 chars, char counter at limit.

### Step 4 — Confirm
- Dark card (`#181614`) showing full summary: category label, Fraunces italic title, date, address, invited people (initials avatars + names)
- Orange gradient top band (3px)
- Primary CTA: "Send invites" (full-width orange)
- Secondary escape: "Save as draft" (quiet text link below CTA, 11.5px warm gray)
- On send: navigate to `/(app)/(tabs)/motives/[id]` (new motive ID returned by API)

---

## 4. Google Places Integration

All Places API calls are **proxied through the Hono API** — the Google API key never touches the client.

### Contextual suggestions (on step 3 mount, before typing)
`GET /api/places/nearby?category=<category>&lat=<lat>&lng=<lng>`

Server maps category to Google Places type:
| Category | Google Places type |
|---|---|
| Food & Drinks | `restaurant` |
| Outdoors | `park` |
| Catch-up | `cafe` |
| Movies | `movie_theater` |
| Active | `gym` |
| Party | `bar` |
| Gaming | `amusement_center` |
| Travel | (skip — no local suggestions) |
| Creative | `art_gallery` |

Returns: top 3 by rating × distance score. Each result: `{ placeId, name, address, rating, reviewCount, distanceKm, isOpen, categoryEmoji }`.

Location permission:
- Granted → use device coords
- Denied → show "Enable location for suggestions" placeholder row, text search still works

### Autocomplete (on typing)
`GET /api/places/search?q=<query>&lat=<lat>&lng=<lng>`

Calls Google Places Text Search / Autocomplete API. Returns: `{ placeId, name, address, distanceKm, isOpen, type }`.

Displayed: matched portion of name bold in orange, address + distance in warm gray.

### Place detail (on selection)
`GET /api/places/detail?placeId=<id>`

Stores on the motive: `placeName`, `placeAddress`, `placeId`, `lat`, `lng`.

---

## 5. Motive Detail (`[id].tsx`)

### Pre-motive (status: planning / confirmed)
- Back button (circular, SVG chevron) + "Motives" label
- Category label pill (colored text on tinted background, no emoji)
- Fraunces italic title (21px)
- Date and address in plain text (11px warm gray), no icon prefix
- **RSVP section:**
  - "I'm going" — full-width orange gradient primary button (14px bold)
  - "Maybe" | "Can't make it" — equal-width secondary buttons below (white, muted border)
  - Creator sees "Edit" + "Cancel" instead
- **Attendees section:**
  - Gradient initials avatars (44px) with outline ring: orange = invited, green = going, gray = declined
  - Name (9px) + status label ("Going", "Invited", "Declined") under each avatar
  - No separate legend needed — status label IS the legend
- **Activity feed:**
  - Colored 6px dot + plain text description + relative timestamp
  - Dot colors: green = accepted, orange = viewed/invited, red = declined, gray = created

### Declined invite state (invitee perspective)

If an invitee taps "Can't make it":
- Their avatar ring turns gray, status label reads "Declined"
- The motive **remains visible** in their list under the "All" filter, with a "Declined" badge on the card
- The "Active" filter tab does **not** show declined motives
- They can change their RSVP to "Going" or "Maybe" at any time before the motive date

### Post-motive (status: past)
- "Past motive" label pill (green)
- Orange gradient "Add your memories" banner (camera SVG icon, no emoji)
- All attendees show green ring + "Went" label
- If memories already added: banner replaced by memory preview (card thumbnail + vibe tags)

---

## 6. Memory Flow (`[id]/memory.tsx`)

4-step dark-background flow. Progress bar fills across all steps. Step counter top-right. Back label is the motive title.

### Step 1 — Vibe Tags
- "How was it?" (Fraunces italic)
- "Pick at least 3 words" subtext
- Min-3 counter bar: "Selected — 3 / 3 min ✓" (orange when met, muted when not)
- Wrap grid of vibe pill tags (emoji + label — emoji stays, it's the semantic identity)
- "Next" CTA disabled until ≥3 selected

**Vibe tag pool for motive context:**
General: Legendary, Too funny, Deep convos, Good music, Chill, Wholesome, Late one, Spontaneous, Overdue, Needed this
Food-specific: Great food, Perfect spot, Tried something new
Outdoors-specific: Fresh air, We went too far, Worth every step

### Step 2 — Photos
- "Add some photos" (Fraunces italic), "Optional — up to 6" subtext
- 3×2 dashed grid. Filled slots: colored photo placeholder with SVG `×` remove button (top-right of each)
- Empty slots: dashed border, SVG `+`
- Tapping any empty slot → `expo-image-picker` (gallery + camera)
- "Skip" text link (always visible above CTA)
- "Next" CTA

### Step 3 — Rating
- "Would you do this again?" (Fraunces italic)
- 5-emoji scale: 😬 Rough · 😐 Meh · 🙂 Good · 😄 Great · 🔥 Iconic
- Selected emoji: enlarged (44px) with orange glow drop-shadow
- Unselected: 34px, 30% opacity
- **Venue rating subsection** (only shown if motive had a place set):
  - Separate labeled card: "VENUE" label + place name + 5 SVG stars (tappable)
  - SVG stars, not ⭐ emoji
- "Next" CTA

### Step 4 — Memory Card
- Progress bar complete (full orange)
- "Memory Card" eyebrow label (9px, orange, letter-spaced)
- Card preview centered:
  - 3px orange gradient top band
  - "Food & Drinks · Apr 18" eyebrow (8px, orange, no emoji)
  - Fraunces italic motive title
  - Overlapping initials avatars
  - 3×1 photo strip (colored blocks in mockup, real photos in prod)
  - Vibe tags as text only: "Legendary · Too funny" (no emoji in card)
  - "Icebreaker" branding (Georgia italic, bottom-right, 18% opacity)
- "Share" primary CTA (text only, no icon prefix)
- Save button: SVG download arrow (no 💾 emoji)

---

## 7. API Endpoints Required

### Motives CRUD
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/motives` | Create motive — see request body below |
| `GET` | `/api/motives` | List user's motives (query: `?filter=active\|past\|all`) |
| `GET` | `/api/motives/:id` | Motive detail + attendees + activity |
| `PATCH` | `/api/motives/:id` | Update title, date, location, status |
| `DELETE` | `/api/motives/:id` | Creator only — soft delete |
| `POST` | `/api/motives/:id/rsvp` | Body: `{ status: 'going' | 'maybe' | 'declined' }` |
| `POST` | `/api/motives/:id/invite` | Invite additional people post-creation |

#### `POST /api/motives` — request body

Invited users and status are included in the creation call. There is no separate invite step on creation.

```typescript
{
  title: string,                  // required
  category: string,               // required
  status: 'planning' | 'draft',   // 'draft' if "Save as draft" tapped, 'planning' if "Send invites"
  scheduledAt: string | null,     // ISO timestamp, nullable for drafts
  placeName: string | null,
  placeAddress: string | null,
  placeId: string | null,
  lat: number | null,
  lng: number | null,
  note: string | null,
  invitedUserIds: string[],       // empty array for drafts, populated for send
}
```

- When `status: 'draft'`: `scheduledAt` and `invitedUserIds` may be empty. No push notifications sent.
- When `status: 'planning'`: push notifications sent to all `invitedUserIds`. `scheduledAt` is required.
- Returns: `{ id: string }`

### Memory
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/motives/:id/memory` | Save vibe tags, rating, venue rating, photos |
| `GET` | `/api/motives/:id/memory` | Get memory (vibe tags, photos, card URL) |

### Places
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/places/nearby` | Contextual suggestions by category + coords |
| `GET` | `/api/places/search` | Autocomplete by query + coords |
| `GET` | `/api/places/detail` | Place details by Google Place ID |

---

## 8. Schema Additions (Drizzle)

### `motives` table
```typescript
{
  id: uuid (PK),
  creatorId: uuid (FK users.id),
  title: text,
  category: text,           // 'food' | 'outdoors' | 'catchup' | etc.
  status: text,             // 'draft' | 'planning' | 'confirmed' | 'past' | 'cancelled'
  scheduledAt: timestamp,
  placeName: text,
  placeAddress: text,
  placeId: text,            // Google Place ID
  lat: decimal,
  lng: decimal,
  note: text,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

### `motive_attendees` table
```typescript
{
  id: uuid (PK),
  motiveId: uuid (FK motives.id),
  userId: uuid (FK users.id),
  role: text,               // 'creator' | 'invited'
  rsvpStatus: text,         // 'invited' | 'going' | 'maybe' | 'declined'
  rsvpAt: timestamp,
  createdAt: timestamp,
}
```

### `motive_memories` table
```typescript
{
  id: uuid (PK),
  motiveId: uuid (FK motives.id),
  userId: uuid (FK users.id),
  vibeTags: text[],
  rating: integer,          // 1–5
  venueRating: integer,     // 1–5, nullable
  photoUrls: text[],
  cardUrl: text,            // generated card PNG URL
  createdAt: timestamp,
}
```

---

## 9. Memory Card Generation

**Stack:** Satori (JSX → SVG) → Sharp (SVG → PNG) → Supabase Storage

**Trigger:** `POST /api/motives/:id/memory` — after saving the memory row, enqueue an Inngest job `motives/generate-memory-card`.

**Job:** Renders a JSX template server-side (Satori), outputs PNG, uploads to Supabase Storage at `memory-cards/{motiveId}/{userId}.png`, writes URL back to `motive_memories.cardUrl`.

**Card dimensions:** 1080×1080px (square, Instagram-safe).

---

## 10. T+14 Resurfacing

Inngest job `motives/resurface-memory`, scheduled when the motive's `scheduledAt` passes:

- Fires at `scheduledAt + 14 days`
- Checks: motive has status `past` AND at least one `motive_memories` row exists with a non-null `cardUrl`
- If no memory was added by anyone: job exits silently with no notification sent
- If memory exists: sends push notification to each attendee who added a memory: "Remember this? — {motive title}"
- Deep links to `/(app)/(tabs)/motives/{id}/memory-card`

---

## 11. Prompt → Motive Pre-fill

When user taps "Make a plan together" on the match reveal screen:

```
router.push(`/(app)/(tabs)/motives/create?category=food&userId=${matchedUserId}`)
```

Create wizard reads `category` param → pre-selects Step 1 category, skips animation.
Reads `userId` param → pre-selects that person in Step 2.
User lands directly on Step 1 but sees category already chosen; dots still show Step 1 active.

---

## 12. Design System Notes

- All metadata rows use **plain text**, no emoji prefixes (`📅` `📍` `📤` `💾` `📸` removed everywhere)
- Initials avatars replace `👤` throughout
- Tab bar icons are **CSS-drawn geometric shapes** (target, speech bubble, profile silhouette) — not emoji
- Star ratings use **SVG stars**, not ⭐ emoji
- Action buttons are **text-only** ("Share", "Next", "Send invites", "Save as draft")
- Emoji **retained** in: category grid cells, vibe tags, experience rating scale (these are semantic content, not decoration)
- Camera icon on "Add your memories" banner: SVG, not 📸
- Save-to-roll button: SVG download arrow, not 💾

---

## 13. Out of Scope (Phase 2+)

- Real-time attendee updates via Supabase Realtime (Inngest push covers Phase 1)
- Collision detection between overlapping motives
- Venue voting within a motive
- Journey motives (multi-stop)
- Group chat auto-creation from motive attendees
