CREATE TABLE IF NOT EXISTS media_jobs (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL,model TEXT NOT NULL,
 provider_id TEXT,status TEXT NOT NULL,result_url TEXT,error TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS media_jobs_user_created ON media_jobs(user_id,created_at);
