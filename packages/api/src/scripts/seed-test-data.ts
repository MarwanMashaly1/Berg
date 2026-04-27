import 'dotenv/config';
import { db } from '../db.js';
import { users, dailyPrompts, promptResponses, circles } from '@berg/shared';
import { eq, and, inArray } from 'drizzle-orm';

const MY_USER_ID = '9xWk2v3c6T2d4Gb7pwjfNiOBjlHZTjIf';

async function main() {
  console.log('ðŸŒ± Seeding test data...');

  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Ensure Today's Prompt exists
  const promptData = {
    question: 'Best way to spend a Friday night?',
    category: 'Spontaneity',
    activeDate: todayStr,
    type: 'pick_your_camp',
    options: JSON.stringify([
      { key: 'movie', label: 'Outdoor movie' },
      { key: 'jazz', label: 'Jazz club' },
      { key: 'hike', label: 'Night hike' },
      { key: 'cafe', label: 'Board game cafe' }
    ]),
  };

  await db.insert(dailyPrompts).values(promptData).onConflictDoUpdate({
    target: dailyPrompts.activeDate,
    set: promptData,
  });

  const [prompt] = await db.select().from(dailyPrompts).where(eq(dailyPrompts.activeDate, todayStr)).limit(1);
  console.log(`âœ… Prompt ready: ${prompt.question}`);

  // 2. Setup Circles
  const circleUserIds = [
    '524ef555-238c-4d62-b653-0c1a41a87129', // Jamie
    '581b33b9-7327-4cc8-aeb9-616cc9c8292f', // Alex
    '7fc526c3-6427-4d76-9f3f-ff62e62e7e26', // Sam
  ];

  // 1.5. Clear existing circles for these users to avoid duplicates
  await db.delete(circles).where(
    and(
      eq(circles.userId, MY_USER_ID),
      inArray(circles.friendId, circleUserIds)
    )
  );
  await db.delete(circles).where(
    and(
      eq(circles.friendId, MY_USER_ID),
      inArray(circles.userId, circleUserIds)
    )
  );

  for (const friendId of circleUserIds) {
    // Bi-directional confirmed circles
    await db.insert(circles).values({
      userId: MY_USER_ID,
      friendId,
      status: 'confirmed'
    }).onConflictDoNothing();
    
    await db.insert(circles).values({
      userId: friendId,
      friendId: MY_USER_ID,
      status: 'confirmed'
    }).onConflictDoNothing();
  }
  console.log('âœ… Circles confirmed for Jamie, Alex, and Sam.');

  // 3. Seed Responses
  const responses = [
    { userId: MY_USER_ID, optionKey: 'jazz', optionIndex: 1, storyText: 'Love some live saxophone!' },
    { userId: '524ef555-238c-4d62-b653-0c1a41a87129', optionKey: 'jazz', optionIndex: 1, storyText: 'Count me in for jazz.' }, // Jamie - Match
    { userId: '581b33b9-7327-4cc8-aeb9-616cc9c8292f', optionKey: 'jazz', optionIndex: 1, storyText: 'Need to hear some Coltrane.' }, // Alex - Match
    { userId: '7fc526c3-6427-4d76-9f3f-ff62e62e7e26', optionKey: 'movie', optionIndex: 0, storyText: 'Movies under the stars are the best.' }, // Sam - Adjacent
    { userId: 'ab1aef97-b3b9-41be-8875-9ec51407c82f', optionKey: 'jazz', optionIndex: 1, storyText: 'Jazz is the vibe.' }, // Maya - Non-circle Match
  ];

  for (const resp of responses) {
    await db.insert(promptResponses).values({
      ...resp,
      promptId: prompt.id,
      responseText: '',
      respondedAt: new Date(),
    }).onConflictDoUpdate({
      target: [promptResponses.userId, promptResponses.promptId],
      set: {
        optionKey: resp.optionKey,
        optionIndex: resp.optionIndex,
        storyText: resp.storyText,
        respondedAt: new Date(),
      }
    });
  }

  console.log('âœ… Responses seeded.');
  console.log('ðŸš€ Test data ready!');
  process.exit(0);
}

main().catch(err => {
  console.error('âŒ Seeding failed:', err);
  process.exit(1);
});
