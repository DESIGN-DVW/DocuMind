-- Migration 008: action_log table for dashboard audit trail
-- Tracks user and agent actions on obsolescence signals and diagrams.
-- Applied by server.mjs at startup via CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS action_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  action       TEXT    NOT NULL,  -- 'archive' | 'dismiss' | 'delete' | 'curate'
  target_id    INTEGER,           -- signal id or diagram id
  target_path  TEXT,              -- document file path
  target_repo  TEXT,              -- repository name
  actor        TEXT    DEFAULT 'user',  -- 'user' or agent identifier (future auth)
  performed_at TEXT    NOT NULL   -- ISO-8601 timestamp
);
