import { db } from '../db.js';
import {
  circles, dailyPrompts, promptResponseNotifications,
  promptResponses, users,
} from '@berg/shared';
import { and, count, eq, inArray } from 'drizzle-orm';
import { sendPush } from '../lib/notifications.js';

export type PromptMatchData = {
  promptId: string;
  userId: string;
  optionKey: string;
};

/**
 * N8 â€” First prompt match notification
 * N9 â€” Third prompt match notification
 *
 * Runs every time a user responds to a prompt.
 * Checks how many circle-friends share the same optionKey.
 * Sends at most 2 notifications per user per prompt (1st match + 3rd match).
 */
export async function handlePromptMatch(job: { data: PromptMatchData }): Promise<void> {
  const { promptId, userId, optionKey } = job.data;

  // 1. Check prompt expiry â€” notifications expire at midnight of the prompt day
  const [prompt] = await db
    .select({ activeDate: dailyPrompts.activeDate })
    .from(dailyPrompts)
    .where(eq(dailyPrompts.id, promptId))
    .limit(1);

  if (!prompt) return;

  const promptMidnight = new Date(prompt.activeDate);
  promptMidnight.setHours(23, 59, 59, 999);
  if (Date.now() > promptMidnight.getTime()) return; // past midnight, skip

  // 2. Check user preference
  const [user] = await db
    .select({ notifyPromptMatches: users.notifyPromptMatches })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.notifyPromptMatches) return;

  // 3. Check existing notification state for this prompt
  const [existing] = await db
    .select()
    .from(promptResponseNotifications)
    .where(
      and(
        eq(promptResponseNotifications.userId, userId),
        eq(promptResponseNotifications.promptId, promptId),
      ),
    )
    .limit(1);

  if (existing?.notificationsSent >= 2) return; // already hit max
  if (existing?.optedIn === false) return; // user opted out

  // 4. Count circle-friends with the same optionKey
  const friendRows = await db
    .select({ friendId: circles.friendId })
    .from(circles)
    .where(and(eq(circles.userId, userId), eq(circles.status, 'confirmed')));

  const friendIds = friendRows.map((f) => f.friendId);
  if (friendIds.length === 0) return;

  const [{ matchCount }] = await db
    .select({ matchCount: count() })
    .from(promptResponses)
    .where(
      and(
        eq(promptResponses.promptId, promptId),
        eq(promptResponses.optionKey, optionKey),
        inArray(promptResponses.userId, friendIds),
      ),
    );

  const sent = existing?.notificationsSent ?? 0;
  const expiresAt = promptMidnight;

  // N8 â€” First match
  if (matchCount >= 1 && sent === 0) {
    const [firstMatch] = await db
      .select({ name: users.name })
      .from(promptResponses)
      .innerJoin(users, eq(users.id, promptResponses.userId))
      .where(
        and(
          eq(promptResponses.promptId, promptId),
          eq(promptResponses.optionKey, optionKey),
          inArray(promptResponses.userId, friendIds),
        ),
      )
      .limit(1);

    await sendPush(userId, {
      title: firstMatch?.name ?? 'A friend',
      body: 'agrees with your take â€” see what they said',
      data: { screen: 'discovery' },
    });

    await db
      .insert(promptResponseNotifications)
      .values({ userId, promptId, notificationsSent: 1, firstMatchNotifiedAt: new Date(), optedIn: true, expiresAt })
      .onConflictDoUpdate({
        target: [promptResponseNotifications.userId, promptResponseNotifications.promptId],
        set: { notificationsSent: 1, firstMatchNotifiedAt: new Date() },
      });
    return;
  }

  // N9 â€” Third match
  if (matchCount >= 3 && sent === 1) {
    await sendPush(userId, {
      title: 'Your people agree',
      body: '3 people in your circle think the same â€” time for a Motive?',
      data: { screen: 'discovery' },
    });

    await db
      .update(promptResponseNotifications)
      .set({ notificationsSent: 2, thresholdNotifiedAt: new Date() })
      .where(
        and(
          eq(promptResponseNotifications.userId, userId),
          eq(promptResponseNotifications.promptId, promptId),
        ),
      );
  }
}
