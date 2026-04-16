# Auth UI Redesign — Design Spec
**Date:** 2026-04-11
**Scope:** Welcome screen, sign-up/sign-in screen, magic link confirmation screen
**Status:** Approved by user

---

## Context

The existing auth flow dropped users directly into a phone number entry screen — no welcome, no warmth, no brand moment. This redesign establishes a proper first impression and a simpler, more human sign-up flow. Phone number collection is moved out of auth entirely and into onboarding step 4 (contact sync), where it has context and the user understands why.

---

## Design Direction

**Visual language:** Warm editorial. Not a tech product, not a fintech app. Feels like a space a person made.

**Auth screens force light mode.** No dark mode variants for these screens — the warm cream background is a deliberate brand decision that must not invert.

| Token | Value | Notes |
|---|---|---|
| Background | `#FBF5EC` (`backgroundWarm`) | Warm cream — never pure white. Auth screens only. |
| Grain texture | SVG fractalNoise, 3% opacity | Adds warmth, breaks the "AI app" feel |
| Headline font | Fraunces (serif), 28–34px | Left-aligned, tight leading (1.05–1.15) |
| Body font | DM Sans, 14–16px | Warm gray `#9a8a7a` |
| Primary CTA | `#1a1a1a` dark pill | Orange is NOT used on buttons |
| Orange accent | `#FF6B35` | Used on: one italic word in headline, 2px rule, inline links only |
| Email input border | `2px #1a1a1a` | Dark border signals "this is the main action" |
| Google button border | `1.5px #e0d5c8` | Light — present but not competing |
| Wordmark letter spacing | `0.05em`, uppercase | Small, confident |

**Centering rule:** CTAs (buttons + secondary links) are full-width and center-aligned within the screen's horizontal padding. Headline content is left-aligned. The magic link confirmation state (Screen 3) centers all content vertically within the safe area inset region (not full screen height).

---

## Theme Token Addition

Add to `constants/theme.ts` under `Colors.light`:
```ts
backgroundWarm: '#FBF5EC',  // Auth screens only — warm cream, forces light mode
```
No dark mode counterpart — auth screens use `{ backgroundColor: Colors.light.backgroundWarm }` directly, ignoring the system color scheme.

---

## Screen 1 — Welcome

**Route:** `app/(auth)/welcome.tsx`

**Purpose:** First impression. Establish the brand voice, give the user a reason to care, and present two clear paths (new vs returning).

### Layout
- `SafeAreaView` wrapping full screen
- 🧊 wordmark + "ICEBREAKER" (uppercase, 0.05em tracking) — left-aligned, top
- Headline block — left-aligned, grows to fill available vertical space via `flex: 1`:
  - Fraunces 34px: *"The group chat that becomes"*
  - Next line: *"the real thing."* — italic, `color: #FF6B35`
  - 2px × 28px orange rule below headline
  - Sub-copy (DM Sans 16px, `#9a8a7a`): *"Shared interests. Spontaneous plans. Memories worth keeping."*
- CTAs pinned to bottom, full-width with horizontal padding:
  - Primary: `#1a1a1a` dark pill, full width → **"Get started"**
  - Secondary: small text, centered → *"Have an account? "* + `#FF6B35` **"Sign in"**
- Legal line (centered, 11px, `#c0b0a0`): *"By continuing you agree to our Terms of Service and Privacy Policy."*

### Navigation
- "Get started" → `/(auth)/signup`
- "Sign in" → `/(auth)/signup` (same screen — no separate sign-in flow)

---

## Screen 2 — Sign Up / Sign In

**Route:** `app/(auth)/signup.tsx`

**Purpose:** Single screen handles both new and returning users. Email is the hero action; Google is a quiet alternative.

### Layout
- Back arrow ("← Back") — top left, `#b0a090`, DM Sans 14px. Navigates back to welcome.
- Headline block — left-aligned:
  - Fraunces 30px: *"Let's get"* / *"you in."*
  - 2px × 28px orange rule below headline
- Email input — **hero action**, full width:
  - Border: `2px solid #1a1a1a` (dark — signals importance), focused state keeps same dark border
  - Border radius: 14px, background `#fff`
  - Floating label inside: "EMAIL ADDRESS", 8px uppercase, `#b0a090`
  - Placeholder: *"you@example.com"*, `#c8b8a8`
- Primary CTA, full width: `#1a1a1a` pill → **"Send magic link"**
- Divider: thin `#e0d5c8` rules with *"prefer Google?"* in 9px warm gray, centered
- Google button, full width:
  - Border: `1.5px solid #e0d5c8`, background `#fff`, border radius 12px
  - Google color SVG logo + *"Continue with Google"*, DM Sans 14px semibold, `#555`

### Behavior — Magic link
- Client-side validation before API call: email must be non-empty and contain `@`. If invalid, show error inline below the input in `colors.error` (`#E63946`), no API call made.
- While the `signIn.magicLink` call is in-flight: button is disabled and label changes to *"Sending…"* (no spinner — label change is sufficient).
- On success: navigate to `/(auth)/magic-link-sent` passing the email as a route param.
- On failure (network error, rate limit, etc.): show error message inline below the email input. Button returns to "Send magic link". Do not navigate.

