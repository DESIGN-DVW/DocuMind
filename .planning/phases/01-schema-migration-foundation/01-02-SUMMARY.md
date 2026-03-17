---
phase: 01-schema-migration-foundation
plan: 02
subsystem: database/migrations
tags: [sqlite, migrations, schema, fts5, document-tags, classification]
dependency_graph:
  requires: [01-01]
  provides: [summary-column, classification-column, document-tags-table, unconstrained-relationship-type]
  affects: [processors/markdown-processor.mjs, graph/relations.mjs, daemon/server.mjs]
tech_stack:
  added: []
  patterns: [sqlite-table-rebuild, fts5-sync-triggers, alter-table-add-column]
key_files:
  created:
    - scripts/db/migrations/002-add-summary.sql
    - scripts/db/migrations/003-add-classification.sql
    - scripts/db/migrations/004-add-document-tags.sql
    - scripts/db/migrations/005-remove-check-constraints.sql
  modified:
    - scripts/db/schema.sql
decisions:
  - PRAGMA foreign_keys omitted from 005 SQL — migrate.mjs sets foreign_keys=ON at startup; with 0 rows in doc_relationships no FK checks fire during INSERT INTO ... SELECT *; cleaner than in-SQL toggling
  - document_graph view dropped and recreated inside migration 005 — SQLite validates dependent views when a base table is dropped; this is the standard workaround
metrics:
  duration: 8m 24s
  completed: 2026-03-17
  tasks_completed: 3
  files_created: 4
  files_modified: 1
---

# Phase 1 Plan 02: SQL Schema Migrations 002-005 Summary

**One-liner:** Four SQL migrations adding summary/classification columns, document_tags table with FTS5, and removing the CHECK constraint from doc_relationships — all applied to 8,172-document live DB without data loss.

## What Was Built

Four SQL migration files applied successfully to the live DocuMind database:

- **002-add-summary.sql** — `ALTER TABLE documents ADD COLUMN summary TEXT` (nullable, 8,172 rows receive NULL; backfill in Plan 03)
- **003-add-classification.sql** — `ALTER TABLE documents ADD COLUMN classification TEXT` + `idx_documents_classification` index (materialized path format)
- **004-add-document-tags.sql** — `document_tags` table with source/confidence columns, `document_tags_fts` FTS5 virtual table, and 3 sync triggers (INSERT/DELETE/UPDATE)
- **005-remove-check-constraints.sql** — 12-step table rebuild of `doc_relationships` removing the `CHECK (relationship_type IN (...))` constraint; drops/recreates `document_graph` view around the rebuild

`schema.sql` updated to reflect the full post-migration target state for fresh installs.

## Verification Results

| Check | Result |
| ----- | ------ |
| schema_migrations rows | 5 (001-005) |
| documents.summary column exists | Yes (column 15, TEXT) |
| documents.classification column exists | Yes (column 16, TEXT) |
| document_tags table exists | Yes |
| document_tags_fts virtual table | Yes |
| doc_relationships CHECK constraint count | 0 |
| Document count preserved | 8,172 |
| FTS5 MATCH 'README' results | 5,835 |
| All existing docs have NULL summary | Yes (8,172/8,172) |

## Decisions Made

| Decision | Rationale |
| -------- | --------- |
| Omit `PRAGMA foreign_keys` from migration 005 SQL | migrate.mjs already sets `foreign_keys=ON` at startup; doc_relationships has 0 rows so no FK checks fire; avoids the SQLite restriction that PRAGMA cannot run inside a transaction |
| Drop and recreate `document_graph` view in migration 005 | SQLite validates all dependent views when a table is dropped; dropping the view first prevents `error in view document_graph: no such table: main.doc_relationships` |
| document_tags placed in schema.sql after keywords section | Logical grouping: both are enrichment/intelligence tables added in v3.0 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] document_graph view breaks migration 005 table rebuild**

- **Found during:** Task 1 verification — first migration run failed with `error in view document_graph: no such table: main.doc_relationships`
- **Issue:** SQLite validates dependent views when a table is dropped. The `document_graph` view references `doc_relationships`; dropping that table inside `db.exec()` causes SQLite to reject the entire statement batch.
- **Fix:** Added `DROP VIEW IF EXISTS document_graph;` before the table rebuild and `CREATE VIEW IF NOT EXISTS document_graph AS ...` after the index recreation in migration 005.
- **Files modified:** `scripts/db/migrations/005-remove-check-constraints.sql`
- **Commit:** 5127c05

## Self-Check: PASSED

Files exist:

```text
FOUND: scripts/db/migrations/002-add-summary.sql
FOUND: scripts/db/migrations/003-add-classification.sql
FOUND: scripts/db/migrations/004-add-document-tags.sql
FOUND: scripts/db/migrations/005-remove-check-constraints.sql
FOUND: scripts/db/schema.sql (modified)
```

Commits exist:

```text
FOUND: 5127c05 — feat(01-02): create SQL migration files 002-005
FOUND: 82dfd6b — feat(01-02): update schema.sql to reflect post-migration target state
```
