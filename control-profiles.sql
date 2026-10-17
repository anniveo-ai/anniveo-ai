-- Profile cache only. Existing users, history, wallet and owner binding are preserved.
CREATE TABLE IF NOT EXISTS control_profile_cache(
 user_id TEXT PRIMARY KEY REFERENCES control_users(user_id),
 checked_at INTEGER NOT NULL,next_check_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'unavailable',mime TEXT,data BLOB
);
