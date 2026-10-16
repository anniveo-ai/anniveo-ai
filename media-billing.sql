-- Each generation has at most one reservation. Refund releases it, never adds credit.
CREATE TABLE IF NOT EXISTS media_job_charges (
 job_id TEXT PRIMARY KEY REFERENCES media_jobs(id),user_id TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>0 AND amount<=1000000),
 state TEXT NOT NULL CHECK(state IN ('reserved','charged','refunded')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS media_job_charges_user ON media_job_charges(user_id,state);
