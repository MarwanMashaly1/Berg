import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

// BetterAuth core table: users (extended with Icebreaker fields)
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Icebreaker-specific fields
  phoneNumber: text('phone_number'),           // AES-256-GCM encrypted
  phoneHash: text('phone_hash').unique(),      // SHA-256(E.164 + SERVER_PEPPER)
  phoneVerified: boolean('phone_verified').notNull().default(false),
  displayName: text('display_name'),
  username: text('username').unique(),
  bio: text('bio'),
  availabilityStatus: text('availability_status').notNull().default('down_to_hang'),
  onboardingStep: text('onboarding_step').notNull().default('0'),  // Use text for portability
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  onboardingCompletedAt: timestamp('onboarding_completed_at'),
  contactSyncGranted: boolean('contact_sync_granted'),
  activatedAt: timestamp('activated_at'),
  firstMotiveAt: timestamp('first_motive_at'),
  lastActiveTab: text('last_active_tab').notNull().default('discovery'),
  notifyPromptMatches: boolean('notify_prompt_matches').notNull().default(true),
  notifyCircleRequests: boolean('notify_circle_requests').notNull().default(true),
  notifyMotiveInvites: boolean('notify_motive_invites').notNull().default(false),
  showInDiscovery: boolean('show_in_discovery').notNull().default(true),
  expoPushToken: text('expo_push_token'),  // set after permission granted on device
  deletedAt: timestamp('deleted_at'),      // soft-delete: set on account deletion
});

// BetterAuth core table: sessions
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

// BetterAuth core table: accounts (OAuth providers)
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),    // Provider's user ID (e.g., Google sub)
  providerId: text('provider_id').notNull(),  // "google", "credential", etc.
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// BetterAuth core table: verifications (magic links, email verification)
export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
