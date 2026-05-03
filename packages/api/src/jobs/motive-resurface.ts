import { db } from '../db.js';
import { motives, motiveMemories } from '@berg/shared';
import { and, eq, isNotNull } from 'drizzle-orm';
import { sendPushBatch } from '../lib/notifications.js';

export type MotiveJobData = { motiveId: string };

/**
 * N12 -- Memory resurfacing T+14 days
 * Only fires for users who added a memory with a generated card.
 */
export async function handleMotiveResurface(job: { data: MotiveJobData }): Promise<void> {
  const { motiveId } = job.data;

  const [motive] = await db
    .select({ title: motives.title })
    .from(motives)
    .where(eq(motives.id, motiveId))
    .limit(1);

  if (!motive) return;

  const memories = await db
    .select({ userId: motiveMemories.userId })
    .from(motiveMemories)
    .where(and(eq(motiveMemories.motiveId, motiveId), isNotNull(motiveMemories.cardUrl)));

  const ids = memories.map((m) => m.userId);
  if (ids.length === 0) return;

  await sendPushBatch(ids, {
    title: 'Remember this?',
    body: motive.title,
    data: { screen: 'motives', motiveId, path: 'memory-card' },
  });
}
