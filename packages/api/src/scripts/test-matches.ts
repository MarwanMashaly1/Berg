import 'dotenv/config';
import { db } from '../db.js';
import { dailyPrompts, promptResponses, users, circles } from '@berg/shared';
import { eq, and, sql } from 'drizzle-orm';

const MY_USER_ID = '9xWk2v3c6T2d4Gb7pwjfNiOBjlHZTjIf';

async function main() {
  console.log('🔍 Testing matches for Marwan...');

  const todayStr = new Date().toISOString().split('T')[0];
  const [prompt] = await db.select().from(dailyPrompts).where(eq(dailyPrompts.activeDate, todayStr)).limit(1);

  if (!prompt) {
    console.error('❌ No prompt found for today.');
    process.exit(1);
  }

  console.log(`Prompt: ${prompt.question} (ID: ${prompt.id})`);

  // 1. Get My Response
  const [myResponse] = await db
    .select()
    .from(promptResponses)
    .where(and(eq(promptResponses.userId, MY_USER_ID), eq(promptResponses.promptId, prompt.id)))
    .limit(1);

  // 1.5. Debug Responses
  const allResponses = await db
    .select()
    .from(promptResponses)
    .where(eq(promptResponses.promptId, prompt.id));
  
  console.log('\n🔍 All Raw Responses for this prompt:');
  console.table(allResponses.map(r => ({ userId: r.userId, optionKey: r.optionKey })));

  // 1.6. Debug Circles for Marwan
  const marwanCircles = await db
    .select()
    .from(circles)
    .where(eq(circles.userId, MY_USER_ID));
  
  console.log('\n🔍 Marwan\'s Circles:');
  console.table(marwanCircles.map(c => ({ friendId: c.friendId, status: c.status })));

  // 2. Fetch Matches (Simulating /api/prompts/:id/matches logic)
  const matches = await db
    .select({
      userId: promptResponses.userId,
      name: users.name,
      optionKey: promptResponses.optionKey,
      storyText: promptResponses.storyText,
    })
    .from(promptResponses)
    .innerJoin(users, eq(users.id, promptResponses.userId))
    .innerJoin(circles, and(
      eq(circles.friendId, promptResponses.userId),
      eq(circles.userId, MY_USER_ID),
      eq(circles.status, 'confirmed')
    ))
    .where(and(
      eq(promptResponses.promptId, prompt.id),
      eq(promptResponses.optionKey, myResponse.optionKey ?? '')
    ))
    .limit(20);

  console.log('\n✅ Circle Matches:');
  console.table(matches);

  // 3. Fetch Adjacent Matches
  let adjacentMatches: typeof matches = [];
  if (myResponse.optionIndex !== null) {
    adjacentMatches = await db
      .select({
        userId: promptResponses.userId,
        name: users.name,
        optionKey: promptResponses.optionKey,
        storyText: promptResponses.storyText,
      })
      .from(promptResponses)
      .innerJoin(users, eq(users.id, promptResponses.userId))
      .innerJoin(circles, and(
        eq(circles.friendId, promptResponses.userId),
        eq(circles.userId, MY_USER_ID),
        eq(circles.status, 'confirmed')
      ))
      .where(and(
        eq(promptResponses.promptId, prompt.id),
        sql`ABS(${promptResponses.optionIndex} - ${myResponse.optionIndex}) = 1`
      ))
      .limit(5);
  }

  console.log('\n✅ Adjacent Circle Matches:');
  console.table(adjacentMatches);

  const state = matches.length > 0
    ? 'matches'
    : adjacentMatches.length > 0
    ? 'first_in_circle'
    : 'first_in_network';

  console.log(`\nFinal State: ${state}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
