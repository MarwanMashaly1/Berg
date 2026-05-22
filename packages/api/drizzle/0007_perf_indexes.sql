-- Performance indexes: cover the most frequent query patterns
-- Apply manually in Supabase SQL editor

-- Chat list (GET /api/chats — runs on every app open)
CREATE INDEX IF NOT EXISTS idx_chat_members_user_id   ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_chat_id   ON chat_members(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id       ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created  ON messages(chat_id, created_at DESC);

-- Discovery people (circles filter by user + status)
CREATE INDEX IF NOT EXISTS idx_circles_user_status    ON circles(user_id, status);
CREATE INDEX IF NOT EXISTS idx_circles_friend_id      ON circles(friend_id);

-- Profile connections + stats (group_circle_members filter by user + status)
CREATE INDEX IF NOT EXISTS idx_group_circle_members_user ON group_circle_members(user_id, status);

-- Motives
CREATE INDEX IF NOT EXISTS idx_motives_creator_id     ON motives(creator_id);
CREATE INDEX IF NOT EXISTS idx_motives_scheduled_at   ON motives(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_motive_attendees_user  ON motive_attendees(user_id);

-- Prompt responses lookup by prompt
CREATE INDEX IF NOT EXISTS idx_prompt_responses_prompt ON prompt_responses(prompt_id);
