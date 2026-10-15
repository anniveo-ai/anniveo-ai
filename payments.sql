-- Telegram Stars top-ups. Receipts are the authoritative, idempotent coin ledger.
CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK(coins > 0),
  stars INTEGER NOT NULL CHECK(stars > 0),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  precheckout_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS payment_orders_user ON payment_orders(user_id, created_at);
CREATE TABLE IF NOT EXISTS payment_receipts (
  charge_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES payment_orders(id),
  user_id TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK(coins > 0),
  stars INTEGER NOT NULL CHECK(stars > 0),
  paid_at INTEGER NOT NULL,
  refunded_at INTEGER
);
CREATE INDEX IF NOT EXISTS payment_receipts_user ON payment_receipts(user_id, paid_at);
CREATE TABLE IF NOT EXISTS payment_refunds (
  charge_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES payment_orders(id),
  refunded_at INTEGER NOT NULL
);
