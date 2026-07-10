-- Migration 006: Add obsolescence_signals table
-- Stores per-document heuristic scores for the obsolete docs dashboard.
-- confidence_score: 0.0–1.0 weighted combination of four signals
-- flag_label: one of 'obsolete', 'redundant', 'stale', 'needs-update'
-- dismissed_until: ISO8601 expiry; NULL means not dismissed
-- ON DELETE CASCADE: signal is removed when document is removed from index

CREATE TABLE IF NOT EXISTS obsolescence_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL UNIQUE,
  confidence_score REAL NOT NULL CHECK (confidence_score BETWEEN 0.0 AND 1.0),
  flag_label TEXT NOT NULL CHECK (flag_label IN ('obsolete', 'redundant', 'stale', 'needs-update')),
  age_days INTEGER NOT NULL,
  inbound_link_count INTEGER NOT NULL DEFAULT 0,
  keyword_matched INTEGER NOT NULL DEFAULT 0 CHECK (keyword_matched IN (0, 1)),
  similarity_score REAL CHECK (similarity_score BETWEEN 0.0 AND 1.0),
  detected_at TEXT NOT NULL,
  dismissed_until TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_obs_confidence ON obsolescence_signals(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_obs_flag ON obsolescence_signals(flag_label);
CREATE INDEX IF NOT EXISTS idx_obs_dismissed ON obsolescence_signals(dismissed_until);
CREATE INDEX IF NOT EXISTS idx_obs_doc ON obsolescence_signals(document_id);
