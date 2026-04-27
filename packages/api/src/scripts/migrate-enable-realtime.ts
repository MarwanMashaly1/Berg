/**
 * Adds messages, chats, and chat_members to the supabase_realtime publication.
 * Run once. Safe to re-run.
 */
import postgres from 'postgres';
import 'dotenv/config';

const sql = postgres(process.env.DATABASE_URL!);

async function run() {
  console.log('Enabling Supabase Realtime on chat tables...');

  for (const table of ['messages', 'chats', 'chat_members']) {
    try {
      await sql.unsafe(`ALTER PUBLICATION supabase_realtime ADD TABLE ${table}`);
      console.log(`✓ ${table} added to supabase_realtime`);
    } catch (e: any) {
      if (e.message?.includes('already exists') || e.code === '42710') {
        console.log(`~ ${table} already in publication`);
      } else {
        throw e;
      }
    }
  }

  await sql.end();
  console.log('Done.');
}

run().catch((e) => { console.error(e); process.exit(1); });
