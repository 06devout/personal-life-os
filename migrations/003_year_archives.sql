CREATE TABLE IF NOT EXISTS year_archives (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  cutoff TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL,
  UNIQUE(year, revision)
);
CREATE INDEX IF NOT EXISTS year_archives_year ON year_archives(year, revision);
INSERT OR IGNORE INTO schema_migrations VALUES (3, datetime('now'));
