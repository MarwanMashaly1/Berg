import { pgTable, text, timestamp, uuid, integer, decimal, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const contentReports = pgTable('content_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: text('reporter_id').notNull().references(() => users.id),
  contentType: text('content_type').notNull(),  // message | profile | photo | motive
  contentId: uuid('content_id').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('pending'),  // pending | reviewed | actioned
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Append-only moderation log
export const moderationLog = pgTable('moderation_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id),
  action: text('action').notNull(),  // warning | suspension | ban
  reason: text('reason').notNull(),
  actionedBy: text('actioned_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Aggregated venue review analytics (no individual user data)
export const partnerReviewAnalytics = pgTable('partner_review_analytics', {
  placeId: text('place_id').notNull(),
  periodStart: timestamp('period_start').notNull(),
  impressionCount: integer('impression_count').notNull().default(0),
  selectionCount: integer('selection_count').notNull().default(0),
  avgRating: decimal('avg_rating', { precision: 4, scale: 2 }),
  vibeTagDistribution: text('vibe_tag_distribution'),  // JSON stored as text
  avgGroupSize: decimal('avg_group_size', { precision: 5, scale: 2 }),
  groupDealConversions: integer('group_deal_conversions').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.placeId, t.periodStart] })]);
