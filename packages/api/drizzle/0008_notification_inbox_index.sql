-- Partial index for unread-count queries: covers WHERE user_id = ? AND read_at IS NULL
-- Without this, COUNT(*) on a large notification_inbox does a full table scan.
-- Apply manually in Supabase SQL editor.

CREATE INDEX IF NOT EXISTS idx_notif_inbox_user_unread
  ON notification_inbox(user_id, read_at)
  WHERE read_at IS NULL;

-- Also useful for full notification list queries per user
CREATE INDEX IF NOT EXISTS idx_notif_inbox_user_created
  ON notification_inbox(user_id, created_at DESC);
