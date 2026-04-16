# Discovery Page — Design Spec
**Date:** 2026-04-12
**Status:** Approved by user
**Scope:** Full Discovery tab UI/UX — prompt system, match reveal, people discovery, circle discovery, circle pulse

---

## Context

Discovery is the home tab and primary retention mechanic of Icebreaker. Users open it daily to answer a prompt and see who in their circle thinks the same. The design drives **active participation**, not passive scrolling. Every element has one job: get the user to do something, not watch others do things. No feed. No infinite scroll.

---

## Page Structure (scroll order)

```
1. Prompt Card           ← primary daily action
2. People You Might Know ← FOF discovery (compact rows)
3. Circles You Can Join  ← group discovery (independent from people)
4. Circle Pulse          ← 2-3 curated activity signals
```

"See all" (People) and "Browse all" (Circles) links are **out of scope for this phase** — they appear as tappable labels but navigate to a stub screen with "Coming soon."

---

## Section 1 — Prompt Card

### Loading state
While `GET /api/prompts/today` is in flight: show a skeleton version of the dark card — same gradient background, border-radius, and dimensions, with 3 shimmer placeholder bars where the question and options will appear. No spinner.

### Error state
If the request fails: show the dark card with "Couldn't load today's prompt. Tap to retry." centered in white, with a retry button in `#FF6B35`.

### Unanswered state

**Visual:** Full-width dark cinematic card (`linear-gradient(145deg, #1a1a1a, #2d1a0e)`), border-radius 20px, warm glow accent in top-right corner (`rgba(255,107,53,0.2)` circle, ~50×50px, positioned -15px from top-right edge).

**Header row:** Small orange dot (3×3px, `#FF6B35`) + `DAILY PROMPT` label (8px, `#FF6B35`, uppercase, 0.5px letter-spacing).

**Question:** Fraunces serif, 13–16px, `#fff`, line-height 1.4.

**Answer interaction — 5 prompt types:**

| Type | Format | Use case |
|---|---|---|
| `pick_your_camp` | 3 labeled options with emoji + phrase | Personality/lifestyle questions |
| `spectrum` | 4-step scale from one extreme to the other | Gradient preference questions |
| `this_or_that` | Bold 2-option binary with "or" divider | Clear lifestyle divides |
| `for_you` | Same as pick_your_camp + vibe tag badge | Interest-matched personalized prompts |
| `have_you_ever` | Yes / No buttons + optional story field | Relatable relatable guilty/proud moments |

**Reaction option UI:**
- Contained in a `rgba(255,255,255,0.06)` rounded container (border-radius 14px, padding 8px 6px)
- Each option: emoji (18–22px) + custom label (8–9px, `rgba(255,255,255,0.85)`, semibold)
- Options are written specifically per prompt — never generic emojis mismatched to the question
- **Selected state:** highlight option with `rgba(255,107,53,0.2)` background + `1.5px solid rgba(255,107,53,0.6)` border; all others dim to 45% opacity
- **Re-answering:** allowed before tapping the reveal CTA. The `prompt_responses` upsert replaces the existing row.

**After selecting a reaction:**
- Optional "add your story" field slides in below the options (animated, ~200ms ease-out)
- Field: `rgba(255,255,255,0.08)` background, `1px solid rgba(255,107,53,0.4)` border, Fraunces italic placeholder ("What did you do?")
- Label above field: `"✨ Add your story (optional)"` in `rgba(255,107,53,0.8)`, 8px semibold
- CTA button appears below: `"See who agrees →"` — full-width, `#FF6B35` background, 10px bold white text

**Teaser count (visible after selecting, before revealing):**
- Small card below the prompt card: overlapping mini-avatars (16px circles) + `"N people in your circle also chose [emoji] today"`
- Threshold to show: ≥ 1 circle member has answered the same option. If 0, hide this card.
- Tapping this card is equivalent to tapping "See who agrees →"

**Vibe-tagged prompts (Type `for_you`):**
- Pill above the question: `[emoji] Based on: [vibe tag label]` — `rgba(255,107,53,0.15)` background, `rgba(255,107,53,0.3)` border, `rgba(255,107,53,0.8)` text, 8px semibold
- 70% of daily prompts are universal (`is_universal = true`); 30% are interest-matched
- Server selects a matched prompt using: `SELECT id FROM daily_prompts WHERE active_date = TODAY AND (is_universal = true OR tags && :user_vibe_labels) LIMIT 1`
- `user_vibe_labels` is computed at request time: `SELECT array_agg(vt.label) FROM user_vibe_tags uvt JOIN vibe_tags vt ON vt.id = uvt.tag_id WHERE uvt.user_id = :me`
- If no interest-matched prompt exists for today, falls back to the universal prompt

---

### Answered state (compact)

