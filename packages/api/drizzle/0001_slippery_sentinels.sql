ALTER TABLE "group_circles" ADD COLUMN "category_emoji" text DEFAULT '👥' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_circles" ADD COLUMN "category_color" text DEFAULT '#e8f0fe' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_prompts" ADD COLUMN "type" text DEFAULT 'pick_your_camp' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_prompts" ADD COLUMN "options" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_prompts" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_prompts" ADD COLUMN "is_universal" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_responses" ADD COLUMN "option_key" text;--> statement-breakpoint
ALTER TABLE "prompt_responses" ADD COLUMN "option_index" integer;--> statement-breakpoint
ALTER TABLE "prompt_responses" ADD COLUMN "story_text" text;