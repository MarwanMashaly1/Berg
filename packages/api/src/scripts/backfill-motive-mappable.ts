/**
 * [align-1] One-off script: backfill motive_mappable on existing daily_prompts.
 *
 * Prompts whose tags array contains any motive category key are intent-bearing
 * and should route match notifications to motive creation.
 *
 * Run once after the 0005_motive_mappable.sql migration:
 *   npx tsx src/scripts/backfill-motive-mappable.ts
 */
import { db } from '../db.js';
import { dailyPrompts } from '@berg/shared';
import { inArray } from 'drizzle-orm';

const MOTIVE_CATEGORIES = new Set([
  'food', 'outdoors', 'catchup', 'movies',
  'active', 'party', 'gaming', 'travel', 'creative',
]);

async function main() {
  const all = await db
    .select({ id: dailyPrompts.id, tags: dailyPrompts.tags })
    .from(dailyPrompts);

  const motiveIds: string[] = [];
  for (const row of all) {
    const tags = row.tags ?? [];
    if (tags.some((t) => MOTIVE_CATEGORIES.has(t))) {
      motiveIds.push(row.id);
    }
  }

  if (motiveIds.length === 0) {
    console.log('[backfill] No prompts matched motive categories — nothing to update.');
    return;
  }

  await db.update(dailyPrompts)
    .set({ motiveMappable: true })
    .where(inArray(dailyPrompts.id, motiveIds));

  console.log(`[backfill] Set motive_mappable = true on ${motiveIds.length} prompts.`);

  const total = await db.$count(dailyPrompts);
  console.log(`[backfill] ${total - motiveIds.length} prompts remain motive_mappable = false.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
