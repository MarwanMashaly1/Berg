/**
 * Adds storage_paths column to motive_memories and creates the
 * motive-memories Supabase Storage bucket.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sql = postgres(process.env.DATABASE_URL!);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function run() {
  console.log('Running memories migration...');

  // 1. Add storage_paths column (permanent bucket paths, separate from signed URLs)
  await sql`
    ALTER TABLE motive_memories
      ADD COLUMN IF NOT EXISTS storage_paths TEXT[] NOT NULL DEFAULT '{}';
  `;
  console.log('✓ motive_memories.storage_paths added');

  // 2. Create the storage bucket
  const { error } = await supabaseAdmin.storage.createBucket('motive-memories', {
    public: false,           // private — all access via signed URLs
    fileSizeLimit: 20971520, // 20 MB per file
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  });

  if (error && !error.message.includes('already exists')) {
    throw error;
  }
  console.log('✓ motive-memories storage bucket ready');

  await sql.end();
  console.log('Done.');
}

run().catch((e) => { console.error(e); process.exit(1); });
