Berg — Alignment Sprint Brief
You are working on Berg, an existing codebase. The goal of this sprint is not to add features — it is to realign the existing product with a sharper, narrower positioning that has been worked out in product strategy. Most of your job is refactoring, reweighting, restricting, and cutting. Some of it is small additive work to enable measurement of the loop.
Before you touch any code, read PRODUCT_NORTH_STAR.md in this repo (or ask me to paste it if it isn't there yet). That document is the contract for what Berg is and isn't. Every change you make in this sprint must trace back to a principle or constraint in that document.
If at any point I propose something that contradicts the North Star doc, push back. Tell me which principle it violates and suggest the on-product version. Don't agree with me to be helpful.

Sprint goals, in priority order
This sprint has six work items. Do them in this order. Do not do later items before earlier items unless I explicitly tell you to.

1. Fix the matching loop's endpoint — make matches route correctly based on prompt type.
2. Add the missing measurement layer — prompt_matches as a first-class object.
3. Reweight FoF to favor mutual friends; pause the daily cron; compute on-demand.
4. Restrict chat scope to motive logistics and 1:1 DMs between connected friends only and for circles that are created or joined.
5. Reorder the discovery homepage to lead with prompt + circle activity, demote stranger surfaces.
6. Rename circles → friendships and group_circles → circles to fix the schema confusion.
   Each item below has a goal, the why, the specific changes required, and a definition of done. Stop and confirm with me after each item before moving to the next. Never bundle items into one PR — each one ships independently.

Item 1 — Match routing by prompt type
Goal
When a match surfaces, the notification and deep link should route differently depending on whether the prompt is motive-mappable (its options correspond to doable activities) or conversational (its options are personality/preference/story).
Why
Right now every match notification says "Sarah agrees with your take — see what they said" and deep-links to screen: 'discovery'. This works for personality prompts (where the value is seeing the friend's answer) but fails for intent-bearing prompts (where the value is converting the match to a real-world plan). The fix is to route by prompt type so we get both behaviors right without losing either.
Changes required
Schema:
• Add a motive_mappable boolean NOT NULL DEFAULT false column to daily_prompts. New Drizzle migration. Default false because most existing prompts are personality-based.
• Backfill the column: any prompt whose tags array contains a motive category (food, outdoors, catchup, movies, active, party, gaming, travel, creative — confirm full list against the motive category enum) should be set to motive_mappable = true. Anything else stays false. Write this as a one-off migration script in packages/api/src/scripts/.
Generation:
• Update packages/api/src/jobs/generate-prompts.ts so Gemini knows about motive-mappable vs conversational. The system prompt should specify that roughly 25% of the batch should be motive-mappable (intent-surfacing, with options that map to motive categories) and the rest should be conversational. The output JSON schema should include motiveMappable: boolean. Update the GeneratedPrompt type and validate() function accordingly.
Matching:
• Update packages/api/src/jobs/prompt-match.ts. After the existing match-count logic, branch the notification based on motiveMappable:
• If true: notification body becomes something like "also wants ${optionLabel}. Plan something?" and data is { screen: 'motive/create', promptId, optionKey, suggestedAttendees: [friendId] }.
• If false: keep the existing copy ("agrees with your take — see what they said") but change the deep link to { screen: 'match-detail', promptId, optionKey } — not to discovery. Discovery is a homepage, not a match destination.
Mobile:
• Add a deep link handler for screen: 'motive/create' that pre-fills the motive creation form with the prompt's category, suggested venues filtered by category and user location, and the matched friend(s) pre-invited.
• Add a deep link handler for screen: 'match-detail' that opens a screen showing the prompt, both users' answers, and a soft "want to plan something?" button at the bottom. The button leads to motive creation, but it's a choice, not the default.
Definition of done
• New prompts from Gemini come in with motiveMappable set correctly.
• Existing prompts have the field backfilled.
• A match on a motive-mappable prompt sends a notification whose deep link opens motive creation pre-filled.
• A match on a conversational prompt sends a notification whose deep link opens a match-detail screen, not discovery.
• Tested manually with at least one prompt of each type.

Item 2 — prompt_matches table as first-class object
Goal
Make matches a real, queryable object in the database with status tracking, so we can measure the funnel: prompt → answer → match → motive → hang → memory.
Why
Right now matches are implicit — computed on-the-fly from prompt_responses joined against circles. This means we can't measure conversion rates cleanly, can't track which matches were acted on vs. dismissed, can't expire matches gracefully, and can't display a user's open matches without re-running the join every time. A first-class object solves all of this.
Changes required
Schema: New Drizzle migration adds:

sql

CREATE TABLE prompt_matches (   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),   prompt_id uuid NOT NULL REFERENCES daily_prompts(id),   option_key text NOT NULL,   user_a_id text NOT NULL REFERENCES users(id),   user_b_id text NOT NULL REFERENCES users(id),   status text NOT NULL DEFAULT 'pending',   -- pending | viewed | acted | dismissed | expired   motive_id uuid REFERENCES motives(id),   created_at timestamptz NOT NULL DEFAULT now(),   updated_at timestamptz NOT NULL DEFAULT now(),   expires_at timestamptz NOT NULL,   CONSTRAINT user_a_lt_user_b CHECK (user_a_id < user_b_id),   UNIQUE (prompt_id, option_key, user_a_id, user_b_id) );

The user_a_id < user_b_id constraint enforces canonical ordering so we don't have duplicate (A,B) and (B,A) rows for the same pair.
Match creation: In prompt-match.ts, when matches are detected, write the pairwise rows. Always order the pair so the smaller user_id is user_a_id. Set expires_at to the prompt's midnight + 7 days (a match is interesting beyond the prompt's day, but expires within a reasonable window).
Status transitions:
• pending → viewed when the user opens the match notification or views the match detail screen.
• pending/viewed → acted when the user creates a motive from this match (record the motive_id).
• pending/viewed → dismissed when the user explicitly dismisses (add a dismiss action in the UI).
• Any non-acted state → expired when expires_at passes. Handle via a daily job or lazily on read.
API:
• New route GET /api/matches — returns the current user's open matches (status in pending/viewed), ordered by recency.
• New route POST /api/matches/:id/dismiss — sets status to dismissed.
• When a motive is created with an origin_prompt_id and the creator's attendees match a prompt_match, update the match's status to acted and set motive_id. This wiring lives in the motive creation route.
Mobile:
• The match-detail screen reads from GET /api/matches.
• A small "Open matches" section on the discovery homepage shows the user's pending matches (capped at 3-5 to avoid overwhelm).
Definition of done
• The new table exists with the right constraints.
• Matches are being written on every prompt response that produces one.
• Match status transitions correctly through pending → viewed → acted/dismissed/expired.
• The funnel can be measured by simple SQL queries (no implicit joins required).
• The UI shows the user their open matches.

