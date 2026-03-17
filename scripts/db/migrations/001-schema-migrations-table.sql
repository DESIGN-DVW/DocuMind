-- Bootstrap: create the migrations tracking table itself
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL,
  description TEXT
);
