import { pgTable, text, timestamp, uuid, boolean, integer, smallint, decimal, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { dailyPrompts } from './prompts';

export const motives = pgTable('motives', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: text('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  scheduledAt: timestamp('scheduled_at'),
  venuePlaceId: text('venue_place_id'),
  venueName: text('venue_name'),
  status: text('status').notNull().default('open'),  // open | locked | completed | cancelled | unconfirmed
  isJourney: boolean('is_journey').notNull().default(false),
  journeyType: text('journey_type'),                 // free_roam | day_out | itinerary
  journeyStartedAt: timestamp('journey_started_at'),
  journeyEndedAt: timestamp('journey_ended_at'),
  originPromptId: uuid('origin_prompt_id').references(() => dailyPrompts.id),
  collisionStatus: text('collision_status').notNull().default('none'),  // none | pending | resolved
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // Extended location & metadata fields
  placeAddress: text('place_address'),
  lat: decimal('lat', { precision: 10, scale: 7 }),
  lng: decimal('lng', { precision: 10, scale: 7 }),
  note: text('note'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const motiveAttendees = pgTable('motive_attendees', {
  // Keep id for rows that already exist in the DB; new rows also get one for FK references
  id: uuid('id').defaultRandom(),
  motiveId: uuid('motive_id').notNull().references(() => motives.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('attendee'),  // organiser | co_organiser | attendee
  rsvpStatus: text('rsvp_status').notNull().default('invited'),  // invited | going | maybe | declined
  respondedAt: timestamp('responded_at'),
  rsvpAt: timestamp('rsvp_at'),        // keep for existing rows
  createdAt: timestamp('created_at').defaultNow(),
  heldByCollisionId: uuid('held_by_collision_id').references((): any => motiveCollisions.id),
}, (t) => [primaryKey({ columns: [t.motiveId, t.userId] })]);

// Journey stops
export const motiveStops = pgTable('motive_stops', {
  id: uuid('id').primaryKey().defaultRandom(),
  motiveId: uuid('motive_id').notNull().references(() => motives.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  category: text('category').notNull(),
  venuePlaceId: text('venue_place_id'),
  venueName: text('venue_name'),
  scheduledAt: timestamp('scheduled_at'),
  timeOfDay: text('time_of_day'),  // morning | afternoon | evening
  notes: text('notes'),
  status: text('status').notNull().default('planned'),  // planned | current | completed | skipped
  checkedInAt: timestamp('checked_in_at'),
  completedAt: timestamp('completed_at'),
  isPartnerVenue: boolean('is_partner_venue').notNull().default(false),
});

// Manual check-ins at journey stops (no GPS)
export const stopCheckins = pgTable('stop_checkins', {
  stopId: uuid('stop_id').notNull().references(() => motiveStops.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  checkedInAt: timestamp('checked_in_at').notNull().defaultNow(),
});

// Motive collision detection and resolution
export const motiveCollisions = pgTable('motive_collisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  motiveAId: uuid('motive_a_id').notNull().references(() => motives.id),
  motiveBId: uuid('motive_b_id').notNull().references(() => motives.id),
  promptId: uuid('prompt_id').references(() => dailyPrompts.id),
  overlappingUserIds: text('overlapping_user_ids').array(),
  status: text('status').notNull().default('pending'),  // pending | resolved_merged | resolved_separate | resolved_one_joined | expired
  creatorAChoice: text('creator_a_choice'),  // combine | join_other | keep_separate
  creatorBChoice: text('creator_b_choice'),
  survivingMotiveId: uuid('surviving_motive_id').references(() => motives.id),
  holdExpiresAt: timestamp('hold_expires_at').notNull(),
  detectedAt: timestamp('detected_at').notNull().defaultNow(),
});

// Partner venue placements (promoted venues in motive creation)
export const venuePlacements = pgTable('venue_placements', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessName: text('business_name').notNull(),
  placeId: text('place_id').notNull(),
  category: text('category').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  minRating: decimal('min_rating', { precision: 3, scale: 1 }).notNull().default('4.0'),  // >= 4.0 enforced
  baseDealDescription: text('base_deal_description'),
  groupDealDescription: text('group_deal_description'),
  minGroupSize: integer('min_group_size'),
  priorityScore: integer('priority_score').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Post-visit venue ratings
export const postVisitRatings = pgTable('post_visit_ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  motiveId: uuid('motive_id').notNull().references(() => motives.id, { onDelete: 'cascade' }),
  stopId: uuid('stop_id').references(() => motiveStops.id),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  venuePlaceId: text('venue_place_id').notNull(),
  rating: smallint('rating').notNull(),  // 1 | 2 | 3
  consentedToGoogleCrossPost: boolean('consented_to_google_cross_post').notNull().default(false),
  googleReviewPosted: boolean('google_review_posted').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Motive vibe tags (post-motive collective tagging)
export const motiveVibeTags = pgTable('motive_vibe_tags', {
  motiveId: uuid('motive_id').notNull().references(() => motives.id, { onDelete: 'cascade' }),
  stopId: uuid('stop_id').references(() => motiveStops.id),
  tag: text('tag').notNull(),
  count: integer('count').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.motiveId, t.tag] })]);

// Post-motive memory (per-user recap with vibe tags, ratings, photos)
export const motiveMemories = pgTable('motive_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  motiveId: uuid('motive_id').notNull().references(() => motives.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  vibeTags: text('vibe_tags').array().notNull().default([]),
  rating: integer('rating'),            // 1–5
  venueRating: integer('venue_rating'), // 1–5, nullable
  storagePaths: text('storage_paths').array().notNull().default([]),  // permanent bucket paths
  photoUrls: text('photo_urls').array().notNull().default([]),        // legacy / signed URLs cache
  cardUrl: text('card_url'),            // generated card PNG URL
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
