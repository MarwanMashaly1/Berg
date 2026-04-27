import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Phone collection before BetterAuth auth (15-min TTL, deleted on auth success)
export const pendingPhone = pgTable('pending_phone', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().unique(),
  phoneNumber: text('phone_number').notNull(),  // Plaintext, short-lived
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
