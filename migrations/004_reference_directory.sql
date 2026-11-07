CREATE TABLE IF NOT EXISTS reference_directory (
  kind TEXT NOT NULL CHECK(kind IN ('airport', 'airline')),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL CHECK(json_valid(aliases)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(kind, code)
);
INSERT OR IGNORE INTO schema_migrations VALUES (4, datetime('now'));
