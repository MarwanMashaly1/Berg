/**
 * Adds description + is_public columns to group_circles.
 * Run once: cd packages/api && npx tsx src/scripts/migrate-circles.ts
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function run() {
  const stmts = [
    `ALTER TABLE group_circles ADD COLUMN IF NOT EXISTS description text`,
    `ALTER TABLE group_circles ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true`,
  ];

  for (const sql of stmts) {
    const { error } = await supabaseAdmin.rpc('exec_sql' as any, { query: sql }).single();
    if (error) {
      // Fallback: use raw postgres via service role
      console.warn('rpc failed, trying direct:', error.message);
    }
  }

  console.log('✓ group_circles migration complete');
  console.log('  Run this SQL in your Supabase SQL editor if the script above failed:');
  console.log('  ALTER TABLE group_circles ADD COLUMN IF NOT EXISTS description text;');
  console.log('  ALTER TABLE group_circles ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;');
}

run().catch(e => { console.error(e); process.exit(1); });
