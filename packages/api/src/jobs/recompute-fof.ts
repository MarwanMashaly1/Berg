import { db } from '../db.js';
import {
  users, circles, userVibeTags, fofSuggestions,
  motiveAttendees, promptResponses, userBlocks,
} from '@berg/shared';
import { and, eq, inArray, notInArray, ne, sql } from 'drizzle-orm';

/**
 * FOF suggestion scoring â€” 5 signals, weighted sum â†’ 0.00â€“1.00
 *
 * 1. Mutual friends    35% â€” shared confirmed connections (normalised /3)
 * 2. Vibe tag Jaccard  30% â€” intersection/union of tag sets
 * 3. Motive overlap    20% â€” shared motive attendance (normalised /2)
 * 4. Prompt similarity 10% â€” matching optionKey on same prompts
 * 5. Recency            5% â€” linear decay over 30 days since last active
 */
function score(
  myFriendIds: Set<string>,
  myTagIds: Set<string>,
  myMotiveIds: Set<string>,
  myPromptMap: Map<string, string>,   // promptId â†’ optionKey
  candidate: {
    friendIds: Set<string>;
    tagIds: Set<string>;
    motiveIds: Set<string>;
    promptMap: Map<string, string>;
    updatedAt: Date | null;
  },
): number {
  // 1. Mutual friends (35%)
  let mutualCount = 0;
  for (const id of myFriendIds) { if (candidate.friendIds.has(id)) mutualCount++; }
  const mutualScore = Math.min(mutualCount / 3, 1);

  // 2. Vibe tag Jaccard (30%)
  let tagIntersect = 0;
  let tagUnion = new Set([...myTagIds, ...candidate.tagIds]).size;
  for (const id of myTagIds) { if (candidate.tagIds.has(id)) tagIntersect++; }
  const tagScore = tagUnion > 0 ? tagIntersect / tagUnion : 0;

  // 3. Motive attendance overlap (20%)
  let motiveOverlap = 0;
  for (const id of myMotiveIds) { if (candidate.motiveIds.has(id)) motiveOverlap++; }
  const motiveScore = Math.min(motiveOverlap / 2, 1);

  // 4. Prompt answer similarity (10%)
  let promptTotal = 0;
  let promptMatch = 0;
  for (const [promptId, myKey] of myPromptMap) {
    const theirKey = candidate.promptMap.get(promptId);
    if (theirKey !== undefined) {
      promptTotal++;
      if (theirKey === myKey) promptMatch++;
    }
  }
  const promptScore = promptTotal > 0 ? promptMatch / promptTotal : 0;

  // 5. Recency (5%) â€” linear decay to 0 at 30 days
  const daysSince = candidate.updatedAt
    ? (Date.now() - candidate.updatedAt.getTime()) / 86_400_000
    : 90;
  const recencyScore = Math.max(0, 1 - daysSince / 30);

  return (
    mutualScore  * 0.35 +
    tagScore     * 0.30 +
    motiveScore  * 0.20 +
    promptScore  * 0.10 +
    recencyScore * 0.05
  );
}

/**
 * Compute and upsert FOF suggestions for a single user.
 * Called by the daily cron job and by immediate-trigger jobs.
 */
