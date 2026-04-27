import { pgTable, text, timestamp, uuid, integer, boolean, decimal, primaryKey, unique } from 'drizzle-orm/pg-core';
import { users } from './auth';

// Bidirectional friend circles (one row per direction)
export const circles = pgTable('circles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  friendId: text('friend_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),  // pending | confirmed
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  unique('unique_circle_per_direction').on(t.userId, t.friendId),
]);

// Named group circles (clubs, sports teams, etc.)
export const groupCircles = pgTable('group_circles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  adminUserId: text('admin_user_id').notNull().references(() => users.id),
  joinCode: text('join_code').notNull().unique(),  // 6-char alphanumeric
  requiresApproval: boolean('requires_approval').notNull().default(false),
  isPublic: boolean('is_public').notNull().default(true),
  categoryEmoji: text('category_emoji').notNull().default('👥'),
  categoryColor: text('category_color').notNull().default('#e8f0fe'),
  maxMembers: integer('max_members'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const groupCircleMembers = pgTable('group_circle_members', {
  groupCircleId: uuid('group_circle_id').notNull().references(() => groupCircles.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),  // pending | active
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  invitedBy: text('invited_by').references(() => users.id),
}, (t) => [primaryKey({ columns: [t.groupCircleId, t.userId] })]);

// Pre-computed friends-of-friends suggestions (recomputed every 6h)
export const fofSuggestions = pgTable('fof_suggestions', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  suggestedUserId: text('suggested_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  score: decimal('score', { precision: 5, scale: 2 }).notNull(),
  mutualFriendIds: text('mutual_friend_ids').array(),  // UUID array stored as text[]
  sharedTagCount: integer('shared_tag_count').notNull().default(0),
  computedAt: timestamp('computed_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.suggestedUserId] })]);

// Personalised invite links (track virality)
export const inviteLinks = pgTable('invite_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),  // 6-char
  clickCount: integer('click_count').notNull().default(0),
  signupCount: integer('signup_count').notNull().default(0),
  acceptedCount: integer('accepted_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Social cooling: dampens frequent rejectors/muters in Discovery
export const socialCoolingScores = pgTable('social_cooling_scores', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetUserId: text('target_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  score: decimal('score', { precision: 5, scale: 2 }).notNull().default('0'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.targetUserId] })]);

// User blocks (enforced across all surfaces)
export const userBlocks = pgTable('user_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockerId: text('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: text('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Mute Motive invites from specific users
export const inviteMutes = pgTable('invite_mutes', {
  id: uuid('id').primaryKey().defaultRandom(),
  muterId: text('muter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mutedId: text('muted_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
