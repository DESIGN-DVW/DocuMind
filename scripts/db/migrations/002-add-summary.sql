-- Add summary column to documents table
-- Nullable TEXT — safe ALTER TABLE ADD COLUMN in SQLite
-- Existing rows (8K+) receive NULL; backfill happens in Plan 03
ALTER TABLE documents ADD COLUMN summary TEXT;
