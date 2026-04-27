import { pgTable, text, timestamp, uuid, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { motives } from './motives';
import { groupCircles } from './social';

export const chats = pgTable('chats', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),  // motive_thread | group
  motiveId: uuid('motive_id').references(() => motives.id, { onDelete: 'set null' }),
  groupCircleId: uuid('group_circle_id').references(() => groupCircles.id, { onDelete: 'set null' }),
  name: text('name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const chatMembers = pgTable('chat_members', {
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  lastReadAt: timestamp('last_read_at'),
}, (t) => [primaryKey({ columns: [t.chatId, t.userId] })]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  type: text('type').notNull().default('text'),  // text | prompt_bubble | poll | system
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const memoryCards = pgTable('memory_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  motiveId: uuid('motive_id').notNull().references(() => motives.id, { onDelete: 'cascade' }),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  coverPhotoUrl: text('cover_photo_url'),
  vibeTags: text('vibe_tags').array(),
  promptQuestion: text('prompt_question'),
  promptAnswer: text('prompt_answer'),
  attendeeIds: text('attendee_ids').array(),
  format: text('format').notNull().default('single'),  // single | chapter | timeline
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const memoryPhotos = pgTable('memory_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  motiveId: uuid('motive_id').notNull().references(() => motives.id, { onDelete: 'cascade' }),
  stopId: uuid('stop_id'),  // nullable
  uploadedBy: text('uploaded_by').notNull().references(() => users.id),
  photoUrl: text('photo_url').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const memoryResurfacingQueue = pgTable('memory_resurfacing_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  motiveId: uuid('motive_id').notNull().references(() => motives.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scheduledAt: timestamp('scheduled_at').notNull(),  // motive_date + 14 days
  sentAt: timestamp('sent_at'),
  status: text('status').notNull().default('pending'),  // pending | sent | cancelled
});
