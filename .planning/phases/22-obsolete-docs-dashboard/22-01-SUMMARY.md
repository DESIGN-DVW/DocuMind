---
phase: 22-obsolete-docs-dashboard
plan: "01"
subsystem: database
tags: [sqlite, kuzu, obsolescence, scoring, migration, heuristics]

requires:
  - phase: 17-sync-bridge
    provides: Kuzu graph with Document nodes and edges — inbound link counts sourced from Kuzu traversal
  - phase: 18-query-layer
    provides: kuzu.Connection lifecycle pattern (prepare+execute, result.close, conn.close in finally)

provides:
  - obsolescence_signals SQLite table with UNIQUE(document_id), dismissed_until, FK CASCADE
  - detectObsolescence(db, kuzuDb) async function — 4-signal scoring engine with upsert + cleanup

affects:
  - 22-02 (scheduler wiring of detectObsolescence)
  - 22-03 (REST endpoint and dashboard reading from obsolescence_signals)

tech-stack:
  added: []
  patterns:
    - "Kuzu: single Connection opened per detection pass, closed in finally — not per document"
    - "SQLite ON CONFLICT upsert: excluded.column pattern; dismissed_until deliberately omitted from SET"
    - "Migration pattern: 006-obsolescence-signals.sql picked up by migrate.mjs auto-discovery (sorted lexicographic)"

key-files:
  created:
    - scripts/db/migrations/006-obsolescence-signals.sql
    - processors/obsolescence-detector.mjs
  modified: []

key-decisions:
  - "dismissed_until intentionally excluded from ON CONFLICT SET clause — re-running detection never resets a user dismissal"
  - "Single Kuzu Connection opened for the full detection pass (one MATCH query returning all docs) rather than per-document queries"
  - "Kuzu unavailability is non-fatal — warning logged, all inbound counts default to 0, scoring continues"
  - "Stale signal cleanup deletes rows for docs that dropped below threshold or were removed from the index"

patterns-established:
  - "Obsolescence scoring: ageSignal*0.35 + linkSignal*0.35 + keywordSignal*0.30; >= 0.8 = obsolete"
  - "Four flag labels: obsolete, redundant, stale, needs-update — with minimum confidence thresholds"
  - "Guard pattern: check sqlite_master for table existence before operating — throw descriptive error if migration missing"

requirements-completed:
  - OBS-01
  - OBS-05

duration: 2min
completed: "2026-04-20"
---

# Phase 22 Plan 01: Obsolescence Signals Foundation Summary

**SQLite migration + 4-signal heuristic scorer that flags 1,627 of 8,439 indexed docs as obsolete/redundant/stale/needs-update with dismissed_until-safe upsert**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-20T13:21:59Z
- **Completed:** 2026-04-20T13:24:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `scripts/db/migrations/006-obsolescence-signals.sql` — applied cleanly to live DB, table confirmed with all 10 columns
- Created `processors/obsolescence-detector.mjs` exporting `detectObsolescence(db, kuzuDb)` with full scoring logic
- Smoke tested against live DocuMind DB: 8,439 docs scanned, 1,627 flagged, 0 cleared — runs in under 1 second

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration 006-obsolescence-signals.sql** - `39f5a66` (feat)
2. **Task 2: Create processors/obsolescence-detector.mjs** - `5c62a80` (feat)

**Plan metadata:** _(added in final commit below)_

## Files Created/Modified

- `scripts/db/migrations/006-obsolescence-signals.sql` — DDL for obsolescence_signals table with UNIQUE constraint, dismissed_until column, FK CASCADE, 4 indexes
- `processors/obsolescence-detector.mjs` — async detectObsolescence(db, kuzuDb); 4-signal scoring (age/link/keyword/similarity); upsert preserving dismissed_until; stale cleanup

## Decisions Made

- **dismissed_until excluded from ON CONFLICT SET** — critical for the dismiss/snooze UX in Plan 03; re-running detection must not reset a user's snooze
- **Single Kuzu Connection** — one `MATCH (src)-[r]->(tgt) RETURN tgt.id, count(r)` query returns all docs in one pass; far more efficient than per-document queries
- **Non-fatal Kuzu path** — if kuzuDb is null or Kuzu query fails, detection warns and continues with all inbound counts = 0; scheduler can call this safely even before graph is populated

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `obsolescence_signals` table is live in documind.db
- `detectObsolescence(db, kuzuDb)` is importable and tested
- Plan 02 can wire `detectObsolescence` into `scheduler.mjs` as a non-fatal post-scan step
- Plan 03 can read from `obsolescence_signals` for the REST endpoint and dashboard UI

---

*Phase: 22-obsolete-docs-dashboard*
*Completed: 2026-04-20*
