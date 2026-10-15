CREATE TABLE IF NOT EXISTS chat_threads (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,id)
);
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  notify_media INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE chat_messages ADD COLUMN thread_id TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX IF NOT EXISTS chat_messages_thread ON chat_messages(user_id,thread_id,id);
ALTER TABLE media_jobs ADD COLUMN prompt TEXT;
ALTER TABLE media_jobs ADD COLUMN quality TEXT;
ALTER TABLE media_jobs ADD COLUMN ratio TEXT;
ALTER TABLE media_jobs ADD COLUMN duration INTEGER;
ALTER TABLE media_jobs ADD COLUMN region_json TEXT;
ALTER TABLE media_jobs ADD COLUMN notify_sent INTEGER NOT NULL DEFAULT 0;
