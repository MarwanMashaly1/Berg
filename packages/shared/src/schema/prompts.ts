import { pgTable, text, timestamp, uuid, boolean, smallint, date, integer, primaryKey, check, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';

// Vibe tag definitions
export const vibeTags = pgTable('vibe_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull(),
  emoji: text('emoji').notNull(),
  category: text('category').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// User vibe tag selections (min 3 required)
export const userVibeTags = pgTable('user_vibe_tags', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => vibeTags.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.userId, t.tagId] })]);

// Daily prompts — bank of all prompts (drafts, approved, active, archived)
// status lifecycle: draft → approved → active (today's prompt) → archived
// activeDate is nullable — only set when a prompt is scheduled/active
export const dailyPrompts = pgTable('daily_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  question: text('question').notNull(),
  category: text('category').notNull(),
  // status: draft | approved | active | archived
  status: text('status').notNull().default('approved'),
  activeDate: date('active_date').unique(),  // null for unscheduled prompts
  type: text('type').notNull().default('pick_your_camp'),
  options: text('options').notNull().default('[]'),
  tags: text('tags').array().notNull().default([]),
  isUniversal: boolean('is_universal').notNull().default(true),
  // Generation metadata
  generatedBy: text('generated_by').notNull().default('manual'), // manual | llm
  qualityScore: smallint('quality_score'),    // 1-5, set by admin at review
  lastUsedAt: timestamp('last_used_at'),      // when it was last set as active
  useCount: integer('use_count').notNull().default(0),
  // true = options map to motive categories (food, outdoors, etc.) → routes match to motive creation
  // false = conversational/personality prompt → routes match to match-detail view
  motiveMappable: boolean('motive_mappable').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// User responses to daily prompts
export const promptResponses = pgTable('prompt_responses', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  promptId: uuid('prompt_id').notNull().references(() => dailyPrompts.id, { onDelete: 'cascade' }),
  responseText: text('response_text').notNull(),
  respondedAt: timestamp('responded_at').notNull().defaultNow(),
  optionKey: text('option_key'),
  optionIndex: integer('option_index'),
  storyText: text('story_text'),
}, (t) => [primaryKey({ columns: [t.userId, t.promptId] })]);

// Notification state per user per prompt
export const promptResponseNotifications = pgTable('prompt_response_notifications', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  promptId: uuid('prompt_id').notNull().references(() => dailyPrompts.id, { onDelete: 'cascade' }),
  notificationsSent: smallint('notifications_sent').notNull().default(0),
  firstMatchNotifiedAt: timestamp('first_match_notified_at'),
  thresholdNotifiedAt: timestamp('threshold_notified_at'),
  optedIn: boolean('opted_in').notNull().default(true),
  expiresAt: timestamp('expires_at').notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.promptId] })]);

// [align-2] First-class match objects — enables funnel measurement:
// prompt → answer → match → motive → hang → memory
// status: pending | viewed | acted | dismissed | expired
// user_a_id < user_b_id enforced by DB constraint to prevent duplicate (A,B)/(B,A) rows
export const promptMatches = pgTable('prompt_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptId: uuid('prompt_id').notNull().references(() => dailyPrompts.id),
  optionKey: text('option_key').notNull(),
  userAId: text('user_a_id').notNull().references(() => users.id),
  userBId: text('user_b_id').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'),
  motiveId: uuid('motive_id'),  // set when status → acted
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => [
  check('user_a_lt_user_b', sql`${t.userAId} < ${t.userBId}`),
  unique('prompt_matches_unique').on(t.promptId, t.optionKey, t.userAId, t.userBId),
]);
