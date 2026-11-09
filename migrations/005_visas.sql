CREATE TABLE IF NOT EXISTS visas (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  passport_id TEXT REFERENCES documents(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_visas_passport_id ON visas(passport_id);
INSERT OR IGNORE INTO schema_migrations VALUES (5, datetime('now'));
