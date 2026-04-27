CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"phone_number" text,
	"phone_hash" text,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"username" text,
	"bio" text,
	"availability_status" text DEFAULT 'down_to_hang' NOT NULL,
	"onboarding_step" text DEFAULT '0' NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"onboarding_completed_at" timestamp,
	"contact_sync_granted" boolean,
	"activated_at" timestamp,
	"first_motive_at" timestamp,
	"last_active_tab" text DEFAULT 'discovery' NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_hash_unique" UNIQUE("phone_hash"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pending_phone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"phone_number" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pending_phone_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"friend_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fof_suggestions" (
	"user_id" text NOT NULL,
	"suggested_user_id" text NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"mutual_friend_ids" text[],
	"shared_tag_count" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fof_suggestions_user_id_suggested_user_id_pk" PRIMARY KEY("user_id","suggested_user_id")
);
--> statement-breakpoint
CREATE TABLE "group_circle_members" (
	"group_circle_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"invited_by" text,
	CONSTRAINT "group_circle_members_group_circle_id_user_id_pk" PRIMARY KEY("group_circle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "group_circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"admin_user_id" text NOT NULL,
	"join_code" text NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"max_members" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_circles_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "invite_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"signup_count" integer DEFAULT 0 NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_links_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "invite_mutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muter_id" text NOT NULL,
	"muted_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_cooling_scores" (
	"user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "social_cooling_scores_user_id_target_user_id_pk" PRIMARY KEY("user_id","target_user_id")
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"category" text NOT NULL,
	"active_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_prompts_active_date_unique" UNIQUE("active_date")
);
--> statement-breakpoint
CREATE TABLE "prompt_response_notifications" (
	"user_id" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"notifications_sent" smallint DEFAULT 0 NOT NULL,
	"first_match_notified_at" timestamp,
	"threshold_notified_at" timestamp,
	"opted_in" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "prompt_response_notifications_user_id_prompt_id_pk" PRIMARY KEY("user_id","prompt_id")
);
--> statement-breakpoint
CREATE TABLE "prompt_responses" (
	"user_id" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"response_text" text NOT NULL,
	"responded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_responses_user_id_prompt_id_pk" PRIMARY KEY("user_id","prompt_id")
);
--> statement-breakpoint
CREATE TABLE "user_vibe_tags" (
	"user_id" text NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "user_vibe_tags_user_id_tag_id_pk" PRIMARY KEY("user_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "vibe_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"emoji" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motive_attendees" (
	"motive_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'attendee' NOT NULL,
	"rsvp_status" text DEFAULT 'invited' NOT NULL,
	"responded_at" timestamp,
	"held_by_collision_id" uuid
);
--> statement-breakpoint
CREATE TABLE "motive_collisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motive_a_id" uuid NOT NULL,
	"motive_b_id" uuid NOT NULL,
	"prompt_id" uuid,
	"overlapping_user_ids" text[],
	"status" text DEFAULT 'pending' NOT NULL,
	"creator_a_choice" text,
	"creator_b_choice" text,
	"surviving_motive_id" uuid,
	"hold_expires_at" timestamp NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motive_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motive_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"category" text NOT NULL,
	"venue_place_id" text,
	"venue_name" text,
	"scheduled_at" timestamp,
	"time_of_day" text,
	"notes" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"checked_in_at" timestamp,
	"completed_at" timestamp,
	"is_partner_venue" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motive_vibe_tags" (
	"motive_id" uuid NOT NULL,
	"stop_id" uuid,
	"tag" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "motive_vibe_tags_motive_id_tag_pk" PRIMARY KEY("motive_id","tag")
);
--> statement-breakpoint
CREATE TABLE "motives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"scheduled_at" timestamp NOT NULL,
	"venue_place_id" text,
	"venue_name" text,
	"status" text DEFAULT 'open' NOT NULL,
	"is_journey" boolean DEFAULT false NOT NULL,
	"journey_type" text,
	"journey_started_at" timestamp,
	"journey_ended_at" timestamp,
	"origin_prompt_id" uuid,
	"collision_status" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_visit_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motive_id" uuid NOT NULL,
	"stop_id" uuid,
	"user_id" text NOT NULL,
	"venue_place_id" text NOT NULL,
	"rating" smallint NOT NULL,
	"consented_to_google_cross_post" boolean DEFAULT false NOT NULL,
	"google_review_posted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stop_checkins" (
	"stop_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"checked_in_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text NOT NULL,
	"place_id" text NOT NULL,
	"category" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"min_rating" numeric(3, 1) DEFAULT '4.0' NOT NULL,
	"base_deal_description" text,
	"group_deal_description" text,
	"min_group_size" integer,
	"priority_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_members" (
	"chat_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"last_read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"motive_id" uuid,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motive_id" uuid NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"cover_photo_url" text,
	"vibe_tags" text[],
	"prompt_question" text,
	"prompt_answer" text,
	"attendee_ids" text[],
	"format" text DEFAULT 'single' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motive_id" uuid NOT NULL,
	"stop_id" uuid,
	"uploaded_by" text NOT NULL,
	"photo_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_resurfacing_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motive_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"sent_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"content" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" text NOT NULL,
	"content_type" text NOT NULL,
	"content_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"actioned_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_review_analytics" (
	"place_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"impression_count" integer DEFAULT 0 NOT NULL,
	"selection_count" integer DEFAULT 0 NOT NULL,
	"avg_rating" numeric(4, 2),
	"vibe_tag_distribution" text,
	"avg_group_size" numeric(5, 2),
	"group_deal_conversions" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "partner_review_analytics_place_id_period_start_pk" PRIMARY KEY("place_id","period_start")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fof_suggestions" ADD CONSTRAINT "fof_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fof_suggestions" ADD CONSTRAINT "fof_suggestions_suggested_user_id_users_id_fk" FOREIGN KEY ("suggested_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_circle_members" ADD CONSTRAINT "group_circle_members_group_circle_id_group_circles_id_fk" FOREIGN KEY ("group_circle_id") REFERENCES "public"."group_circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_circle_members" ADD CONSTRAINT "group_circle_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_circle_members" ADD CONSTRAINT "group_circle_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_circles" ADD CONSTRAINT "group_circles_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_mutes" ADD CONSTRAINT "invite_mutes_muter_id_users_id_fk" FOREIGN KEY ("muter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_mutes" ADD CONSTRAINT "invite_mutes_muted_id_users_id_fk" FOREIGN KEY ("muted_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_cooling_scores" ADD CONSTRAINT "social_cooling_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_cooling_scores" ADD CONSTRAINT "social_cooling_scores_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_response_notifications" ADD CONSTRAINT "prompt_response_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_response_notifications" ADD CONSTRAINT "prompt_response_notifications_prompt_id_daily_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."daily_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_responses" ADD CONSTRAINT "prompt_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_responses" ADD CONSTRAINT "prompt_responses_prompt_id_daily_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."daily_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_vibe_tags" ADD CONSTRAINT "user_vibe_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_vibe_tags" ADD CONSTRAINT "user_vibe_tags_tag_id_vibe_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."vibe_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motive_attendees" ADD CONSTRAINT "motive_attendees_motive_id_motives_id_fk" FOREIGN KEY ("motive_id") REFERENCES "public"."motives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motive_attendees" ADD CONSTRAINT "motive_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motive_attendees" ADD CONSTRAINT "motive_attendees_held_by_collision_id_motive_collisions_id_fk" FOREIGN KEY ("held_by_collision_id") REFERENCES "public"."motive_collisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motive_collisions" ADD CONSTRAINT "motive_collisions_motive_a_id_motives_id_fk" FOREIGN KEY ("motive_a_id") REFERENCES "public"."motives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motive_collisions" ADD CONSTRAINT "motive_collisions_motive_b_id_motives_id_fk" FOREIGN KEY ("motive_b_id") REFERENCES "public"."motives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motive_collisions" ADD CONSTRAINT "motive_collisions_prompt_id_daily_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."daily_prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motive_collisions" ADD CONSTRAINT "motive_collisions_surviving_motive_id_motives_id_fk" FOREIGN KEY ("surviving_motive_id") REFERENCES "public"."motives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motive_stops" ADD CONSTRAINT "motive_stops_motive_id_motives_id_fk" FOREIGN KEY ("motive_id") REFERENCES "public"."motives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motive_vibe_tags" ADD CONSTRAINT "motive_vibe_tags_motive_id_motives_id_fk" FOREIGN KEY ("motive_id") REFERENCES "public"."motives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motive_vibe_tags" ADD CONSTRAINT "motive_vibe_tags_stop_id_motive_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."motive_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motives" ADD CONSTRAINT "motives_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motives" ADD CONSTRAINT "motives_origin_prompt_id_daily_prompts_id_fk" FOREIGN KEY ("origin_prompt_id") REFERENCES "public"."daily_prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_visit_ratings" ADD CONSTRAINT "post_visit_ratings_motive_id_motives_id_fk" FOREIGN KEY ("motive_id") REFERENCES "public"."motives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_visit_ratings" ADD CONSTRAINT "post_visit_ratings_stop_id_motive_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."motive_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_visit_ratings" ADD CONSTRAINT "post_visit_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_checkins" ADD CONSTRAINT "stop_checkins_stop_id_motive_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."motive_stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_checkins" ADD CONSTRAINT "stop_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_motive_id_motives_id_fk" FOREIGN KEY ("motive_id") REFERENCES "public"."motives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_cards" ADD CONSTRAINT "memory_cards_motive_id_motives_id_fk" FOREIGN KEY ("motive_id") REFERENCES "public"."motives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_photos" ADD CONSTRAINT "memory_photos_motive_id_motives_id_fk" FOREIGN KEY ("motive_id") REFERENCES "public"."motives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_photos" ADD CONSTRAINT "memory_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_resurfacing_queue" ADD CONSTRAINT "memory_resurfacing_queue_motive_id_motives_id_fk" FOREIGN KEY ("motive_id") REFERENCES "public"."motives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_resurfacing_queue" ADD CONSTRAINT "memory_resurfacing_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_log" ADD CONSTRAINT "moderation_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;