### Behavior — Google
- Tapping "Continue with Google" calls `authClient.signIn.social({ provider: 'google' })` — BetterAuth's Expo plugin opens Google OAuth in `expo-web-browser`.
- While the OAuth sheet is open: button is disabled with label *"Opening Google…"*.
- On success: navigate to `/(app)/(tabs)/discovery` (BetterAuth session is now set). If `onboarding_completed = false` on the user object, navigate to `/(app)/onboarding/step-1` instead.
- On cancellation or dismissal (user closes the browser sheet without completing): return to signup screen silently — no error shown, button re-enables.
- On failure (OAuth error returned): show a brief inline error below the Google button: *"Google sign-in failed. Try again or use email."*

### Behavior — Keyboard
- Email input auto-focuses on mount.
- `returnKeyType="go"` on the input triggers "Send magic link".

---

## Screen 3 — Magic Link Sent

**Route:** `app/(auth)/magic-link-sent.tsx` — a separate route (not inline state).

**Purpose:** Calm confirmation. Tell the user exactly what to do and reassure them it worked.

### Layout
All content is centered horizontally. The content block is centered vertically within the safe area inset region.

- 🧊 wordmark + "ICEBREAKER" — top-left, same style as Screen 1. Tapping it navigates to `/(auth)/welcome`. This is the only exit from this screen.
- ✉️ emoji in `#FFE8DC` warm badge (48×48, border radius 14px), centered
- Headline (centered): Fraunces 28px, `#1a1a1a`: *"Check your"* / *"email."*
- 2px × 28px orange rule, centered below headline
- Body (centered, DM Sans 15px, `#9a8a7a`, line height 1.65):
  - *"We sent a link to"*
  - User's email address — DM Sans semibold, `#1a1a1a`
  - *"Tap it to get in."*
- Secondary action (centered, DM Sans 13px, `#b0a090`):
  - *"Didn't get it?"* + `#FF6B35` **"Resend"**
  - Resend is disabled with a 30-second countdown shown as *"Resend in 24s"* during cooldown

### Behavior
- Email address is received via route param from `/(auth)/signup` (e.g. `params.email`).
- "Resend" re-calls `authClient.signIn.magicLink({ email })` and resets the 30-second cooldown.
- There is no back button on this screen — user cannot return to signup from here (prevents re-sending confusion). To use a different email, the user taps the back-to-welcome wordmark or restarts the app.
- This screen has no timeout — it stays visible until the user taps the magic link or force-quits.

### Token expired / invalid state (handled in callback)
When the user taps an expired or already-used magic link, `/(auth)/magic-link-callback.tsx` fails to establish a session. In this case, redirect to `/(auth)/signup` and pass a query param `?error=link_expired`. The signup screen checks for this param on mount and shows an inline message above the email input: *"That link has expired. Enter your email to get a new one."* in `colors.error`.

---

## Screen 4 — Magic Link Callback (existing, minor update)

**Route:** `app/(auth)/magic-link-callback.tsx`

One change only: update the fallback redirect from `/(auth)/phone` (being deleted) to `/(auth)/signup?error=link_expired`.

No other changes to this file.

---

## Routing Changes

| Old route | New route | Reason |
|---|---|---|
| `/(auth)/phone` | removed | Phone moved to onboarding step 4 |
| `/(auth)/verify` | removed | Merged into signup screen |
| `/(auth)/signin` | removed | Merged into signup screen |
| — | `/(auth)/signup` | New unified sign-up/sign-in screen |
| — | `/(auth)/magic-link-sent` | New separate confirmation screen |

`app/index.tsx` redirects unauthenticated users to `/(auth)/welcome` (already implemented, no change).

---

## Files to Create / Modify

| File | Action |
|---|---|
| `constants/theme.ts` | Add `backgroundWarm: '#FBF5EC'` to `Colors.light` |
| `app/(auth)/welcome.tsx` | Rewrite with new design |
| `app/(auth)/signup.tsx` | Create — unified sign-up/sign-in screen |
| `app/(auth)/magic-link-sent.tsx` | Create — confirmation screen |
| `app/(auth)/magic-link-callback.tsx` | Update fallback redirect to `/(auth)/signup?error=link_expired` |
| `app/(auth)/_layout.tsx` | Update Stack: add `signup`, `magic-link-sent`; remove `phone`, `verify`, `signin`. All screens use `headerShown: false, animation: 'slide_from_right'`. |
| `app/(auth)/phone.tsx` | Delete |
| `app/(auth)/verify.tsx` | Delete |
| `app/(auth)/signin.tsx` | Delete |
| `app/index.tsx` | No change |
| `lib/storage.ts` | Remove `PHONE_SESSION_KEY` and `PHONE_NUMBER_KEY` exports (phone moved to onboarding) |

---

## What's Not Changing

- `lib/auth.ts` — BetterAuth client config unchanged
- `packages/api/src/routes/phone.ts` — kept for onboarding step 4 (contact sync) later
- All tab screens, onboarding screens, and the app group
