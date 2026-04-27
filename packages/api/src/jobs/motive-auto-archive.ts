import { db } from '../db.js';
import { motives } from '@berg/shared';
import { and, inArray, lt, isNotNull } from 'drizzle-orm';

/**
 * Daily cleanup: mark motives as 'past' when their scheduled time has passed.
 *
 * This catches any motives the memory-prompt job missed (e.g. motives created
 * before the job was deployed, or jobs that failed). Runs at 2am UTC daily.
 *
 * Grace period: only archives motives scheduled > 2 hours ago so we don't
 * immediately archive motives that just started.
 *
 * Job name: 'motive/auto-archive'
 */
export async function handleMotiveAutoArchive(): Promise<void> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

  const stale = await db
    .update(motives)
    .set({ status: 'past', updatedAt: new Date() })
    .where(
      and(
        inArray(motives.status, ['planning', 'confirmed']),
        isNotNull(motives.scheduledAt),
        lt(motives.scheduledAt, cutoff),
      ),
    )
    .returning({ id: motives.id, title: motives.title });

  if (stale.length > 0) {
    console.log(`[motive/auto-archive] Marked ${stale.length} stale motives as past:`,
      stale.map(m => m.title).join(', '));
  }
}
