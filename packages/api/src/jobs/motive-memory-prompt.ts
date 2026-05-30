import { db } from '../db.js';
import { motives, motiveAttendees, motiveMemories } from '@berg/shared';
import { and, eq } from 'drizzle-orm';
import { sendPushBatch } from '../lib/notifications.js';

export type MotiveJobData = { motiveId: string };

/**
 * N11 -- Post-motive memory prompt
 * Fires 1 hour after scheduledAt.
 *
 * Also marks the motive as 'past' -- this is the authoritative status transition.
 * The scheduled time has passed, so regardless of whether memories are added,
 * the motive is now in the past.
 */
export async function handleMotiveMemoryPrompt(job: { data: MotiveJobData }): Promise<void> {
  const { motiveId } = job.data;

  const [motive] = await db
    .select({ title: motives.title, status: motives.status })
    .from(motives)
    .where(eq(motives.id, motiveId))
    .limit(1);

  if (!motive || motive.status === 'cancelled') return;

  // Mark as past -- the event time has passed
  if (motive.status !== 'past') {
    await db
      .update(motives)
      .set({ status: 'past', updatedAt: new Date() })
      .where(eq(motives.id, motiveId));
  }

  // Notify attendees who went but haven't added memories
  const going = await db
    .select({ userId: motiveAttendees.userId })
    .from(motiveAttendees)
    .where(and(eq(motiveAttendees.motiveId, motiveId), eq(motiveAttendees.rsvpStatus, 'going')));

  const withMemory = await db
    .select({ userId: motiveMemories.userId })
    .from(motiveMemories)
    .where(eq(motiveMemories.motiveId, motiveId));

  const withMemorySet = new Set(withMemory.map((m) => m.userId));
  const needsPrompt = going.map((a) => a.userId).filter((id) => !withMemorySet.has(id));

  if (needsPrompt.length === 0) return;

  await sendPushBatch(needsPrompt, {
    title: motive.title,
    body: 'How was it? Add your memories before they fade',
    data: { screen: 'motives', motiveId, path: 'memory' },
  }, 'notifyMotiveInvites');
}
