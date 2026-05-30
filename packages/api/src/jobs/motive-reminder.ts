import { db } from '../db.js';
import { motives, motiveAttendees } from '@berg/shared';
import { and, eq } from 'drizzle-orm';
import { sendPushBatch } from '../lib/notifications.js';

export type MotiveJobData = { motiveId: string };

/**
 * N10 -- Motive 2-hour reminder
 * Scheduled when a motive is created. Fires 2 hours before scheduledAt.
 */
export async function handleMotiveReminder(job: { data: MotiveJobData }): Promise<void> {
  const { motiveId } = job.data;

  const [motive] = await db
    .select({ title: motives.title, status: motives.status })
    .from(motives)
    .where(eq(motives.id, motiveId))
    .limit(1);

  if (!motive || motive.status === 'cancelled') return;

  const going = await db
    .select({ userId: motiveAttendees.userId })
    .from(motiveAttendees)
    .where(and(eq(motiveAttendees.motiveId, motiveId), eq(motiveAttendees.rsvpStatus, 'going')));

  const ids = going.map((a) => a.userId);
  if (ids.length === 0) return;

  await sendPushBatch(ids, {
    title: motive.title,
    body: 'Starts in 2 hours -- get ready',
    data: { screen: 'motives', motiveId },
  }, 'notifyMotiveInvites');
}
