CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('image','video','voice')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS usage_events_user_date ON usage_events(user_id,created_at);
CREATE INDEX IF NOT EXISTS chat_messages_user_activity ON chat_messages(user_id,role,created_at);
