-- Create document_tags table for tag extraction (SCHM-04)
-- Stores tags with source (extracted/manual/inferred) and confidence scores
-- Includes FTS5 virtual table and sync triggers for tag search
CREATE TABLE IF NOT EXISTS document_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('extracted', 'manual', 'inferred')),
  confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0.0 AND 1.0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT unique_doc_tag UNIQUE (document_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_doc_tags_document ON document_tags(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_tags_tag ON document_tags(tag);
CREATE INDEX IF NOT EXISTS idx_doc_tags_confidence ON document_tags(confidence DESC);

-- FTS5 virtual table for tag search
CREATE VIRTUAL TABLE IF NOT EXISTS document_tags_fts USING fts5(
  tag,
  content='document_tags',
  content_rowid='id'
);

-- Sync triggers to keep FTS index in sync with document_tags
CREATE TRIGGER IF NOT EXISTS doc_tags_ai AFTER INSERT ON document_tags BEGIN
  INSERT INTO document_tags_fts(rowid, tag) VALUES (new.id, new.tag);
END;

CREATE TRIGGER IF NOT EXISTS doc_tags_ad AFTER DELETE ON document_tags BEGIN
  INSERT INTO document_tags_fts(document_tags_fts, rowid, tag)
  VALUES('delete', old.id, old.tag);
END;

CREATE TRIGGER IF NOT EXISTS doc_tags_au AFTER UPDATE ON document_tags BEGIN
  INSERT INTO document_tags_fts(document_tags_fts, rowid, tag)
  VALUES('delete', old.id, old.tag);
  INSERT INTO document_tags_fts(rowid, tag) VALUES (new.id, new.tag);
END;
