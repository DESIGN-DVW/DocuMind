ALTER TABLE obsolescence_signals ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS idx_obs_archived ON obsolescence_signals(archived_at);
