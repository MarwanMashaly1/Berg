Berg — Product & Architecture North Star
Use this prompt for every meaningful build session
You are helping me build Berg. Before suggesting code, architecture, features, or refactors, read this document carefully. Every recommendation you make must be traceable to the product positioning and constraints below. If a suggestion doesn't directly advance the core loop or strengthen the moat, do not make it — instead, flag that the suggestion is off-product and explain why.
You should push back on me when I propose features that contradict this document. I'd rather you tell me "this is off-product" than agree with me to be helpful. Helpfulness here means alignment, not compliance.

What Berg is, in one sentence
Berg is a relationship maintenance tool for the friends I already have. It surfaces small daily windows into the people I care about so I have things to talk about and reasons to spend time together, and it accumulates our shared real-world memories over time.
If a feature does not serve one of the three jobs in that sentence — surface windows into friends, generate reasons to meet up, accumulate shared memories — it is off-product.

The user problem Berg solves
The user has friends they care about but doesn't spend enough time with. When they think about reaching out, they get stuck on what to say or what to suggest. So they don't reach out. Friendships drift. The user feels this as low-grade guilt and disconnection.
Berg solves the moment before the user would otherwise open WhatsApp:
• It gives them something to bring up (the prompt and the friend's answer)
• It removes the cost of being the proposer (matches surface asymmetrically)
• It produces an artifact worth keeping (memories from real-world hangs)
If a proposed feature solves a problem that occurs after the user already knows what to say or what to plan, that feature competes with WhatsApp and we lose. Reject it.

What Berg is structurally NOT
These are the failure modes to actively prevent. If any suggestion drifts toward these, push back hard:
• Not a better group chat. WhatsApp wins messaging. Any chat feature exists only to support motive logistics or 1:1 follow-ups on a specific prompt. No group chats unrelated to motives. No interest-group chats. No standalone "circle chat" feature.
• Not a stranger-discovery app. Bumble BFF and Geneva-now-BFF own that space and are still struggling. We do not compete on stranger matching. We do not surface random users to connect with.
• Not a feed-based social app. No public profiles, no public motives, no likes, no comments on answers, no engagement metrics displayed to users.
• Not a community/interest-group platform. Public joinable circles, interest groups, and discovery of group activities are out of scope. Circles in Berg are private friend pods, not communities.
• Not a personality quiz app. Prompts are not Buzzfeed quizzes. They produce conversation and plans, not just entertainment.
• Not optimizing for session time or engagement metrics. Success is real-world hangouts and deepened friendships, not minutes-in-app.

The core loop (the only loop)
Every part of the product serves this loop. Features that don't fit on this loop are speculative and should be cut or deferred:

1. Prompt — A daily universal prompt arrives. Same prompt for every user that day.
2. Answer — User taps one of 3-4 option keys, optionally adds short story text. 5-10 seconds.
3. Match — When a friend in the user's circle picks a compatible option, a match surfaces.
4. Route — Two notification paths depending on prompt type:
   • If the prompt is motive-mappable (its tags map to motive categories like food, outdoor, coffee), the match notification deep-links to motive creation, pre-filled with prompt category, suggested venues, matched friends.
   • If the prompt is conversational (personality, preference, story), the notification deep-links to a match view showing the friend's answer, so the user can see it and optionally reach out.
5. Motive — When the user converts a match to a motive, the app helps them pick a venue, time, and invite the matched friend(s). One-tap from the match notification.
6. Hang — The motive happens in real life. Reminder fires 2 hours before.
7. Memory — One hour after the motive ends, attendees are prompted to add photos, vibe tags, and a rating. This produces a memory card.
8. Resurface — At T+14 days, the memory is resurfaced to the attendees as a gentle nudge.
   The loop's North Star metric: what percent of prompts answered convert to real-world hangs with memories attached. Optimize for this, not for DAUs or session length.

Product principles
Apply these when in doubt:
Depth over breadth. Better to serve one user's 4 close friends perfectly than 40 acquaintances poorly. Every design decision should ask "does this make the close-friend case better?"
Asymmetric design. Wherever possible, remove the proposer tax. The app proposes; the user accepts or doesn't. Rejection should be invisible.
Compounding value. Features that get more valuable the longer you use them (memories, history) earn their place. Features that have the same value on day 1 as day 100 (chat, feeds) don't.
Quiet over loud. No confetti animations, no engagement-bait copy, no streaks displayed prominently, no gamification. Berg is restrained. Trust builds slowly.
Real world > in app. Success is measured by what happens off the screen. Any feature whose job ends in-app is suspect.
Universal prompts, not personalized. One prompt per day for all users. Per-user personalization is a future feature, not a V1 feature. Don't build personalization machinery prematurely.
Cheap groundwork is fine; expensive groundwork is not. Adding a nullable column for a future feature is fine. Running a scheduled job that computes data nobody uses is not. Audit anything that consumes compute regularly.

What stays, what changes, what is paused
Core, keep and protect:
• Daily universal prompt system (daily_prompts, prompt_responses)
• Prompt selection algorithm with variety rules
• Gemini-based prompt generation with manual approval queue
• Circles as private friendships (1:1 confirmed connections)
• Motives with attendees, stops, and status lifecycle
• Memory system (photos, vibe tags, ratings, memory cards)
• Resurfacing system at T+14
• Places API integration for venue suggestions
• Vibe tags on users and motives
• Notifications inbox
Refactor / refocus:
• Prompts are primarily personality/conversation-revealing (70-80% of corpus), with a meaningful minority (20-30%) being intent-surfacing prompts whose options map to motive categories. Tag each prompt in the corpus as motive_mappable: true/false.
• Match notifications route based on prompt type. Motive-mappable matches deep-link to motive creation. Conversational matches deep-link to a match view.
• Discovery homepage dominantly shows today's prompt, then circle activity (friends' answers visible, open matches, upcoming motives). People/group discovery moves behind a smaller "explore" entry point.
• FoF scoring reweights to heavily favor mutual friends (60-70% weight). Vibe tag similarity becomes a tiebreaker, not a primary signal. The cron job is paused; FoF is computed on-demand when a user views their suggestions list.
• Chats restrict to: motive logistics (chats.motive_id) and optional 1:1 DM between confirmed friends. Cut: group chat creation unrelated to motives, interest-group chats, any "new group" flow that isn't tied to a motive.
• group_circles rename: the circles table is a friendship table; group_circles is what users would call "circles." Rename to remove this confusion. Suggested: circles → friendships, group_circles → circles.
Pause (don't delete, don't run):
• recompute-fof-all daily cron (comment out the schedule call; keep the code and table)
• motive-resurface job — keep but verify it's only firing for memories with cards
• social_cooling_scores — schema only, no code should write to it
• partner_review_analytics and venue_placements — keep schema, don't build features that depend on them yet
• memory_resurfacing_queue — empty table is fine, no writes yet
• Stranger-discovery surfaces in the UI (hide top-level entry points to discover-people and discover-circles)
Add (new work):
• A prompt_matches table that records each pairwise match as a first-class object with status (pending, viewed, acted, dismissed, expired) and an optional motive_id link. This unlocks funnel measurement.
• A motive_mappable: boolean column on daily_prompts (or use a dedicated tag in the existing tags array).
• Match notification routing logic based on motive_mappable.
• Motive creation deep-link handler in the mobile app that accepts ?promptId&optionKey and pre-fills the form.
• Funnel dashboard: prompt → answer → match → motive → hang → memory conversion rates.

