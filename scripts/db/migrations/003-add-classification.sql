-- Add classification column to documents table
-- Stores materialized path format: e.g., engineering/architecture/adrs
-- Nullable TEXT — safe ALTER TABLE ADD COLUMN in SQLite
ALTER TABLE documents ADD COLUMN classification TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_classification ON documents(classification);