export async function recomputeFofForUser(userId: string): Promise<void> {
  // â”€â”€ 1. Load the user's data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Confirmed friends
  const myFriendRows = await db
    .select({ friendId: circles.friendId })
    .from(circles)
    .where(and(eq(circles.userId, userId), eq(circles.status, 'confirmed')));
  const myFriendIds = new Set(myFriendRows.map((r) => r.friendId));

  if (myFriendIds.size === 0) return; // no friends yet â†’ no FOF to compute

  // Blocked users (exclude from suggestions)
  const blockedRows = await db
    .select({ blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(eq(userBlocks.blockerId, userId));
  const blockedIds = new Set(blockedRows.map((r) => r.blockedId));

  // My vibe tags
  const myTagRows = await db
    .select({ tagId: userVibeTags.tagId })
    .from(userVibeTags)
    .where(eq(userVibeTags.userId, userId));
  const myTagIds = new Set(myTagRows.map((r) => r.tagId));

  // My attended motive IDs (as organiser or attendee with rsvpStatus = going/joined)
  const myMotiveRows = await db
    .select({ motiveId: motiveAttendees.motiveId })
    .from(motiveAttendees)
    .where(
      and(
        eq(motiveAttendees.userId, userId),
        inArray(motiveAttendees.rsvpStatus, ['going', 'joined']),
      ),
    );
  const myMotiveIds = new Set(myMotiveRows.map((r) => r.motiveId));

  // My prompt responses (last 90 days of prompts for similarity)
  const myPromptRows = await db
    .select({ promptId: promptResponses.promptId, optionKey: promptResponses.optionKey })
    .from(promptResponses)
    .where(eq(promptResponses.userId, userId));
  const myPromptMap = new Map(myPromptRows.map((r) => [r.promptId, r.optionKey ?? '']));

  // â”€â”€ 2. Find FOF candidates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Friends of my friends
  const friendIds = [...myFriendIds];

  const fofRows = await db
    .select({ friendId: circles.friendId })
    .from(circles)
    .where(
      and(
        inArray(circles.userId, friendIds),
        eq(circles.status, 'confirmed'),
        ne(circles.friendId, userId),                    // not me
        notInArray(circles.friendId, friendIds),         // not already my friend
      ),
    );

  // Deduplicate candidates
  const candidateIds = [...new Set(
    fofRows
      .map((r) => r.friendId)
      .filter((id) => !blockedIds.has(id)),
  )];

  if (candidateIds.length === 0) return;

  // â”€â”€ 3. Load candidate data in bulk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Filter to users who are discoverable and have completed onboarding
  const candidateUsers = await db
    .select({ id: users.id, updatedAt: users.updatedAt })
    .from(users)
    .where(
      and(
        inArray(users.id, candidateIds),
        eq(users.showInDiscovery, true),
        eq(users.onboardingCompleted, true),
      ),
    );

  const activeIds = candidateUsers.map((u) => u.id);
  if (activeIds.length === 0) return;

  // Bulk fetch tags for all candidates
  const tagRows = await db
    .select({ userId: userVibeTags.userId, tagId: userVibeTags.tagId })
    .from(userVibeTags)
    .where(inArray(userVibeTags.userId, activeIds));

  // Bulk fetch motive attendance for all candidates
  const motiveRows = await db
    .select({ userId: motiveAttendees.userId, motiveId: motiveAttendees.motiveId })
    .from(motiveAttendees)
    .where(
      and(
        inArray(motiveAttendees.userId, activeIds),
        inArray(motiveAttendees.rsvpStatus, ['going', 'joined']),
      ),
    );

  // Bulk fetch prompt responses for all candidates
  const promptRows = await db
    .select({ userId: promptResponses.userId, promptId: promptResponses.promptId, optionKey: promptResponses.optionKey })
    .from(promptResponses)
    .where(inArray(promptResponses.userId, activeIds));

  // Bulk fetch friend lists for all candidates (to compute mutual friends)
  const candidateFriendRows = await db
    .select({ userId: circles.userId, friendId: circles.friendId })
    .from(circles)
    .where(
      and(
        inArray(circles.userId, activeIds),
        eq(circles.status, 'confirmed'),
      ),
    );

  // â”€â”€ 4. Index data by candidate ID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const candidateTagMap = new Map<string, Set<string>>();
  for (const r of tagRows) {
    if (!candidateTagMap.has(r.userId)) candidateTagMap.set(r.userId, new Set());
    candidateTagMap.get(r.userId)!.add(r.tagId);
  }

  const candidateMotiveMap = new Map<string, Set<string>>();
  for (const r of motiveRows) {
    if (!candidateMotiveMap.has(r.userId)) candidateMotiveMap.set(r.userId, new Set());
    candidateMotiveMap.get(r.userId)!.add(r.motiveId);
  }

  const candidatePromptMap = new Map<string, Map<string, string>>();
  for (const r of promptRows) {
    if (!candidatePromptMap.has(r.userId)) candidatePromptMap.set(r.userId, new Map());
    candidatePromptMap.get(r.userId)!.set(r.promptId, r.optionKey ?? '');
  }

  const candidateFriendMap = new Map<string, Set<string>>();
  for (const r of candidateFriendRows) {
    if (!candidateFriendMap.has(r.userId)) candidateFriendMap.set(r.userId, new Set());
    candidateFriendMap.get(r.userId)!.add(r.friendId);
  }

  const candidateUpdatedAtMap = new Map(
    candidateUsers.map((u) => [u.id, u.updatedAt]),
  );

  // â”€â”€ 5. Score each candidate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const scored: Array<{
    userId: string;
    suggestedUserId: string;
    score: number;
    mutualFriendIds: string[];
    sharedTagCount: number;
  }> = [];

  for (const candidateId of activeIds) {
    const cFriends = candidateFriendMap.get(candidateId) ?? new Set<string>();
    const cTags    = candidateTagMap.get(candidateId)    ?? new Set<string>();
    const cMotives = candidateMotiveMap.get(candidateId) ?? new Set<string>();
    const cPrompts = candidatePromptMap.get(candidateId) ?? new Map<string, string>();
    const cUpdated = candidateUpdatedAtMap.get(candidateId) ?? null;

    // Compute mutual friend IDs
    const mutualFriendIds: string[] = [];
    for (const id of myFriendIds) { if (cFriends.has(id)) mutualFriendIds.push(id); }

    // Compute shared tag count
    let sharedTagCount = 0;
    for (const id of myTagIds) { if (cTags.has(id)) sharedTagCount++; }

    const s = score(myFriendIds, myTagIds, myMotiveIds, myPromptMap, {
      friendIds: cFriends,
      tagIds: cTags,
      motiveIds: cMotives,
      promptMap: cPrompts,
      updatedAt: cUpdated,
    });

    scored.push({ userId, suggestedUserId: candidateId, score: s, mutualFriendIds, sharedTagCount });
  }

  // Keep only top 20 by score (descending)
  scored.sort((a, b) => b.score - a.score);
  const top20 = scored.slice(0, 20);

  if (top20.length === 0) return;

  // â”€â”€ 6. Upsert into fof_suggestions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  await db
    .insert(fofSuggestions)
    .values(
      top20.map((r) => ({
        userId: r.userId,
        suggestedUserId: r.suggestedUserId,
        score: r.score.toFixed(2),
        mutualFriendIds: r.mutualFriendIds,
        sharedTagCount: r.sharedTagCount,
        computedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [fofSuggestions.userId, fofSuggestions.suggestedUserId],
      set: {
        score: sql`excluded.score`,
        mutualFriendIds: sql`excluded.mutual_friend_ids`,
        sharedTagCount: sql`excluded.shared_tag_count`,
        computedAt: sql`excluded.computed_at`,
      },
    });
}

/**
 * Recompute FOF for a single user (immediate trigger).
 * Job name: 'discovery/recompute-fof-user'
 */
export async function handleRecomputeFofUser(job: { data: { userId: string } }): Promise<void> {
  await recomputeFofForUser(job.data.userId);
}

/**
 * Recompute FOF for ALL users (daily cron job).
 * Job name: 'discovery/recompute-fof-all'
 * Processes users in batches of 50 to avoid memory pressure.
 */
export async function handleRecomputeFofAll(): Promise<void> {
  const allUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.onboardingCompleted, true),
        eq(users.showInDiscovery, true),
      ),
    );

  console.log(`[fof] Recomputing for ${allUsers.length} users`);

  const BATCH = 50;
  for (let i = 0; i < allUsers.length; i += BATCH) {
    const batch = allUsers.slice(i, i + BATCH);
    await Promise.allSettled(batch.map((u) => recomputeFofForUser(u.id)));
    console.log(`[fof] Processed ${Math.min(i + BATCH, allUsers.length)} / ${allUsers.length}`);
  }
}