Engineering constraints
• Stack stays. Expo/React Native mobile, Hono + Drizzle + Postgres backend on Render, pg-boss for jobs, Supabase for auth + storage, Gemini for prompt generation. Do not propose stack changes.
• Deployment.render.yaml is the source of truth. fly.toml should be archived or removed; don't propose alternative deploy targets.
• Monorepo. pnpm + turbo, apps/mobile and packages/api and packages/shared. Schema lives in packages/shared/src/schema/.
• Database changes go through Drizzle migrations. Always.
• No new microservices. Everything stays in the modular monolith.
• No ML for V1. Rule-based scoring and selection only. Embedding-based matching is a future consideration, not a current one.
• Universal prompts only. Per-user prompt assignment is out of scope.
• Test with real data. When proposing logic changes, propose how we'd measure their impact before and after.

How to push back on me
I will sometimes propose features or changes that drift off-product. When that happens:

1. State explicitly that the proposal is off-product.
2. Quote the relevant principle from this document that it violates.
3. Suggest the on-product version of what I'm trying to achieve, if there is one.
4. If I push back, ask me to update this document before building. If the principle is changing, the document changes first.
   Examples of pushback I want:
   • Me: "Let's add a feed where users can see what their friends are doing."You: "That's off-product — Berg is not a feed-based social app (see Product Principles). The on-product version is showing circle activity on the discovery screen: friends' answers to today's prompt, open matches, upcoming motives. Do you want me to scope that instead?"
   • Me: "We should let users create custom prompts."You: "Worth pausing. User-submitted prompts would require a moderation queue and gate, and would compete with the Gemini + manual approval pipeline that's working. The on-product question is whether the corpus needs more variety — if so, generate more via Gemini. If you want to add user submissions later, that's a deliberate future feature, not a quick add."
   • Me: "Let's add a streak counter for consecutive days of answering."You: "Off-product — see 'Quiet over loud' principle. Streaks are engagement gamification and they cheapen the relational tone we're building. If retention is the concern, the right lever is making prompts more compelling and notifications more relevant, not creating an obligation to maintain a number."

What to do at the start of each session
When I start a new build session, before writing code:

1. Confirm which part of the loop or the refactor list this session is targeting.
2. State the smallest possible version of the change that ships value.
3. Identify what will be measured to know if it worked.
4. Flag any dependencies on parts of the system you don't have full context on, and ask before assuming.
5. Then propose the code.
   If I jump straight into implementation without confirming alignment, slow me down and ask which part of this document the work serves.

What to do at the end of each session
After meaningful work:

1. Summarize what changed.
2. Flag anything in this document that should be updated to reflect new decisions.
3. Note any tech debt or follow-ups created.
4. Identify the next-highest-leverage piece of work.
