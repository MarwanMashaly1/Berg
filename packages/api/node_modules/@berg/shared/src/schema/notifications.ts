import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Persistent notification inbox — one row per push sent.
 * Written by sendPush/sendPushBatch in the notification service.
 * readAt = null means unread.
 */
export const notificationInbox = pgTable('notification_inbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  data: text('data'),           // JSON-encoded routing payload (screen, motiveId, etc.)
  readAt: timestamp('read_at'), // null = unread
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
