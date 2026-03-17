-- Remove DVWDesign-specific CHECK constraint from doc_relationships (SCHM-05)
-- The CHECK on relationship_type limits to 8 hard-coded values including
-- 'dispatched_to' which is DVWDesign-specific. Removing the CHECK makes
-- relationship_type accept any TEXT value (portable, extensible).
--
-- Implementation: 12-step table rebuild (SQLite cannot DROP CONSTRAINT).
-- doc_relationships currently has 0 rows — zero-risk rebuild.
-- PRAGMA foreign_keys statements omitted: migrate.mjs sets foreign_keys=ON
-- at startup; with 0 rows, no FK checks fire during INSERT INTO ... SELECT *.

-- Drop dependent view before table rebuild; recreate afterward
DROP VIEW IF EXISTS document_graph;

CREATE TABLE doc_relationships_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_doc_id INTEGER NOT NULL,
  target_doc_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_doc_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (target_doc_id) REFERENCES documents(id) ON DELETE CASCADE
);

INSERT INTO doc_relationships_new SELECT * FROM doc_relationships;

DROP TABLE doc_relationships;

ALTER TABLE doc_relationships_new RENAME TO doc_relationships;

CREATE INDEX IF NOT EXISTS idx_rel_source ON doc_relationships(source_doc_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON doc_relationships(target_doc_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON doc_relationships(relationship_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_unique
  ON doc_relationships(source_doc_id, target_doc_id, relationship_type);

-- Recreate the document_graph view (was dropped above)
CREATE VIEW IF NOT EXISTS document_graph AS
SELECT
  dr.id as edge_id,
  dr.relationship_type,
  dr.weight,
  s.path as source_path,
  s.repository as source_repo,
  s.filename as source_name,
  t.path as target_path,
  t.repository as target_repo,
  t.filename as target_name
FROM doc_relationships dr
JOIN documents s ON dr.source_doc_id = s.id
JOIN documents t ON dr.target_doc_id = t.id;
