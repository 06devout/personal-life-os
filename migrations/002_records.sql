PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS daily_entries (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  trip_id TEXT REFERENCES trips(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_activities_category_id ON activities(category_id);
CREATE INDEX IF NOT EXISTS idx_activities_trip_id ON activities(trip_id);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  account_id TEXT REFERENCES loyalty_accounts(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_challenges_account_id ON challenges(account_id);
CREATE TABLE IF NOT EXISTS challenge_progress (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  challenge_id TEXT REFERENCES challenges(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_challenge_progress_challenge_id ON challenge_progress(challenge_id);
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS loyalty_rules (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  account_id TEXT REFERENCES loyalty_accounts(id) ON DELETE RESTRICT,
  challenge_id TEXT REFERENCES challenges(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_loyalty_rules_account_id ON loyalty_rules(account_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rules_challenge_id ON loyalty_rules(challenge_id);
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  account_id TEXT REFERENCES loyalty_accounts(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_account_id ON loyalty_transactions(account_id);
CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS flights (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  trip_id TEXT REFERENCES trips(id) ON DELETE RESTRICT,
  account_id TEXT REFERENCES loyalty_accounts(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_flights_trip_id ON flights(trip_id);
CREATE INDEX IF NOT EXISTS idx_flights_account_id ON flights(account_id);
CREATE TABLE IF NOT EXISTS hotel_stays (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  trip_id TEXT REFERENCES trips(id) ON DELETE RESTRICT,
  account_id TEXT REFERENCES loyalty_accounts(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_hotel_stays_trip_id ON hotel_stays(trip_id);
CREATE INDEX IF NOT EXISTS idx_hotel_stays_account_id ON hotel_stays(account_id);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  document_id TEXT REFERENCES documents(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_reminders_document_id ON reminders(document_id);
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_migrations VALUES (2, datetime('now'));
