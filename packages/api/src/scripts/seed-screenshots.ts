/**
 * Screenshot seed — creates realistic fake data around alphaplaners@gmail.com
 * Run: pnpm tsx src/scripts/seed-screenshots.ts
 */
import 'dotenv/config';
import { db } from '../db.js';
import {
  users,
  circles,
  motives,
  motiveAttendees,
  chats,
  chatMembers,
  messages,
  dailyPrompts,
  promptResponses,
} from '@berg/shared';
import { eq, and } from 'drizzle-orm';

// ─── helpers ──────────────────────────────────────────────────────────────────

function randomId() {
  return Math.random().toString(36).slice(2, 34).padEnd(32, '0');
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function hoursAgo(n: number) {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

function minsAgo(n: number) {
  return new Date(Date.now() - n * 60 * 1000);
}

// ─── fake friends ─────────────────────────────────────────────────────────────

const FRIENDS = [
  {
    id: randomId(),
    name: 'Jamie Chen',
    email: 'jamie.chen.berg@example.com',
    username: 'jamiec',
    displayName: 'Jamie',
    bio: 'Always up for good food and better company 🍜',
    availabilityStatus: 'down_to_hang',
  },
  {
    id: randomId(),
    name: 'Sofia Martinez',
    email: 'sofia.martinez.berg@example.com',
    username: 'sofiam',
    displayName: 'Sofia',
    bio: 'Weekend adventurer | coffee snob ☕',
    availabilityStatus: 'down_to_hang',
  },
  {
    id: randomId(),
    name: 'Marcus Williams',
    email: 'marcus.williams.berg@example.com',
    username: 'marcusw',
    displayName: 'Marcus',
    bio: 'DJ by night, developer by day 🎧',
    availabilityStatus: 'open_to_plans',
  },
  {
    id: randomId(),
    name: 'Priya Patel',
    email: 'priya.patel.berg@example.com',
    username: 'priyap',
    displayName: 'Priya',
    bio: 'Hiking, yoga, brunch — in that order 🌿',
    availabilityStatus: 'down_to_hang',
  },
  {
    id: randomId(),
    name: 'Tyler Brooks',
    email: 'tyler.brooks.berg@example.com',
    username: 'tylerb',
    displayName: 'Tyler',
    bio: 'Making memories one motive at a time ✨',
    availabilityStatus: 'lying_low',
  },
];

async function main() {
  console.log('🌱 Seeding screenshot data...');

  // ── 1. Find main user ───────────────────────────────────────────────────────
  const [mainUser] = await db.select().from(users)
    .where(eq(users.email, 'alphaplaners@gmail.com'))
    .limit(1);

  if (!mainUser) {
    console.error('❌ User alphaplaners@gmail.com not found. Create the account first.');
    process.exit(1);
  }

  const ME = mainUser.id;
  console.log(`✅ Found main user: ${mainUser.name} (${ME})`);

  // ── 2. Update main user profile ─────────────────────────────────────────────
  await db.update(users).set({
    displayName: 'Alex',
    username: 'alexk',
    bio: 'Down for anything spontaneous 🎸',
    onboardingCompleted: true,
    onboardingStep: '6',
    onboardingCompletedAt: daysFromNow(-10),
    activatedAt: daysFromNow(-10),
    availabilityStatus: 'down_to_hang',
    showInDiscovery: true,
    emailVerified: true,
  }).where(eq(users.id, ME));
  console.log('✅ Updated main user profile');

  // ── 3. Create fake friends ──────────────────────────────────────────────────
  for (const friend of FRIENDS) {
    await db.insert(users).values({
      id: friend.id,
      name: friend.name,
      email: friend.email,
      username: friend.username,
      displayName: friend.displayName,
      bio: friend.bio,
      availabilityStatus: friend.availabilityStatus,
      emailVerified: true,
      onboardingCompleted: true,
      onboardingStep: '6',
      onboardingCompletedAt: daysFromNow(-15),
      activatedAt: daysFromNow(-15),
      showInDiscovery: true,
    } as any).onConflictDoNothing();
  }
  console.log(`✅ Created ${FRIENDS.length} fake friends`);

  const [jamie, sofia, marcus, priya, tyler] = FRIENDS;

  // ── 4. Create bidirectional circles ─────────────────────────────────────────
  const circlePairs = [
    [ME, jamie.id],
    [ME, sofia.id],
    [ME, marcus.id],
    [ME, priya.id],
    [ME, tyler.id],
    [jamie.id, sofia.id],
    [jamie.id, marcus.id],
    [sofia.id, priya.id],
  ];

  for (const [a, b] of circlePairs) {
    await db.insert(circles).values({ userId: a, friendId: b, status: 'confirmed' } as any).onConflictDoNothing();
    await db.insert(circles).values({ userId: b, friendId: a, status: 'confirmed' } as any).onConflictDoNothing();
  }
  console.log('✅ Circles confirmed');

  // ── 5. Create motives ───────────────────────────────────────────────────────

  // Motive A: upcoming rooftop drinks this Friday
  const [motiveA] = await db.insert(motives).values({
    creatorId: ME,
    title: 'Rooftop Sunset Drinks 🌇',
    category: 'social',
    description: 'Golden hour vibes at Skyline Bar. Dress cute.',
    scheduledAt: daysFromNow(3),
    venueName: 'Skyline Rooftop Bar',
    status: 'open',
    note: 'Getting there around 7pm, staying for at least 2 hours',
  } as any).returning();

  await db.insert(motiveAttendees).values([
    { motiveId: motiveA.id, userId: ME,        role: 'organiser',  rsvpStatus: 'going' },
    { motiveId: motiveA.id, userId: jamie.id,  role: 'attendee',   rsvpStatus: 'going' },
    { motiveId: motiveA.id, userId: sofia.id,  role: 'attendee',   rsvpStatus: 'going' },
    { motiveId: motiveA.id, userId: marcus.id, role: 'attendee',   rsvpStatus: 'maybe' },
  ] as any[]).onConflictDoNothing();

  // Chat for motive A
  const [chatA] = await db.insert(chats).values({
    type: 'motive_thread',
    motiveId: motiveA.id,
    name: 'Rooftop Sunset Drinks 🌇',
  } as any).returning();

  await db.insert(chatMembers).values([
    { chatId: chatA.id, userId: ME,        lastReadAt: new Date() },
    { chatId: chatA.id, userId: jamie.id,  lastReadAt: hoursAgo(1) },
    { chatId: chatA.id, userId: sofia.id,  lastReadAt: hoursAgo(2) },
    { chatId: chatA.id, userId: marcus.id, lastReadAt: hoursAgo(5) },
  ] as any[]).onConflictDoNothing();

  const chatAMsgs = [
    { senderId: ME,        content: "just locked in Skyline Rooftop for Friday 🔥 who's in?", createdAt: hoursAgo(6) },
    { senderId: jamie.id,  content: "YESSS been wanting to go there forever", createdAt: hoursAgo(5) },
    { senderId: sofia.id,  content: "I'm so in. what time?", createdAt: hoursAgo(5) },
    { senderId: ME,        content: "let's aim for 7, catch the full sunset 🌅", createdAt: hoursAgo(4) },
    { senderId: marcus.id, content: "might be a bit late from work but I'll try to make it", createdAt: hoursAgo(3) },
    { senderId: jamie.id,  content: "dress code? like how fancy", createdAt: hoursAgo(2) },
    { senderId: ME,        content: "smart casual, nothing crazy. they do enforce it on weekends tho", createdAt: hoursAgo(2) },
    { senderId: sofia.id,  content: "ok perfect already planning my outfit 😂", createdAt: hoursAgo(1) },
    { senderId: jamie.id,  content: "same lol. should we prebook a table?", createdAt: minsAgo(45) },
    { senderId: ME,        content: "yeah good call, doing it now", createdAt: minsAgo(30) },
    { senderId: ME,        content: "done ✅ table for 4 at 7pm. marcus just show up whenever", createdAt: minsAgo(20) },
    { senderId: marcus.id, content: "legend 🙌", createdAt: minsAgo(10) },
  ];

  for (const msg of chatAMsgs) {
    await db.insert(messages).values({ chatId: chatA.id, type: 'text', ...msg } as any);
  }

  // Motive B: upcoming Saturday morning hike
  const [motiveB] = await db.insert(motives).values({
    creatorId: priya.id,
    title: 'Saturday Morning Hike 🥾',
    category: 'outdoors',
    description: 'Sunrise hike up Grouse. Bring layers + snacks.',
    scheduledAt: daysFromNow(5),
    venueName: 'Grouse Mountain Trail',
    status: 'open',
    note: 'Meeting at the base at 6:30am sharp',
  } as any).returning();

  await db.insert(motiveAttendees).values([
    { motiveId: motiveB.id, userId: priya.id, role: 'organiser',    rsvpStatus: 'going' },
    { motiveId: motiveB.id, userId: ME,       role: 'attendee',     rsvpStatus: 'going' },
    { motiveId: motiveB.id, userId: sofia.id, role: 'attendee',     rsvpStatus: 'going' },
    { motiveId: motiveB.id, userId: tyler.id, role: 'attendee',     rsvpStatus: 'going' },
    { motiveId: motiveB.id, userId: jamie.id, role: 'attendee',     rsvpStatus: 'maybe' },
  ] as any[]).onConflictDoNothing();

  const [chatB] = await db.insert(chats).values({
    type: 'motive_thread',
    motiveId: motiveB.id,
    name: 'Saturday Morning Hike 🥾',
  } as any).returning();

  await db.insert(chatMembers).values([
    { chatId: chatB.id, userId: priya.id, lastReadAt: new Date() },
    { chatId: chatB.id, userId: ME,       lastReadAt: hoursAgo(3) },
    { chatId: chatB.id, userId: sofia.id, lastReadAt: hoursAgo(4) },
    { chatId: chatB.id, userId: tyler.id, lastReadAt: hoursAgo(8) },
    { chatId: chatB.id, userId: jamie.id, lastReadAt: hoursAgo(12) },
  ] as any[]).onConflictDoNothing();

  const chatBMsgs = [
    { senderId: priya.id, content: "ok saturday hike is ON 🏔️ who's coming?", createdAt: hoursAgo(26) },
    { senderId: ME,       content: "I'm in!! haven't done Grouse in months", createdAt: hoursAgo(25) },
    { senderId: sofia.id, content: "ugh yes I need this after the week I've had", createdAt: hoursAgo(25) },
    { senderId: tyler.id, content: "count me in. what time?", createdAt: hoursAgo(24) },
    { senderId: priya.id, content: "6:30am at the base. I know it's early but the views 😍", createdAt: hoursAgo(23) },
    { senderId: jamie.id, content: "6:30 AM? Priya what is wrong with you", createdAt: hoursAgo(22) },
    { senderId: ME,       content: "lmaooo jamie but it's worth it trust", createdAt: hoursAgo(22) },
    { senderId: priya.id, content: "we catch sunrise at the top 🌅 it's magical I promise", createdAt: hoursAgo(21) },
    { senderId: jamie.id, content: "...fine. but someone better bring coffee", createdAt: hoursAgo(20) },
    { senderId: sofia.id, content: "I'll bring the thermos ☕", createdAt: hoursAgo(20) },
    { senderId: tyler.id, content: "and I'll bring the trail mix 🥜", createdAt: hoursAgo(19) },
    { senderId: priya.id, content: "perfect team 🙌 wear layers it gets cold at the top", createdAt: hoursAgo(18) },
    { senderId: ME,       content: "set 3 alarms already not missing this", createdAt: hoursAgo(3) },
  ];

  for (const msg of chatBMsgs) {
    await db.insert(messages).values({ chatId: chatB.id, type: 'text', ...msg } as any);
  }

  // Motive C: past completed jazz night
  const [motiveC] = await db.insert(motives).values({
    creatorId: ME,
    title: 'Jazz Night at Blue Note 🎷',
    category: 'music',
    description: 'Live quartet, craft cocktails, good vibes.',
    scheduledAt: daysFromNow(-7),
    venueName: 'Blue Note Jazz Club',
    status: 'completed',
    note: 'Was absolutely incredible — definitely doing this again',
  } as any).returning();

  await db.insert(motiveAttendees).values([
    { motiveId: motiveC.id, userId: ME,        role: 'organiser', rsvpStatus: 'going' },
    { motiveId: motiveC.id, userId: jamie.id,  role: 'attendee',  rsvpStatus: 'going' },
    { motiveId: motiveC.id, userId: marcus.id, role: 'attendee',  rsvpStatus: 'going' },
    { motiveId: motiveC.id, userId: sofia.id,  role: 'attendee',  rsvpStatus: 'going' },
  ] as any[]).onConflictDoNothing();

  const [chatC] = await db.insert(chats).values({
    type: 'motive_thread',
    motiveId: motiveC.id,
    name: 'Jazz Night at Blue Note 🎷',
  } as any).returning();

  await db.insert(chatMembers).values([
    { chatId: chatC.id, userId: ME,        lastReadAt: daysFromNow(-6) },
    { chatId: chatC.id, userId: jamie.id,  lastReadAt: daysFromNow(-6) },
    { chatId: chatC.id, userId: marcus.id, lastReadAt: daysFromNow(-6) },
    { chatId: chatC.id, userId: sofia.id,  lastReadAt: daysFromNow(-6) },
  ] as any[]).onConflictDoNothing();

  const chatCMsgs = [
    { senderId: ME,        content: "that was genuinely one of the best nights this year 🎷", createdAt: daysFromNow(-6), },
    { senderId: marcus.id, content: "bro the bass player was INSANE", createdAt: daysFromNow(-6) },
    { senderId: jamie.id,  content: "I don't even really listen to jazz and I was fully locked in", createdAt: daysFromNow(-6) },
    { senderId: sofia.id,  content: "those cocktails too omg the smoked old fashioned 😍", createdAt: daysFromNow(-6) },
    { senderId: ME,        content: "already looking at their next lineup. there's a pianist next month that's supposed to be incredible", createdAt: daysFromNow(-6) },
    { senderId: marcus.id, content: "I'm in before you even ask", createdAt: daysFromNow(-6) },
    { senderId: jamie.id,  content: "same. this needs to be a monthly thing", createdAt: daysFromNow(-6) },
    { senderId: sofia.id,  content: "monthly jazz night?? add it to the group calendar", createdAt: daysFromNow(-6) },
  ];

  for (const msg of chatCMsgs) {
    await db.insert(messages).values({ chatId: chatC.id, type: 'text', ...msg } as any);
  }

  // ── 6. Today's prompt + responses ───────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];

  const promptData = {
    question: 'Perfect Saturday plan?',
    category: 'Vibe Check',
    activeDate: todayStr,
    type: 'pick_your_camp',
    options: JSON.stringify([
      { key: 'brunch', emoji: '🍳', text: 'Long brunch that turns into lunch' },
      { key: 'outdoor', emoji: '🌿', text: 'Outdoor adventure, nature reset' },
      { key: 'culture', emoji: '🎨', text: 'Museum, gallery or show' },
      { key: 'spontaneous', emoji: '🎲', text: 'No plan, just go' },
    ]),
  };

  await db.insert(dailyPrompts).values(promptData as any).onConflictDoUpdate({
    target: dailyPrompts.activeDate,
    set: promptData,
  });

  const [prompt] = await db.select().from(dailyPrompts)
    .where(eq(dailyPrompts.activeDate, todayStr)).limit(1);

  const promptResps = [
    { userId: ME,        optionKey: 'outdoor',     optionIndex: 1, storyText: 'Need the fresh air after a busy week' },
    { userId: jamie.id,  optionKey: 'outdoor',     optionIndex: 1, storyText: 'Outdoors forever, forest bathing is real' },
    { userId: sofia.id,  optionKey: 'outdoor',     optionIndex: 1, storyText: 'Hiking > everything' },
    { userId: marcus.id, optionKey: 'spontaneous', optionIndex: 3, storyText: 'Best days have zero plan' },
    { userId: priya.id,  optionKey: 'outdoor',     optionIndex: 1, storyText: 'Already planning Grouse again tbh' },
    { userId: tyler.id,  optionKey: 'brunch',      optionIndex: 0, storyText: 'Brunch is basically a religion' },
  ];

  for (const resp of promptResps) {
    await db.insert(promptResponses).values({
      ...resp,
      promptId: prompt.id,
      responseText: '',
      respondedAt: new Date(),
    } as any).onConflictDoUpdate({
      target: [promptResponses.userId, promptResponses.promptId],
      set: { optionKey: resp.optionKey, optionIndex: resp.optionIndex, storyText: resp.storyText, respondedAt: new Date() },
    });
  }
  console.log('✅ Prompt + responses seeded');

  console.log('\n🚀 Screenshot data ready!');
  console.log(`   Main user: Alex (${ME})`);
  console.log(`   Friends: ${FRIENDS.map(f => f.displayName).join(', ')}`);
  console.log(`   Motives: Rooftop Drinks (Fri), Morning Hike (Sat), Jazz Night (past)`);
  console.log(`   Prompt: "${promptData.question}" — 3 outdoor matches with Jamie & Sofia & Priya`);

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
