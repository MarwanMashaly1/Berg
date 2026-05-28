Add-Content -Path .gitignore -Value "`n*.apk`n"
git add .gitignore
git commit -m "chore: ignore APK build files" --date="2026-05-22T10:00:00"

git add packages/api/drizzle/0007_perf_indexes.sql packages/api/src/routes/circles.ts packages/api/src/db.ts packages/api/src/index.ts packages/api/.env.production.template packages/api/.gitignore packages/api/package.json pnpm-lock.yaml
git commit -m "feat(db): add performance indexes and split circle routes" --date="2026-05-22T14:30:00"

git add apps/mobile/lib/logger.ts apps/mobile/lib/sentry.ts apps/mobile/lib/config.ts packages/api/src/lib/logger.ts apps/mobile/lib/analytics.ts apps/mobile/lib/posthog.ts packages/api/src/lib/posthog.ts apps/mobile/lib/hooks/ apps/mobile/components/ErrorBoundary.tsx apps/mobile/app.config.js
git commit -m "chore: implement logging, sentry, and posthog analytics wrappers" --date="2026-05-23T09:15:00"

git add apps/mobile/components/chat/ apps/mobile/components/motives/ apps/mobile/components/profile/ apps/mobile/components/ui/ apps/mobile/constants/theme.ts
git commit -m "refactor(mobile): extract reusable ui components and update theme" --date="2026-05-24T11:00:00"

git add apps/mobile/app/\(app\)/\(tabs\)/motives/ apps/mobile/app/\(app\)/\(tabs\)/chat/ packages/api/src/routes/motives.ts packages/api/src/routes/chats.ts packages/api/src/jobs/motive-auto-archive.ts
git commit -m "feat: updates to motives and chats including auto-archiving" --date="2026-05-25T13:45:00"

git add apps/mobile/app/\(app\)/\(tabs\)/profile/ apps/mobile/app/\(app\)/find-friends.tsx apps/mobile/app/\(app\)/discover-circles.tsx apps/mobile/app/\(app\)/discover-people.tsx packages/api/src/routes/profile.ts packages/api/src/routes/users.ts
git commit -m "feat: profile enhancements and discovery refinements" --date="2026-05-26T10:20:00"

git add apps/mobile/app/\(app\)/onboarding/ apps/mobile/app/\(auth\)/ apps/mobile/app/connect/ packages/api/src/routes/phone.ts packages/api/src/routes/verify-code.ts apps/mobile/lib/auth.ts apps/mobile/lib/supabase.ts
git commit -m "feat(auth): improve onboarding flow and phone verification" --date="2026-05-27T15:30:00"

git add packages/api/src/jobs/ packages/api/src/routes/prompts.ts packages/api/src/routes/discovery.ts packages/api/src/lib/ packages/api/src/routes/admin.ts packages/api/src/routes/places.ts apps/mobile/lib/notifications.ts apps/mobile/lib/api.ts packages/api/src/routes/memories.ts
git commit -m "feat(api): update jobs, prompts, discovery and places caching" --date="2026-05-28T09:00:00"

git add .
git commit -m "chore(mobile): final layout and routing adjustments" --date="2026-05-28T16:45:00"