When the API response for `GET /api/prompts/today` includes the user's existing `prompt_responses` row, render the compact state immediately — no unanswered state shown.

**Compact card:**
- `ANSWERED ✓` badge (8px, `#FF6B35`, semibold, uppercase)
- Question text truncated to 1 line, `rgba(255,255,255,0.65)`
- User's answer: italic white, 11px Fraunces
- Mini match teaser: overlapping avatars + `"N agreed → tap to reveal"` in `#FF6B35`
- Tapping the compact card triggers the match reveal flow

---

### Match reveal

**Trigger:** User taps "See who agrees →" or the compact answered card.

**Loading state:** While `GET /api/prompts/:id/matches` is in flight, show the full-screen dark overlay immediately (instant), then a centered spinner in `#FF6B35`. Replace spinner with content when response arrives.

**Visual:** Full-screen dark overlay (`#0f0f0f`), particle accent dots (small squares 3–6px, orange/warm tones, 20–40% opacity, scattered at fixed positions). Tab bar remains visible but dims.

**Navigation after dismiss:** Swipe down or tap "↓ Back to Discovery" returns user to the Discovery tab with the prompt card already in its compact/answered state (it was already answered before the reveal was triggered). Scroll position resets to top.

#### State A — Matches exist

Content (vertically centered):
1. Reaction echo pill: `"[emoji] You all said: [option label]"` — `rgba(255,107,53,0.15)` bg, `rgba(255,107,53,0.3)` border
2. Match count: 42px bold DM Sans white
3. Subtitle: "people in your circle agree" — `rgba(255,255,255,0.45)`, 11px
4. Overlapping avatars: 52×52px, gradient bg, 3px `#0f0f0f` border, -16px overlap, max 3 shown
5. Name list: first names comma-separated — `rgba(255,255,255,0.4)`, 10px
6. Stories block: semi-transparent card (`rgba(255,255,255,0.06)`, `rgba(255,255,255,0.08)` border, 14px border-radius). Each row: `"[FirstName] · "` (9px, muted) + italic Fraunces quote (10px, `rgba(255,255,255,0.85)`). Max 3 stories shown. If user added no story, row is omitted for that person.
7. Primary CTA: `"Make a plan together →"` — `#FF6B35` pill. **Navigation:** pushes to Motive creation screen (Chat tab) with all matched users pre-selected as invitees.
8. Secondary: `"↓ Swipe down to go back"` — `rgba(255,255,255,0.35)`, 10px

#### State B — First in circle, FOF adjacents exist

- `🌅` emoji icon (56×56, `rgba(255,107,53,0.15)` bg, `rgba(255,107,53,0.2)` border, border-radius 28px)
- Heading: "Nobody in your circle yet —" (Fraunces, `rgba(255,255,255,0.7)`)
- Subheading: "but these people nearby think the same" (Fraunces, `#fff`)
- 1–2 FOF users shown at **reduced prominence**: same avatar + name display but at 60% opacity, smaller (36px avatars), with "suggested · [mutual friend name]" as context
- "You're first" card below (same style as State C but shorter)
- Notification toggle: `"Notify me when someone agrees"` — `rgba(255,255,255,0.07)` bg, toggle switch pre-set ON. Tapping OFF sets `prompt_response_notifications.opted_in = false` for this prompt.

#### State C — First in entire network

- `🌅` icon (same as State B)
- Heading: "Bold take." (Fraunces, 18px, `#fff`)
- Subheading: "You might be rarer than you think." (Fraunces, `rgba(255,255,255,0.8)`)
- Body: "We'll ping you the moment someone agrees." (DM Sans, 11px, `rgba(255,255,255,0.4)`)
- Notification toggle: same as State B, pre-set ON
- Secondary: `"↓ Swipe down to explore"` — `rgba(255,255,255,0.3)`

---

### Matching algorithm

- **Exact:** Same `option_key` → State A match
- **Adjacent (Spectrum only):** `ABS(option_index - :my_index) <= 1` → shown in State B at reduced prominence (60% opacity, smaller avatars)
- **Story text:** Decorative only in V1. Shown in reveal card if present. Not used for matching.
- **No ML/AI** required. All SQL with indexed lookups on `prompt_id + option_key + user_id`.

---

## Section 2 — People You Might Know

**Loading:** 2 skeleton rows (same height as real rows, shimmer animation).
**Error:** Section hidden entirely. No error message shown — avoids drawing attention to failure.
**Empty (fewer than 3 circle members):** Section hidden. Contact sync nudge shown instead: small card with "Add your number to find friends automatically" + phone icon. Tapping navigates to phone entry in settings.

**Row — collapsed:**
- 30×30 avatar (gradient background per person, initials or emoji placeholder)
- Name: 10px bold `#1a1a1a`
- Context: `"via [friend name] · [emoji] [tag], [emoji] [tag]"` — 8px `#999`
- `▸` arrow right-aligned

