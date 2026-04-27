-- Icebreaker — Safe manual migration for all pending schema changes
-- Run this in Supabase SQL Editor (Settings → SQL Editor → New query)
-- All statements use IF NOT EXISTS / IF EXISTS to be idempotent (safe to re-run)

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. users — add expo_push_token
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. daily_prompts — add lifecycle columns, make active_date nullable
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE daily_prompts ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE daily_prompts ADD COLUMN IF NOT EXISTS generated_by TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE daily_prompts ADD COLUMN IF NOT EXISTS quality_score SMALLINT;
ALTER TABLE daily_prompts ADD COLUMN IF NOT EXISTS last_used_at  TIMESTAMP;
ALTER TABLE daily_prompts ADD COLUMN IF NOT EXISTS use_count     INTEGER NOT NULL DEFAULT 0;

-- Make active_date nullable so draft prompts don't need a scheduled date
ALTER TABLE daily_prompts ALTER COLUMN active_date DROP NOT NULL;

-- Update existing rows: set status based on whether they have an active_date
UPDATE daily_prompts SET status = 'active'   WHERE active_date = CURRENT_DATE;
UPDATE daily_prompts SET status = 'archived' WHERE active_date < CURRENT_DATE;
UPDATE daily_prompts SET status = 'approved' WHERE active_date > CURRENT_DATE;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. notification_inbox — new table for the in-app notification bell
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_inbox (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  data       TEXT,
  read_at    TIMESTAMP,
  created_at TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_inbox_user_id_idx ON notification_inbox(user_id);
CREATE INDEX IF NOT EXISTS notification_inbox_created_at_idx ON notification_inbox(user_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. motive_memories — new table for post-motive memory flow
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS motive_memories (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  motive_id     UUID      NOT NULL REFERENCES motives(id) ON DELETE CASCADE,
  user_id       TEXT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vibe_tags     TEXT[]    NOT NULL DEFAULT '{}',
  rating        INTEGER,
  venue_rating  INTEGER,
  storage_paths TEXT[]    NOT NULL DEFAULT '{}',
  photo_urls    TEXT[]    NOT NULL DEFAULT '{}',
  card_url      TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS motive_memories_motive_id_idx ON motive_memories(motive_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. motives — add place + metadata columns
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE motives ADD COLUMN IF NOT EXISTS place_address TEXT;
ALTER TABLE motives ADD COLUMN IF NOT EXISTS lat           DECIMAL(10,7);
ALTER TABLE motives ADD COLUMN IF NOT EXISTS lng           DECIMAL(10,7);
ALTER TABLE motives ADD COLUMN IF NOT EXISTS note          TEXT;
ALTER TABLE motives ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP DEFAULT now();

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. motive_attendees — add columns + swap to composite primary key
--
-- This is the dangerous one. We safely:
--   a) Add the new columns first (no data loss)
--   b) Drop the old `id` primary key (safe — we keep the column, just drop PK)
--   c) Add a composite PK on (motive_id, user_id)
--
-- Step c will FAIL if any duplicate (motive_id, user_id) pairs exist.
-- The SELECT below lets you check first.
-- ──────────────────────────────────────────────────────────────────────────────

-- Add new columns first
ALTER TABLE motive_attendees ADD COLUMN IF NOT EXISTS rsvp_at     TIMESTAMP;
ALTER TABLE motive_attendees ADD COLUMN IF NOT EXISTS created_at  TIMESTAMP DEFAULT now();

-- Check for duplicates before changing PK (should return 0 rows if safe)
SELECT motive_id, user_id, COUNT(*) AS cnt
FROM motive_attendees
GROUP BY motive_id, user_id
HAVING COUNT(*) > 1;

-- If the above returns rows, run this to deduplicate first:
-- DELETE FROM motive_attendees a USING motive_attendees b
--   WHERE a.ctid < b.ctid AND a.motive_id = b.motive_id AND a.user_id = b.user_id;

-- Drop the old `id` primary key constraint (keeps the `id` column, just removes PK)
DO $$
DECLARE v_constraint TEXT;
BEGIN
  SELECT constraint_name INTO v_constraint
  FROM information_schema.table_constraints
  WHERE table_name = 'motive_attendees'
    AND constraint_type = 'PRIMARY KEY'
    AND table_schema = 'public';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE motive_attendees DROP CONSTRAINT %I', v_constraint);
    RAISE NOTICE 'Dropped old PK: %', v_constraint;
  ELSE
    RAISE NOTICE 'No existing PK found on motive_attendees';
  END IF;
END $$;

-- Add composite PK (will fail if duplicates exist — safe)
ALTER TABLE motive_attendees
  ADD CONSTRAINT motive_attendees_motive_id_user_id_pk
  PRIMARY KEY (motive_id, user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. circles — unique constraint (already attempted via drizzle push)
--    If the unique constraint was already added during the earlier push session,
--    this will silently succeed via IF NOT EXISTS equivalent.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_circle_per_direction'
  ) THEN
    ALTER TABLE circles
      ADD CONSTRAINT unique_circle_per_direction UNIQUE (user_id, friend_id);
    RAISE NOTICE 'Added unique_circle_per_direction constraint';
  ELSE
    RAISE NOTICE 'unique_circle_per_direction already exists — skipped';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Done. Verify:
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  'users.expo_push_token'          AS check_item,
  COUNT(*) > 0                     AS column_exists
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'expo_push_token'

UNION ALL

SELECT
  'notification_inbox table',
  COUNT(*) > 0
FROM information_schema.tables
WHERE table_name = 'notification_inbox'

UNION ALL

SELECT
  'motive_memories table',
  COUNT(*) > 0
FROM information_schema.tables
WHERE table_name = 'motive_memories'

UNION ALL

SELECT
  'daily_prompts.status',
  COUNT(*) > 0
FROM information_schema.columns
WHERE table_name = 'daily_prompts' AND column_name = 'status';
