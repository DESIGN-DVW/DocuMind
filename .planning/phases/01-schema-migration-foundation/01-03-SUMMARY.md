---
phase: 01-schema-migration-foundation
plan: "03"
subsystem: database
tags: [sqlite, backfill, fts5, better-sqlite3, chalk, extractive-summary, classification]

requires:
  - phase: 01-02
    provides: SQL migrations 002-005 adding summary, classification, document_tags columns and removing CHECK constraints

provides:
  - backfill-summaries.mjs: extractive summary generator (frontmatter.description > first paragraph > filename)
  - backfill-classifications.mjs: path-regex classification with materialized path format
  - migrate.mjs --backfill flag for manual re-runs
  - 8172 documents fully populated with non-NULL summary and classification values
  - FTS5 index rebuilt after bulk writes

affects: [phase-02-document-graph, phase-03-context-profiles, phase-04-mcp-server]

tech-stack:
  added: []
  patterns:
  - "Backfill scripts accept open db instance (caller controls connection lifecycle)"
  - "Idempotent backfill using WHERE IS NULL predicate"
  - "db.transaction() batching in chunks of 500 for bulk UPDATE performance"
  - "FTS5 rebuild via INSERT INTO documents_fts(documents_fts) VALUES('rebuild') after bulk writes"
  - "forceBackfill flag pattern for migrators that need re-run capability"

key-files:
  created:
  - scripts/db/backfill/backfill-summaries.mjs
  - scripts/db/backfill/backfill-classifications.mjs
  modified:
  - scripts/db/migrate.mjs

key-decisions:
  - "Backfill scripts accept open db instance rather than opening their own connection — migrate.mjs controls the lifecycle"
  - "JSON.parse() for frontmatter column (not gray-matter) — DB already stores JSON-serialized frontmatter, not raw YAML"
  - "forceBackfill flag (not unconditional) — backfill runs when new migrations applied OR --backfill explicitly passed, not on every idempotent re-run"
  - "FTS5 rebuild is mandatory after bulk UPDATEs to summary/classification — content column not changed but rebuild is cheap insurance"

patterns-established:
  - "Backfill pattern: idempotent WHERE IS NULL + db.transaction() batching + progress reporting"
  - "Classification uses ordered regex rules array — first match wins, no match = uncategorized"

requirements-completed: [SCHM-02, SCHM-03]

duration: 14min
completed: 2026-03-17
---

# Phase 1 Plan 03: Backfill Summary and Classification Summary

**Extractive summaries and path-based classifications backfilled for all 8172 documents using batched transactions, completing Phase 1 schema migration with FTS5 index rebuilt.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-17T16:22:18Z
- **Completed:** 2026-03-17T16:36:18Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `backfill-summaries.mjs` with 3-tier extractive hierarchy (frontmatter.description > first qualifying paragraph > filename fallback), batched in chunks of 500 using `db.transaction()`
- Created `backfill-classifications.mjs` with 12 ordered regex rules, materialized path format (e.g., `references/readme`, `engineering/scripts`), distribution report printed on completion
- Updated `migrate.mjs` to call both backfill scripts post-migration and rebuild FTS5, with `--backfill` flag for forced re-runs
- Ran `node scripts/db/migrate.mjs --backfill` against live 8172-document corpus: zero NULL summaries, zero NULL classifications, FTS5 MATCH 'README' returns 5835 results

## Task Commits

Each task was committed atomically:

1. **Task 1: Create backfill scripts for summary and classification** - `ce861eb` (feat)
2. **Task 2: Wire backfill into migrate.mjs and run full migration** - `5e51e12` (feat)

**Plan metadata:** *(docs commit follows)*

## Files Created/Modified

- `scripts/db/backfill/backfill-summaries.mjs` - Extractive summary generator; exports `backfillSummaries(db)`
- `scripts/db/backfill/backfill-classifications.mjs` - Path-regex classifier; exports `backfillClassifications(db)`
- `scripts/db/migrate.mjs` - Added backfill invocation + FTS5 rebuild + `--backfill` CLI flag

## Decisions Made

- Backfill scripts accept an open `db` instance rather than opening their own connection. The `migrate.mjs` caller owns the connection lifecycle — this avoids double-open issues and keeps backfill scripts reusable in other contexts (e.g., scheduler).
- `JSON.parse()` for the frontmatter column, not gray-matter. The DB stores JSON-serialized frontmatter (gray-matter was used during initial indexing). Wrapped in try/catch for malformed rows.
- `--backfill` flag triggers backfill even when no new migrations are applied. This covers the exact scenario here: migrations were applied in Plan 02, backfill scripts didn't exist yet — so Plan 03 needed a way to run backfill without re-running already-applied migrations.
- FTS5 rebuild called unconditionally within the backfill block. The `summary` and `classification` columns are not in the FTS5 content, but the rebuild is cheap insurance and follows the research-documented pitfall guidance.

## Classification Distribution (actual results)

| Classification | Count |
| --- | --- |
| references/readme | 5021 |
| uncategorized | 1699 |
| operations/changelog | 853 |
| guides/documentation | 490 |
| engineering/api-docs | 100 |
| engineering/architecture | 7 |
| engineering/tests | 2 |

The high `references/readme` count reflects the node_modules corpus (thousands of package READMEs). `uncategorized` at 1699 is the catch-all for docs not matching any rule — will be refined in Phase 2 context profiles.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1 complete: all 5 SQL migrations applied, 8172 documents have summary + classification, FTS5 index rebuilt
- Phase 2 (Document Graph population) can proceed — `doc_relationships` table exists, no CHECK constraints blocking relationship_type values
- Phase 3 (Context Profiles) can proceed — `document_tags` table exists (empty, awaiting Phase 3)
- `classification` column is the seed for Phase 3 tag propagation — starter rules in place, full taxonomy defined in Phase 3

---

*Phase: 01-schema-migration-foundation*
*Completed: 2026-03-17*

## Self-Check: PASSED

- scripts/db/backfill/backfill-summaries.mjs: FOUND
- scripts/db/backfill/backfill-classifications.mjs: FOUND
- .planning/phases/01-schema-migration-foundation/01-03-SUMMARY.md: FOUND
- Commit ce861eb: FOUND
- Commit 5e51e12: FOUND