Item 3 — FoF reweighting and cron pause
Goal
FoF should surface "people you probably know in real life that you didn't realize were on the app" — not "strangers who'd vibe well with you." The scoring should reflect this, and the daily cron should be paused since we have too few users for it to produce useful output.
Why
Berg is about deepening relationships with people you know. Discovery of strangers is off-product. But FoF can still play a role for genuine real-world acquaintances who happen to be on the app — that's just a different signal weighting. Mutual friends are the strongest indicator that someone is actually in the user's social orbit; vibe tag similarity primarily indicates strangers who might match well.
Changes required
Scoring function in recompute-fof.ts:
• Mutual friends: 60% (up from 35%). Cap at 5 mutual friends rather than 3 — high mutual count is a stronger signal of real-world acquaintance.
• Vibe tag Jaccard: 15% (down from 30%). Used as a tiebreaker among high-mutual-friend candidates.
• Motive overlap: 15% (down from 20%). Real-world signal — if they've been at the same motives, you likely know them.
• Prompt similarity: 5% (down from 10%). Weak signal at our scale.
• Recency: 5% (unchanged).
• Add a hard filter: candidates with zero mutual friends are excluded entirely. We're not surfacing strangers.
Cron pause in jobs/index.ts:
• Comment out the boss.schedule('discovery/recompute-fof-all', ...) call. Leave a comment explaining why: "Paused — see PRODUCT_NORTH_STAR.md. Re-enable when user count > 100 in a single locality."
• Leave the worker registration in place so on-demand triggers still work.
On-demand computation:
• When a user views the discover-people screen, trigger discovery/recompute-fof-user for that user if their last computed_at is older than 24h. This way FoF is computed for users when they ask for it, not nightly for everyone.
UI: No structural change to the screen yet (that's item 5), but the empty state should now read something like "We haven't found any friends-of-friends you might know yet. Come back after you've connected with more people." This is honest about what's happening.
Definition of done
• FoF results favor people with multiple mutual friends.
• Candidates with no mutual friends are never surfaced.
• The daily cron is paused.
• On-demand FoF computation works when a user opens the discover-people screen.
• Existing fof_suggestions data can remain or be cleared — your call, but if you clear it, do it explicitly with a migration script, not by truncating in production silently.

Item 4 — Chat scope restriction
Goal
Chat exists only for: (a) motive logistics, attached to confirmed motives, and (b) 1:1 DM between confirmed friends. Cut: group chats unrelated to motives,the new-group-creation flow as a standalone surface.
Why
A standalone chat product competes with WhatsApp on its home turf and we lose that fight. Motive chat is on-product because it supports the loop. 1:1 DM is on-product because it supports the "see what they said → reach out about it" follow-up flow. Group chats and interest-group chats are not on-product and they pull engagement away from the loop. Don't delete the tables or routes — just stop surfacing the off-product flows in the UI and stop allowing new group creation.
Changes required
Mobile UI:
• hide the (tabs)/chat/new-group.tsx route from navigation. The user should not be able to start a new standalone group chat.
• The chat tab list should show: motive chats (with motive name as the title) and existing direct messages. No standalone group chats appear as a creatable option. Existing group chats already in the system can keep working — don't break what's there — but no new ones should be creatable from the UI.

• POST /api/chats/direct — keep as-is. Direct messages between connected friends are on-product.
• The chats.group_circle_id column can stay in the schema. Just don't write to it from any new code path.
Don't change:
• Motive chat creation logic. That's on-product.
• The DM endpoints. Those are on-product.
• The chat schema. Cheap to keep, expensive to migrate.
Definition of done
• A user cannot create a new standalone group chat from the mobile app.
• Motive chats and DMs continue to work normally.
• Existing group chats (if any) still function but are not surfaced as a feature to expand or duplicate.
• No new code paths write to chats.group_circle_id.
• the only for group chats would be through the motive or a joined circle

Item 5 — Discovery homepage reorder
Goal
The homepage (apps/mobile/app/(app)/(tabs)/discovery/index.tsx) should lead with today's prompt and circle activity. Stranger-discovery surfaces move to a smaller "explore" entry point lower on the screen or behind a tap.
Why
The homepage is the product's positioning statement to every user every day. Right now it shows three things as visual peers: today's prompt, circles to join, and people to connect with. That broadcasts "we're a discovery app." It should broadcast "this is about your existing friendships." The fix is hierarchy, not deletion — keep the explore options accessible for the genuine cold-start case, but stop giving them equal weight with the core loop.
Changes required
Layout, top to bottom:

1. Today's prompt — dominant. Full-width card, large visual presence. If the user has answered, show their answer with a small "you answered" indicator. If not, the answer flow is the primary call to action.
2. Circle activity band — what your friends have done today and recently. Friends' answers to today's prompt (one card per friend who's answered, showing their option). Open matches (any prompt_matches in pending/viewed status). Upcoming motives. This is the relational pulse of the homepage and should feel alive.
3. A small "Explore" entry point — single tappable row near the bottom, leading to a separate screen with the existing discover-circles and discover-people content. Label it something honest like "Find people you might know" with a chevron. No previews of strangers on the homepage itself.
   Components:
   • PeopleSection and the people-discovery preview should not appear on the homepage. Move that surface behind the Explore tap.
   • CirclesSection for joinable public circles — same treatment, behind Explore.
   • CirclePulse and PromptCard stay prominent.
   • MatchReveal should be more visually integrated into the circle activity band.
   State:
   • users.last_active_tab default of 'discovery' is fine; this is the homepage.
   • No need to change navigation routes — just the visual hierarchy on the discovery screen.
   Definition of done
   • The discovery screen, scrolled top to bottom, communicates: "Berg is about your friends, the prompt today, and what's happening between you. People-discovery is available but secondary."
   • No stranger cards or stranger previews appear above the fold.
   • The "Explore" entry point works and leads to the existing discover-people / discover-circles experience.
   • Existing functionality is preserved — nothing is deleted, just reordered.

Item 6 — Schema rename: friendships and circles
Goal
Rename circles table to friendships (because it's a 1:1 friend relationship table). Rename group_circles to circles (because that's what users would call a circle — a small private group of friends). Update all code references.
Why
The current naming is confusing — every new developer (including future you) has to mentally remap "circles is friendships, group_circles is circles." This kind of debt gets worse, not better, over time. Fix it now while the codebase is still under your sole control.
Changes required
This is a mechanical refactor. Do it as one atomic migration + code change, not piecemeal.
Migration:
• ALTER TABLE circles RENAME TO friendships;
• ALTER TABLE group_circles RENAME TO circles;
• ALTER TABLE group_circle_members RENAME TO circle_members;
• Rename all foreign key columns that reference these tables for consistency.
• Update all constraint names that include the old table names.
Code:
• Search and replace across packages/api/, packages/shared/, and apps/mobile/ for:
• circles table references → friendships
• groupCircles references → circles
• groupCircleMembers → circleMembers
• Drizzle schema definitions in packages/shared/src/schema/social.ts updated to match.
• All API route paths that say /circles (referring to friendships) should become /friendships. Routes for group circles should become /circles.
• Update mobile screens: profile/circles.tsx, profile/circle-detail.tsx, etc., to reflect the new naming.
Mitigation:
• Run the migration in a single transaction so you can roll back if anything breaks.
• Update API client code in the mobile app at the same time as the backend. Old clients on testers' phones will break — this is OK because we're in closed testing, but plan to push the new app build alongside the backend deploy.
Definition of done
• The friendships table holds 1:1 friend relationships.
• The circles table holds small private friend groups (formerly group_circles).
• All code references the new names.
• The mobile app and backend deploy together in a coordinated release.
• Existing data is preserved (no data loss, only renames).

How to work this brief
For each item:

1. Re-read the relevant part of PRODUCT_NORTH_STAR.md first. Confirm that the change still maps to the principles.
2. State the smallest version that ships value. If you can split an item into two PRs that each ship something, do that.
3. Write the database migration first, if applicable. Run it in a test environment. Don't write application code that depends on a migration that hasn't been validated.
4. Update the schema in packages/shared/src/schema/ next.
5. Update API routes and jobs.
6. Update the mobile app last.
7. Test the change end-to-end with a manual flow. "I open the app, answer the prompt, see a match notification on another device, tap it, end up in the right place." Real device, real flow, not just unit tests.
8. Commit with a message that references the item number from this brief. Example: [align-1] Add motive_mappable to daily_prompts and route notifications.
9. Stop and confirm with me before moving to the next item.
   If you discover something while working that contradicts this brief — for example, a constraint I didn't know about, or a better approach to one of the items — pause and tell me. Don't silently deviate. The brief is the contract; if the contract needs to change, we change it together before continuing.

What's NOT in this sprint
To stay focused, the following are explicitly out of scope. If I bring any of these up during the sprint, push back and remind me:
• Adding new prompt categories or rewriting the existing prompt corpus (that's a content task, not an alignment task).
• Building new features for memories, motive collisions, or resurfacing (these are on-product but they're already built; don't expand them now).
• Implementing per-user prompt personalization (deferred per North Star).
• Adding ML-based matching or embeddings (rule-based is correct for our stage).
• Migrating from Render to another deploy target.
• Switching from Expo to native, or any stack changes.
• Onboarding rewrites, copy polish, or visual redesigns (separate work).
• Marketing site, Google Play store copy, or App Store listing changes (also separate work).

When this sprint is done
The product will:
• Route matches correctly based on whether the prompt is intent-bearing or conversational.
• Track matches as first-class objects with measurable conversion through the loop.
• Surface FoF only when it represents real-world social proximity.
• Have a chat surface scoped to motive logistics and friend DMs — no parallel group-messaging product.
• Lead with the prompt and friend activity on the homepage, with stranger discovery demoted to a secondary surface.
• Have a coherent schema where friendships means friendships and circles means circles.
That is the focused version of Berg. From there, the product is ready for honest user testing with the 6-10 friends you're inviting to the closed beta. Real data from real testers becomes the next input to the North Star doc — and the next sprint will be informed by what those testers actually do, not by speculation.
