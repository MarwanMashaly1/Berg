/**
 * Creates the chat-images Supabase Storage bucket (public).
 * Run once: cd packages/api && npx tsx src/scripts/migrate-chat-images.ts
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function run() {
  const { error } = await supabaseAdmin.storage.createBucket('chat-images', {
    public: true,
    fileSizeLimit: 10485760, // 10 MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'],
  });

  if (error && !error.message.includes('already exists')) throw error;
  console.log('✓ chat-images bucket ready (public)');
}

run().catch(e => { console.error(e); process.exit(1); });
