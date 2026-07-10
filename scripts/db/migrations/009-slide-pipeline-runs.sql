-- Migration 009: slide_pipeline_runs ledger + latest_slide_runs view
-- One row per pipeline invocation for one deck. Per-stage columns support
-- translate (Phase 25), render (Phase 24), and deploy (Phase 28) independently,
-- so this table doesn't need another migration when those phases land.
-- Modeled on the scan_history run-ledger pattern in scripts/db/schema.sql.

CREATE TABLE IF NOT EXISTS slide_pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_path TEXT NOT NULL,              -- e.g. docs/slides/internal/2026-05-21-figma-ai-internal-deck.md
  trigger_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_source IN ('manual', 'watcher', 'dispatch', 'rest', 'mcp')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  overall_status TEXT NOT NULL DEFAULT 'running'
    CHECK (overall_status IN ('running', 'success', 'failed', 'partial')),

  translate_status TEXT CHECK (translate_status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  translate_duration_ms INTEGER,
  translate_error TEXT,

  render_status TEXT CHECK (render_status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  render_duration_ms INTEGER,
  render_error TEXT,

  deploy_status TEXT CHECK (deploy_status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  deploy_duration_ms INTEGER,
  deploy_error TEXT,

  duration_ms INTEGER,                  -- total wall-clock, mirrors scan_history.duration_ms
  metadata TEXT                         -- JSON: free-form (e.g. content hash, output file list)
);

CREATE INDEX IF NOT EXISTS idx_slide_runs_deck ON slide_pipeline_runs(deck_path);
CREATE INDEX IF NOT EXISTS idx_slide_runs_started ON slide_pipeline_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_slide_runs_status ON slide_pipeline_runs(overall_status);

CREATE VIEW IF NOT EXISTS latest_slide_runs AS
SELECT * FROM (
  SELECT
    r.*,
    ROW_NUMBER() OVER (PARTITION BY r.deck_path ORDER BY r.started_at DESC) AS rn
  FROM slide_pipeline_runs r
)
WHERE rn = 1;
