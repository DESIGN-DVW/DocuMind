-- =============================================================================
-- MIGRATION: Diagram Relinking Support
-- Version: 2.1
-- Date: 2026-03-13
-- Description: Adds curated URL tracking and repository context to diagrams
-- =============================================================================

-- Add curated URL columns
ALTER TABLE diagrams ADD COLUMN curated_url TEXT;
ALTER TABLE diagrams ADD COLUMN curated_at TEXT;
ALTER TABLE diagrams ADD COLUMN repository TEXT;

-- Index curated diagrams for fast lookup
CREATE INDEX IF NOT EXISTS idx_diagrams_curated
  ON diagrams(curated_url) WHERE curated_url IS NOT NULL;

-- Index by repository
CREATE INDEX IF NOT EXISTS idx_diagrams_repo
  ON diagrams(repository);

-- View: Diagrams awaiting curation (generated but not yet moved to central board)
DROP VIEW IF EXISTS pending_relinks;
CREATE VIEW pending_relinks AS
SELECT
  id,
  name,
  diagram_type,
  repository,
  figjam_url AS generated_url,
  curated_url,
  mermaid_path,
  generated_at
FROM diagrams
WHERE curated_url IS NULL AND figjam_url IS NOT NULL;

-- Update stale_diagrams view to include curation status
DROP VIEW IF EXISTS stale_diagrams;
CREATE VIEW stale_diagrams AS
SELECT
  dg.id,
  dg.name,
  dg.diagram_type,
  dg.mermaid_path,
  dg.figjam_url,
  dg.curated_url,
  dg.repository,
  dg.generated_at,
  CASE
    WHEN dg.curated_url IS NOT NULL THEN 'curated'
    WHEN dg.stale = 1 THEN 'stale'
    ELSE 'generated'
  END as status,
  COALESCE(d.path, fn.path) as source_path
FROM diagrams dg
LEFT JOIN documents d ON dg.document_id = d.id
LEFT JOIN folder_nodes fn ON dg.folder_node_id = fn.id
WHERE dg.stale = 1 OR dg.curated_url IS NULL;
