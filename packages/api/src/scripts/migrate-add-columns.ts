/**
 * Adds columns that exist in the Drizzle schema but are missing from the live DB.
 * Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 */
import postgres from 'postgres';
import 'dotenv/config';

const sql = postgres(process.env.DATABASE_URL!);

async function run() {
  console.log('Running column migrations...');

  // motive_attendees: responded_at, held_by_collision_id
  await sql`
    ALTER TABLE motive_attendees
      ADD COLUMN IF NOT EXISTS responded_at       TIMESTAMP,
      ADD COLUMN IF NOT EXISTS held_by_collision_id UUID;
  `;
  console.log('✓ motive_attendees columns added');

  // motives: extra columns added after initial creation
  await sql`
    ALTER TABLE motives
      ADD COLUMN IF NOT EXISTS place_address TEXT,
      ADD COLUMN IF NOT EXISTS lat           DECIMAL(10,7),
      ADD COLUMN IF NOT EXISTS lng           DECIMAL(10,7),
      ADD COLUMN IF NOT EXISTS note          TEXT,
      ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP DEFAULT NOW();
  `;
  console.log('✓ motives columns added');

  // motive_memories table
  await sql`
    CREATE TABLE IF NOT EXISTS motive_memories (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      motive_id   UUID        NOT NULL REFERENCES motives(id) ON DELETE CASCADE,
      user_id     TEXT        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
      vibe_tags   TEXT[]      NOT NULL DEFAULT '{}',
      rating      INTEGER,
      venue_rating INTEGER,
      photo_urls  TEXT[]      NOT NULL DEFAULT '{}',
      card_url    TEXT,
      created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
    );
  `;
  console.log('✓ motive_memories table ensured');

  await sql.end();
  console.log('Done.');
}

run().catch((e) => { console.error(e); process.exit(1); });
