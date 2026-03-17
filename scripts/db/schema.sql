-- DocuMind Database Schema
-- SQLite database for intelligent documentation management
-- Created: 2025-11-07
-- Schema reflects migrations through: 005-remove-check-constraints
-- To evolve this schema, add new files to scripts/db/migrations/

-- =============================================================================
-- DOCUMENTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  repository TEXT NOT NULL,
  filename TEXT NOT NULL,
  category TEXT,
  version TEXT,
  created_at TEXT,
  modified_at TEXT,
  last_scanned TEXT,
  file_size INTEGER,
  line_count INTEGER,
  word_count INTEGER,
  content_hash TEXT NOT NULL, -- SHA-256 hash for change detection
  frontmatter TEXT, -- JSON blob
  content TEXT, -- Full content for searching
  summary TEXT,          -- Generated summary (backfilled in Plan 03)
  classification TEXT,   -- Materialized path format: e.g., engineering/architecture/adrs
  CONSTRAINT chk_path CHECK (length(path) > 0),
  CONSTRAINT chk_hash CHECK (length(content_hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_documents_repo ON documents(repository);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_modified ON documents(modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_documents_repo_category ON documents(repository, category);
CREATE INDEX IF NOT EXISTS idx_documents_classification ON documents(classification);

-- =============================================================================
-- LINTING ISSUES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS linting_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  rule_code TEXT NOT NULL, -- e.g., MD040, MD013
  line_number INTEGER,
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
  message TEXT NOT NULL,
  auto_fixable BOOLEAN NOT NULL DEFAULT 0,
  fixed_at TEXT,
  fix_applied TEXT, -- Description of fix that was applied
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_linting_rule ON linting_issues(rule_code);
CREATE INDEX IF NOT EXISTS idx_linting_severity ON linting_issues(severity);
CREATE INDEX IF NOT EXISTS idx_linting_document ON linting_issues(document_id);
CREATE INDEX IF NOT EXISTS idx_linting_unfixed ON linting_issues(fixed_at) WHERE fixed_at IS NULL;

-- =============================================================================
-- CONTENT SIMILARITIES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS content_similarities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc1_id INTEGER NOT NULL,
  doc2_id INTEGER NOT NULL,
  similarity_score REAL NOT NULL CHECK (similarity_score BETWEEN 0.0 AND 1.0),
  detected_at TEXT NOT NULL,
  deviation_type TEXT CHECK (deviation_type IN ('duplicate', 'variant', 'outdated', 'partial')),
  notes TEXT,
  reviewed BOOLEAN DEFAULT 0,
  resolution TEXT, -- 'merged', 'kept_both', 'deprecated_one', etc.
  FOREIGN KEY (doc1_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (doc2_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_different_docs CHECK (doc1_id != doc2_id),
  CONSTRAINT chk_ordered_docs CHECK (doc1_id < doc2_id) -- Prevent duplicates
);

CREATE INDEX IF NOT EXISTS idx_similarities_score ON content_similarities(similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_similarities_doc1 ON content_similarities(doc1_id);
CREATE INDEX IF NOT EXISTS idx_similarities_doc2 ON content_similarities(doc2_id);
CREATE INDEX IF NOT EXISTS idx_similarities_unreviewed ON content_similarities(reviewed) WHERE reviewed = 0;

-- =============================================================================
-- DEVIATIONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS deviations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  related_doc_id INTEGER, -- Document it diverged from
  deviation_type TEXT NOT NULL CHECK (deviation_type IN (
    'content_drift', 'structure_change', 'rule_violation',
    'version_mismatch', 'metadata_inconsistency'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor', 'info')),
  description TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_action TEXT, -- 'merged', 'kept_variant', 'marked_canonical', 'deprecated'
  resolver TEXT, -- 'auto', 'user', 'ai'
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (related_doc_id) REFERENCES documents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_deviations_type ON deviations(deviation_type);
CREATE INDEX IF NOT EXISTS idx_deviations_severity ON deviations(severity);
CREATE INDEX IF NOT EXISTS idx_deviations_document ON deviations(document_id);
CREATE INDEX IF NOT EXISTS idx_deviations_unresolved ON deviations(resolved_at) WHERE resolved_at IS NULL;

-- =============================================================================
-- LEARNING PATTERNS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS learning_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_code TEXT NOT NULL,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'common_fix', 'anti_pattern', 'best_practice', 'style_guide'
  )),
  before_example TEXT NOT NULL,
  after_example TEXT,
  explanation TEXT,
  frequency INTEGER NOT NULL DEFAULT 1,
  last_seen TEXT NOT NULL,
  confidence_score REAL DEFAULT 0.5 CHECK (confidence_score BETWEEN 0.0 AND 1.0),
  CONSTRAINT unique_pattern UNIQUE (rule_code, before_example)
);

CREATE INDEX IF NOT EXISTS idx_patterns_rule ON learning_patterns(rule_code);
CREATE INDEX IF NOT EXISTS idx_patterns_frequency ON learning_patterns(frequency DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON learning_patterns(confidence_score DESC);

-- =============================================================================
-- CANONICAL DOCUMENTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS canonical_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT UNIQUE NOT NULL,
  canonical_doc_id INTEGER NOT NULL,
  reason TEXT,
  confidence_score REAL DEFAULT 0.5 CHECK (confidence_score BETWEEN 0.0 AND 1.0),
  established_at TEXT NOT NULL,
  last_verified TEXT,
  variants TEXT, -- JSON array of variant doc IDs
  manual_override BOOLEAN DEFAULT 0, -- User manually set this as canonical
  FOREIGN KEY (canonical_doc_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_subject ON canonical_docs(subject);
CREATE INDEX IF NOT EXISTS idx_canonical_doc ON canonical_docs(canonical_doc_id);
CREATE INDEX IF NOT EXISTS idx_canonical_confidence ON canonical_docs(confidence_score DESC);

-- =============================================================================
-- QUERY CACHE TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS query_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_hash TEXT UNIQUE NOT NULL,
  query_text TEXT NOT NULL,
  result TEXT NOT NULL, -- JSON result
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  hit_count INTEGER DEFAULT 0,
  last_accessed TEXT
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON query_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_hash ON query_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_cache_hits ON query_cache(hit_count DESC);

-- Clean expired cache entries
CREATE TRIGGER IF NOT EXISTS clean_expired_cache
AFTER INSERT ON query_cache
BEGIN
  DELETE FROM query_cache WHERE expires_at < datetime('now');
END;

-- =============================================================================
-- METADATA INDEX TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS metadata_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metadata_document ON metadata_index(document_id);
CREATE INDEX IF NOT EXISTS idx_metadata_key ON metadata_index(key);
CREATE INDEX IF NOT EXISTS idx_metadata_key_value ON metadata_index(key, value);

-- =============================================================================
-- SCAN HISTORY TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS scan_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_started TEXT NOT NULL,
  scan_completed TEXT,
  repositories_scanned INTEGER,
  documents_found INTEGER,
  documents_added INTEGER,
  documents_updated INTEGER,
  documents_removed INTEGER,
  duration_ms INTEGER,
  status TEXT CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_history_completed ON scan_history(scan_completed DESC);

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- View: Documents with pending issues
CREATE VIEW IF NOT EXISTS documents_with_issues AS
SELECT
  d.id,
  d.path,
  d.repository,
  d.category,
  COUNT(DISTINCT li.id) as issue_count,
  MAX(li.severity) as max_severity
FROM documents d
LEFT JOIN linting_issues li ON d.id = li.document_id AND li.fixed_at IS NULL
GROUP BY d.id;

-- View: Similar document pairs
CREATE VIEW IF NOT EXISTS similar_pairs AS
SELECT
  d1.path as doc1_path,
  d1.repository as doc1_repo,
  d2.path as doc2_path,
  d2.repository as doc2_repo,
  cs.similarity_score,
  cs.deviation_type,
  cs.reviewed
FROM content_similarities cs
JOIN documents d1 ON cs.doc1_id = d1.id
JOIN documents d2 ON cs.doc2_id = d2.id
WHERE cs.similarity_score > 0.7
ORDER BY cs.similarity_score DESC;

-- View: Canonical documents with variants
CREATE VIEW IF NOT EXISTS canonical_overview AS
SELECT
  cd.subject,
  d.path as canonical_path,
  d.repository as canonical_repo,
  cd.confidence_score,
  cd.variants,
  cd.manual_override
FROM canonical_docs cd
JOIN documents d ON cd.canonical_doc_id = d.id;

-- View: Unresolved deviations summary
CREATE VIEW IF NOT EXISTS unresolved_deviations AS
SELECT
  dev.deviation_type,
  dev.severity,
  COUNT(*) as count,
  GROUP_CONCAT(DISTINCT d.repository) as affected_repos
FROM deviations dev
JOIN documents d ON dev.document_id = d.id
WHERE dev.resolved_at IS NULL
GROUP BY dev.deviation_type, dev.severity
ORDER BY
  CASE dev.severity
    WHEN 'critical' THEN 1
    WHEN 'major' THEN 2
    WHEN 'minor' THEN 3
    ELSE 4
  END,
  count DESC;

-- =============================================================================
-- FULL-TEXT SEARCH
-- =============================================================================

-- Virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  path,
  filename,
  category,
  content,
  content='documents',
  content_rowid='id'
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, path, filename, category, content)
  VALUES (new.id, new.path, new.filename, new.category, new.content);
END;

CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, path, filename, category, content)
  VALUES('delete', old.id, old.path, old.filename, old.category, old.content);
END;

CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, path, filename, category, content)
  VALUES('delete', old.id, old.path, old.filename, old.category, old.content);
  INSERT INTO documents_fts(rowid, path, filename, category, content)
  VALUES (new.id, new.path, new.filename, new.category, new.content);
END;

-- =============================================================================
-- STATISTICS QUERIES (pre-defined for performance)
-- =============================================================================

-- Store common statistics
CREATE TABLE IF NOT EXISTS statistics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_name TEXT UNIQUE NOT NULL,
  stat_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- =============================================================================
-- DOCUMENT RELATIONSHIPS (Graph Edges) — v2.0
-- =============================================================================
CREATE TABLE IF NOT EXISTS doc_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_doc_id INTEGER NOT NULL,
  target_doc_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  metadata TEXT,        -- JSON: { reason, auto_detected, confidence }
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_doc_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (target_doc_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rel_source ON doc_relationships(source_doc_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON doc_relationships(target_doc_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON doc_relationships(relationship_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_unique
  ON doc_relationships(source_doc_id, target_doc_id, relationship_type);

-- =============================================================================
-- KEYWORDS & CLASSIFICATIONS — v2.0
-- =============================================================================
CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  keyword TEXT NOT NULL,
  category TEXT,        -- 'topic', 'technology', 'repo', 'person', 'action'
  score REAL DEFAULT 1.0,
  source TEXT CHECK (source IN ('extracted', 'manual', 'inferred')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_keywords_doc ON keywords(document_id);
CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_keywords_category ON keywords(category);
CREATE INDEX IF NOT EXISTS idx_keywords_score ON keywords(score DESC);

-- FTS for keyword search
CREATE VIRTUAL TABLE IF NOT EXISTS keywords_fts USING fts5(
  keyword,
  category,
  content='keywords',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS keywords_ai AFTER INSERT ON keywords BEGIN
  INSERT INTO keywords_fts(rowid, keyword, category)
  VALUES (new.id, new.keyword, new.category);
END;

CREATE TRIGGER IF NOT EXISTS keywords_ad AFTER DELETE ON keywords BEGIN
  INSERT INTO keywords_fts(keywords_fts, rowid, keyword, category)
  VALUES('delete', old.id, old.keyword, old.category);
END;

-- =============================================================================
-- DOCUMENT TAGS — v3.0
-- =============================================================================
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

-- =============================================================================
-- FOLDER HIERARCHY — v2.0
-- =============================================================================
CREATE TABLE IF NOT EXISTS folder_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  repository TEXT NOT NULL,
  parent_path TEXT,
  depth INTEGER NOT NULL,
  doc_count INTEGER DEFAULT 0,
  total_size INTEGER DEFAULT 0,
  classification TEXT,  -- 'docs', 'config', 'source', 'tests', 'scripts', 'assets', 'build'
  diagram_url TEXT,     -- FigJam URL for this hierarchy
  mermaid_file TEXT,    -- Path to .mmd file
  last_scanned TEXT
);

CREATE INDEX IF NOT EXISTS idx_folder_repo ON folder_nodes(repository);
CREATE INDEX IF NOT EXISTS idx_folder_parent ON folder_nodes(parent_path);
CREATE INDEX IF NOT EXISTS idx_folder_class ON folder_nodes(classification);
CREATE INDEX IF NOT EXISTS idx_folder_depth ON folder_nodes(depth);

-- =============================================================================
-- DIAGRAM REGISTRY — v2.0
-- =============================================================================
CREATE TABLE IF NOT EXISTS diagrams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER,           -- source document (if applicable)
  folder_node_id INTEGER,        -- source folder (if applicable)
  diagram_type TEXT NOT NULL CHECK (diagram_type IN (
    'folder_tree',
    'relationship_graph',
    'decision_tree',
    'flowchart',
    'sequence',
    'state',
    'gantt'
  )),
  name TEXT NOT NULL,
  mermaid_path TEXT,             -- path to .mmd file
  figjam_url TEXT,               -- FigJam diagram URL (generated — immutable)
  figjam_file_key TEXT,          -- Figma file key (for reuse within same project file)
  curated_url TEXT,              -- curated FigJam URL (after moving to central board)
  curated_at TEXT,               -- when curated_url was set
  repository TEXT,               -- originating repository name
  generated_at TEXT NOT NULL,
  source_hash TEXT,              -- hash of source data to detect staleness
  stale BOOLEAN DEFAULT 0,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
  FOREIGN KEY (folder_node_id) REFERENCES folder_nodes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_diagrams_type ON diagrams(diagram_type);
CREATE INDEX IF NOT EXISTS idx_diagrams_doc ON diagrams(document_id);
CREATE INDEX IF NOT EXISTS idx_diagrams_folder ON diagrams(folder_node_id);
CREATE INDEX IF NOT EXISTS idx_diagrams_figjam ON diagrams(figjam_file_key);
CREATE INDEX IF NOT EXISTS idx_diagrams_stale ON diagrams(stale) WHERE stale = 1;
CREATE INDEX IF NOT EXISTS idx_diagrams_curated ON diagrams(curated_url) WHERE curated_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diagrams_repo ON diagrams(repository);

-- =============================================================================
-- FILE CONVERSIONS LOG — v2.0
-- =============================================================================
CREATE TABLE IF NOT EXISTS conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT NOT NULL,
  source_format TEXT NOT NULL CHECK (source_format IN (
    'docx', 'rtf', 'pdf', 'html', 'txt'
  )),
  output_path TEXT NOT NULL,
  output_format TEXT NOT NULL DEFAULT 'markdown',
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  converted_at TEXT,
  document_id INTEGER,           -- resulting document entry (if indexed)
  error TEXT,
  metadata TEXT,                 -- JSON: page count, word count, etc.
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conversions_status ON conversions(status);
CREATE INDEX IF NOT EXISTS idx_conversions_format ON conversions(source_format);

-- =============================================================================
-- GRAPH VIEWS — v2.0
-- =============================================================================

-- View: Document relationship graph (for API)
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

-- View: Keyword cloud per repository
CREATE VIEW IF NOT EXISTS repo_keyword_cloud AS
SELECT
  d.repository,
  k.keyword,
  k.category,
  COUNT(*) as frequency,
  AVG(k.score) as avg_score
FROM keywords k
JOIN documents d ON k.document_id = d.id
GROUP BY d.repository, k.keyword, k.category
ORDER BY frequency DESC;

-- View: Folder hierarchy with doc counts
CREATE VIEW IF NOT EXISTS folder_tree AS
SELECT
  fn.path,
  fn.repository,
  fn.depth,
  fn.classification,
  fn.doc_count,
  fn.total_size,
  fn.diagram_url,
  fn.parent_path
FROM folder_nodes fn
ORDER BY fn.repository, fn.depth, fn.path;

-- View: Stale diagrams needing regeneration
CREATE VIEW IF NOT EXISTS stale_diagrams AS
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

-- View: Diagrams awaiting curation
CREATE VIEW IF NOT EXISTS pending_relinks AS
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

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
