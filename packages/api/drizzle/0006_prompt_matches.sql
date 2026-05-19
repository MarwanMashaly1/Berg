CREATE TABLE "prompt_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "prompt_id" uuid NOT NULL REFERENCES "daily_prompts"("id"),
  "option_key" text NOT NULL,
  "user_a_id" text NOT NULL REFERENCES "users"("id"),
  "user_b_id" text NOT NULL REFERENCES "users"("id"),
  "status" text NOT NULL DEFAULT 'pending',
  "motive_id" uuid REFERENCES "motives"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  CONSTRAINT "user_a_lt_user_b" CHECK ("user_a_id" < "user_b_id"),
  CONSTRAINT "prompt_matches_unique" UNIQUE ("prompt_id", "option_key", "user_a_id", "user_b_id")
);
