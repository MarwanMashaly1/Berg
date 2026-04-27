/**
 * Adds group_circle_id to chats table and composite primary key to chat_members.
 * Safe to run multiple times.
 */
import postgres from 'postgres';
import 'dotenv/config';

const sql = postgres(process.env.DATABASE_URL!);

async function run() {
  console.log('Running chat column migrations...');

  // Add group_circle_id to chats
  await sql`
    ALTER TABLE chats
      ADD COLUMN IF NOT EXISTS group_circle_id UUID REFERENCES group_circles(id) ON DELETE SET NULL;
  `;
  console.log('✓ chats.group_circle_id added');

  // Index for fast lookup by motive
  await sql`
    CREATE INDEX IF NOT EXISTS idx_chats_motive_id ON chats(motive_id)
    WHERE motive_id IS NOT NULL;
  `;
  // Index for fast lookup by circle
  await sql`
    CREATE INDEX IF NOT EXISTS idx_chats_group_circle_id ON chats(group_circle_id)
    WHERE group_circle_id IS NOT NULL;
  `;
  console.log('✓ chats indexes created');

  // Add composite primary key to chat_members (drop old UK if exists first)
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chat_members_pkey'
        AND conrelid = 'chat_members'::regclass
      ) THEN
        ALTER TABLE chat_members ADD PRIMARY KEY (chat_id, user_id);
      END IF;
    END $$;
  `;
  console.log('✓ chat_members primary key ensured');

  // Index for messages (newest first per chat)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at DESC);
  `;
  console.log('✓ messages index created');

  await sql.end();
  console.log('Done.');
}

run().catch((e) => { console.error(e); process.exit(1); });
