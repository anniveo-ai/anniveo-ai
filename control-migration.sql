-- Additive owner dashboard. Existing conversations, jobs and payment ledgers stay intact.
CREATE TABLE IF NOT EXISTS control_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO control_settings VALUES('owner_username','ismailchiik');
INSERT OR IGNORE INTO control_settings VALUES('timezone','Europe/Saratov');
INSERT OR IGNORE INTO control_settings VALUES('tracking_since',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE IF NOT EXISTS control_users(
 user_id TEXT PRIMARY KEY,first_name TEXT NOT NULL DEFAULT '',last_name TEXT NOT NULL DEFAULT '',
 username TEXT NOT NULL DEFAULT '',photo_url TEXT NOT NULL DEFAULT '',
 first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS control_users_seen ON control_users(last_seen);
CREATE TABLE IF NOT EXISTS control_sessions(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,started_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,
 active_seconds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS control_sessions_user ON control_sessions(user_id,started_at);
CREATE TABLE IF NOT EXISTS control_activity(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'event',
 object_id TEXT,title TEXT NOT NULL DEFAULT '',detail TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'completed',
 model TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,finished_at TEXT,latency_ms INTEGER,
 private INTEGER NOT NULL DEFAULT 0,error TEXT
);
CREATE INDEX IF NOT EXISTS control_activity_date ON control_activity(created_at,kind);
CREATE INDEX IF NOT EXISTS control_activity_ref ON control_activity(source,object_id,user_id);
CREATE TABLE IF NOT EXISTS control_media(
 job_id TEXT PRIMARY KEY REFERENCES media_jobs(id),estimated_rub REAL,tariff TEXT,source_type TEXT,
 started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,finished_at TEXT,provider_error TEXT
);
CREATE TABLE IF NOT EXISTS control_trash(record_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS control_audit(
 id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS control_audit_date ON control_audit(created_at);
CREATE INDEX IF NOT EXISTS control_chat_date ON chat_messages(role,created_at,user_id);
CREATE INDEX IF NOT EXISTS control_media_date ON media_jobs(created_at,kind);
CREATE INDEX IF NOT EXISTS control_usage_date ON usage_events(created_at,kind);

INSERT OR IGNORE INTO control_users(user_id,first_seen,last_seen)
SELECT user_id,MIN(at),MAX(at) FROM (
 SELECT user_id,created_at at FROM chat_messages
 UNION ALL SELECT user_id,created_at FROM usage_events
 UNION ALL SELECT user_id,created_at FROM media_jobs
 UNION ALL SELECT user_id,datetime(paid_at,'unixepoch') FROM payment_receipts
) WHERE user_id IS NOT NULL GROUP BY user_id;

CREATE VIEW IF NOT EXISTS control_records
(id,source,object_id,user_id,kind,title,detail,status,model,quality,ratio,seconds,coins,stars,cost_rub,created_at,finished_at,latency_ms,private,error) AS
-- D1 permits at most five compound SELECT terms per level.
SELECT * FROM (
SELECT 'chat:'||c.id,'chat',CAST(c.id AS TEXT),c.user_id,COALESCE(a.kind,'chat'),c.content,r.content,'completed',a.model,
 NULL,NULL,NULL,0,0,NULL,c.created_at,a.finished_at,a.latency_ms,0,NULL
 FROM chat_messages c
 LEFT JOIN chat_messages r ON r.id=c.id+1 AND r.user_id=c.user_id AND r.thread_id=c.thread_id AND r.role='assistant'
 LEFT JOIN control_activity a ON a.source='chat' AND a.object_id=CAST(c.id AS TEXT) AND a.user_id=c.user_id
 WHERE c.role='user'
UNION ALL
SELECT 'voice:'||u.id,'voice',u.id,u.user_id,'voice',
 CASE WHEN a.private=1 THEN 'Голосовое сообщение · инкогнито' ELSE COALESCE(NULLIF(a.title,''),'Голосовое сообщение · текст раньше не сохранялся') END,
 a.detail,'completed','Whisper',NULL,NULL,NULL,0,0,NULL,u.created_at,a.finished_at,a.latency_ms,COALESCE(a.private,0),NULL
 FROM usage_events u LEFT JOIN control_activity a ON a.source='voice' AND a.object_id=u.id AND a.user_id=u.user_id WHERE u.kind='voice'
UNION ALL
SELECT 'media:'||j.id,'media',j.id,j.user_id,j.kind,COALESCE(j.prompt,''),NULL,j.status,j.model,j.quality,j.ratio,j.duration,
 COALESCE(b.amount,0),0,m.estimated_rub,j.created_at,m.finished_at,
 CASE WHEN m.finished_at IS NOT NULL THEN MAX(0,CAST((julianday(m.finished_at)-julianday(m.started_at))*86400000 AS INTEGER)) END,0,COALESCE(m.provider_error,j.error)
 FROM media_jobs j LEFT JOIN media_job_charges b ON b.job_id=j.id AND b.user_id=j.user_id LEFT JOIN control_media m ON m.job_id=j.id
UNION ALL
SELECT 'usage:'||u.id,'legacy',u.id,u.user_id,u.kind,'Ранняя генерация · запрос не сохранялся',NULL,'completed',NULL,NULL,NULL,NULL,0,0,NULL,u.created_at,NULL,NULL,0,NULL
 FROM usage_events u WHERE u.kind IN ('image','video') AND NOT EXISTS(SELECT 1 FROM media_jobs j WHERE u.id='media:'||j.id AND u.user_id=j.user_id)
UNION ALL
SELECT 'payment:'||p.charge_id,'payment',p.charge_id,p.user_id,'payment','Пополнение баланса','Покупка аниумов за Telegram Stars',
 CASE WHEN COALESCE(p.refunded_at,f.refunded_at) IS NULL THEN 'paid' ELSE 'refunded' END,
 NULL,NULL,NULL,NULL,p.coins,p.stars,NULL,datetime(p.paid_at,'unixepoch'),NULL,NULL,0,NULL
 FROM payment_receipts p LEFT JOIN payment_refunds f ON f.charge_id=p.charge_id AND f.order_id=p.order_id
)
UNION ALL
SELECT 'event:'||a.id,'event',a.id,a.user_id,a.kind,
 CASE WHEN a.private=1 THEN 'Обращение в режиме инкогнито' ELSE a.title END,
 CASE WHEN a.private=1 THEN '' ELSE a.detail END,a.status,a.model,NULL,NULL,NULL,0,0,NULL,
 a.created_at,a.finished_at,a.latency_ms,a.private,a.error
 FROM control_activity a WHERE a.source='event';
