ALTER TABLE media_jobs ADD COLUMN group_id TEXT;
CREATE INDEX IF NOT EXISTS media_jobs_group ON media_jobs(user_id,group_id,created_at);
