-- DocuMind Database Schema
-- SQLite database for intelligent documentation management
-- Created: 2025-11-07

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
  CONSTRAINT chk_path CHECK (length(path) > 0),
  CONSTRAINT chk_hash CHECK (length(content_hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_documents_repo ON documents(repository);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_modified ON documents(modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_documents_repo_category ON documents(repository, category);

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
-- END OF SCHEMA
-- =============================================================================