**Row — expanded (tap to toggle, tap again to collapse):**
- `1.5px solid #FF6B35` border replaces default `#ede8e0`
- Shared vibe tag pills slide in (animated, 150ms): `fdf0e8` bg, `e8450a` text for each shared tag
- "Add to circle" CTA: full-width `#1a1a1a` dark pill, 8px bold white

**"See all" link:** Out of scope. Tapping shows "Coming soon" stub screen.

---

## Section 3 — Circles You Can Join

**Intentionally separated from People section.** Joining a circle ≠ connecting with individuals.

**Loading:** 2 skeleton rows.
**Error:** Section hidden entirely.
**Empty (no circle suggestions):** Section hidden entirely.

**Row (always fully visible — no expand/collapse):**
- 30×30 circle icon with category emoji, colored background (`#e8f0fe` for academic, `#fce4ec` for sport, `#e8f5e9` for interest, etc.)
- Circle name: 10px bold `#1a1a1a`
- Meta: `"N members · X friends inside"` — 8px `#999`. If 0 friends: `"N members · no friends yet"`
- "Join" button: `#1a1a1a` dark pill, always right-aligned, no expand needed

**"Browse all" link:** Out of scope. Tapping shows "Coming soon" stub screen.

**Circles requiring admin approval:** "Join" becomes "Request to join". After tapping: button changes to "Pending ✓" (disabled, `#999` background). No full-screen takeover. A toast appears: "Request sent — the admin will review it." Persisted as `group_circle_members.status = 'pending'`.

**Join confirmation — full-screen takeover (open circles only):**
- Same dark overlay pattern (`#0f0f0f`) as match reveal
- Circle icon: 64×64, colored bg, emoji, border-radius 20px
- `"YOU'RE IN ✦"` — 11px `#FF6B35`, semibold, uppercase
- Circle name: Fraunces 18px white
- `"N members now in your circle"` — 10px `rgba(255,255,255,0.4)` (N = total member count from API response)
- 3-item list (icon + text):
  - 💬 Added to the group chat
  - 👥 Members appear in Discovery as potential connections
  - 🎯 Prompts sometimes tailored to group's interests
- Primary CTA: `"Go to group chat →"` — `#FF6B35` pill. Navigates to the circle's chat thread in Chat tab.
- Secondary: `"↓ Back to Discovery"` — dismisses takeover

**What joining does (technical):**
1. Inserts `group_circle_members` row: `status = 'active'`, `joined_at = now()`
2. All existing circle members inserted into `fof_suggestions` for this user (async, background)
3. User added to the circle's shared `chats` record (or a new one created if none exists)

---

## Section 4 — Circle Pulse

**Purpose:** 2–3 curated cards. Action-oriented. Not a feed.

**Loading:** Hidden (section does not show skeleton — avoids layout shift).
**Error:** Section hidden entirely.
**Empty:** Section hidden entirely — no placeholder.

### Card priority order (when multiple types qualify, show top 2–3 by this priority):
1. Prompt participation card (if ≥ 3 circle members answered today and user has answered)
2. Open Motive card (if an open Motive exists with ≥ 1 circle member going)
3. New circle member card (if a circle member joined a new circle in the last 48h)
4. Memory card (if a past Motive exists from 14 ± 3 days ago with this user as attendee)

### Card types:

**Prompt participation:**
- Trigger: ≥ 3 circle members answered today's prompt (any option). Only shown after the current user has also answered.
- Text: `"N people in your circle answered [emoji] today"` — tapping opens the match reveal for today's prompt
- Never shown before user has answered (would spoil the prompt)

**Open Motive:**
- Trigger: A Motive with `status = 'open'` exists where ≥ 1 circle member is an attendee
- Text: `"[Motive title] — [N] friends going"` — tapping opens the Motive RSVP screen
- **NEVER shown if `status != 'open'`** — locked Motives are private

**New circle member:**
- Trigger: A circle member joined any public circle within the last 48 hours
- Text: `"[Name] joined [Circle name]"` — tapping opens that circle's detail/join screen
- Only shows circles the current user can also join (no private/invite-only circles)

**Memory:**
- Trigger: A past Motive exists where `scheduled_at` was 14 ± 3 days ago AND the current user was an attendee
- Text: `"This time 2 weeks ago: [Motive title] with [Name]"` — tapping opens Motive creation pre-filled with same title and previous attendees
- Only the current user's own memories. Never surfaces Motives the user wasn't part of.
- Lookback window: 14 ± 3 days only (11–17 days ago). Not "on this day last year."
- Minimum attendees to show: ≥ 2 (must have been with at least 1 other person)

---

## API endpoint specs

### `GET /api/prompts/today`
**Auth:** Required  
**Response:**
```json
{
  "prompt": {
    "id": "uuid",
    "question": "string",
    "type": "pick_your_camp | spectrum | this_or_that | for_you | have_you_ever",
    "options": [{ "key": "string", "emoji": "string", "text": "string", "index": 0 }],
    "tags": ["string"],
    "is_universal": true,
    "active_date": "2026-04-12"
  },
  "userResponse": null | {
    "option_key": "string",
    "option_index": 0,
    "story_text": null | "string",
    "responded_at": "ISO8601"
  }
}
```
If `userResponse` is non-null, client renders the answered/compact state immediately.

### `POST /api/prompts/:id/respond`
**Auth:** Required  
**Body:** `{ option_key: string, option_index: number, story_text?: string }`  
**Behavior:** Upsert on `(user_id, prompt_id)` — allows re-answering before reveal.  
**Response:** `{ ok: true }`

### `GET /api/prompts/:id/matches`
**Auth:** Required  
**Response:**
```json
{
  "state": "matches | first_in_circle | first_in_network",
  "matches": [{
    "userId": "uuid",
    "name": "string",
    "avatarUrl": null | "string",
    "optionKey": "string",
    "storyText": null | "string"
  }],
  "adjacentMatches": [{ same shape, only for spectrum type }],
  "totalCount": 4
}
```

### `GET /api/discovery/people`
**Auth:** Required  
**Response:** `{ people: [{ id, name, avatarUrl, mutualFriendName, sharedVibeTags: [{emoji, label}], fofScore }] }`  
**Pagination:** `?limit=10&offset=0` (no pagination in V1 — cap at 10 results server-side)

### `GET /api/discovery/circles`
**Auth:** Required  
**Response:** `{ circles: [{ id, name, categoryEmoji, categoryColor, memberCount, friendsInsideCount, requiresApproval }] }`  
**Cap:** 5 results

### `POST /api/circles/:id/join`
**Auth:** Required  
**Response:**
```json
{
  "ok": true,
  "status": "active | pending",
  "memberCount": 142,
  "chatId": "uuid"
}
```
`status = 'pending'` for admin-approval circles. `chatId` for navigating to the group chat.

### `GET /api/discovery/pulse`
**Auth:** Required  
**Response:**
```json
{
  "cards": [{
    "type": "prompt_participation | open_motive | new_circle_member | memory",
    "text": "string",
    "emoji": "string",
    "actionLabel": "string",
    "actionTarget": { "type": "prompt_reveal | motive | circle | motive_create", "id": "uuid" }
  }]
}
```
Max 3 cards returned, already priority-sorted server-side.

---

## Schema additions

### `daily_prompts` table — add columns:
- `type TEXT NOT NULL DEFAULT 'pick_your_camp'`
- `options JSONB NOT NULL DEFAULT '[]'` — array of `{key, emoji, text, index}`
- `tags TEXT[] NOT NULL DEFAULT '{}'`
- `is_universal BOOLEAN NOT NULL DEFAULT true`

### `prompt_responses` table — add columns and clarify:
- `option_key TEXT` — the selected option's key string. Nullable for backwards compatibility.
- `option_index INT` — 0-based position, used for adjacent matching on spectrum prompts.
- `story_text TEXT` — replaces `response_text` as the optional elaboration field.
- **`response_text` is DEPRECATED** — retained in DB to avoid breaking existing data, ignored in new code. New responses write to `option_key` + `story_text` only.
- **Primary key `(user_id, prompt_id)`** is kept. Upsert (`ON CONFLICT DO UPDATE`) replaces the row, enabling re-answering.

---

## Verification

1. `GET /api/prompts/today` returns prompt + userResponse. If userResponse is non-null, compact card renders immediately with no flash.
2. Selecting a reaction highlights it, dims others, and slides in the optional story field.
3. Tapping "See who agrees" calls `GET /api/prompts/:id/matches`, shows loading spinner inside the dark overlay, then renders the correct state (A/B/C) based on `state` field.
4. Match reveal "Make a plan together" navigates to Motive creation with matched users pre-selected.
5. Swipe down from match reveal returns to Discovery with prompt card in compact/answered state.
6. Notification toggle in States B/C saves preference to `prompt_response_notifications.opted_in`.
7. People rows: tapping expands, shows vibe tags + Add button, tapping again collapses.
8. Circles: "Join" on open circle → full-screen confirmation → "Go to group chat" navigates to chatId from API. "Request to join" → button becomes "Pending ✓" + toast.
9. Pulse: any Motive with `status != 'open'` is absent. Memory cards only appear for past Motives the user attended, 11–17 days ago, with ≥ 2 attendees.
10. "See all" and "Browse all" links navigate to a stub "Coming soon" screen.
