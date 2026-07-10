---
phase: 17-sync-bridge
plan: 02
subsystem: database
tags: [kuzu, sqlite, sync, graph, health, scheduler, daemon]

requires:
  - phase: 17-01
    provides: syncToKuzu and rebuildKuzuGraph exported from graph/kuzu-sync.mjs
  - phase: 16-03
    provides: kuzuDb singleton initialized in server.mjs; initKuzuSchema; /health async handler

provides:
  - orchestrator.mjs wires syncToKuzu after buildRelationships in runDeepScan (non-fatal try/catch)
  - scheduler.mjs passes kuzuDb through initScheduler → weekly deep scan
  - server.mjs runs startup backfill via rebuildKuzuGraph when Kuzu graph is empty
  - /health endpoint reports edge_count, sqlite_edge_count, sync_status (in-sync / drift detected)

affects: [18-text-to-cypher, 19-mcp-graph-tools, 20-viz-dashboard]

tech-stack:
  added: []
  patterns:
    - "kuzuDb flows as explicit parameter: server.mjs owns singleton, passes down to scheduler → runScan → runDeepScan"
    - "Kuzu sync is non-fatal: errors in syncToKuzu do not abort deep scan; error logged and scan continues"
    - "Startup self-heal: daemon checks node count on boot, triggers rebuildKuzuGraph if empty"
    - "Health parity check: /health queries all 8 typed edge tables and compares sum against SQLite doc_relationships"

key-files:
  created: []
  modified:
    - orchestrator.mjs
    - daemon/scheduler.mjs
    - daemon/server.mjs

key-decisions:
  - "Kuzu sync in runDeepScan is non-fatal — a failing sync does not abort the scan; operators see the error in logs"
  - "kuzuDb flows as an explicit parameter through all layers (server → initScheduler → runScan → runDeepScan) — no globals or re-opening the database"
  - "Startup backfill uses node count (not edge count) as the empty-graph signal — zero nodes is unambiguous"
  - "Health sync_status uses strict equality: kuzuEdges === sqliteEdges; any discrepancy reports 'drift detected'"

patterns-established:
  - "Non-fatal Kuzu sync pattern: try/catch around syncToKuzu with error logging, never re-throw"
  - "Startup self-heal pattern: check empty graph before serving → rebuildKuzuGraph if needed"
  - "Health parity pattern: iterate REL_TYPES array, sum COUNT(e) per edge table, compare to SQLite count"

requirements-completed: [SYNC-01, SYNC-03]

duration: 1min
completed: 2026-04-11
---

# Phase 17 Plan 02: Sync Bridge Wiring Summary

**Kuzu auto-populates on deep scan and self-heals on empty startup; /health reports edge parity between SQLite and Kuzu**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-11T00:00:27Z
- **Completed:** 2026-04-11T00:01:57Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- orchestrator.mjs wired: syncToKuzu called after buildRelationships in runDeepScan with non-fatal error handling
- scheduler.mjs updated: initScheduler accepts kuzuDb as 4th parameter; weekly deep scan passes it to runScan
- server.mjs extended: startup backfill runs rebuildKuzuGraph when Kuzu graph is empty; /health returns edge_count, sqlite_edge_count, and sync_status

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire syncToKuzu into runDeepScan pipeline** - `d8612fc` (feat)
2. **Task 2: Update scheduler.mjs and server.mjs** - `5511537` (feat)

**Plan metadata:** (created next)

## Files Created/Modified

- `orchestrator.mjs` - Imports syncToKuzu; runDeepScan accepts kuzuDb and calls syncToKuzu after buildRelationships; runScan destructures kuzuDb from options
- `daemon/scheduler.mjs` - initScheduler extended with kuzuDb param; weekly cron passes kuzuDb in deep scan options
- `daemon/server.mjs` - Imports rebuildKuzuGraph; startup backfill block; initScheduler called with kuzuDb; /health upgraded with full sync parity reporting

## Decisions Made

- Kuzu sync in runDeepScan is non-fatal — a failing sync does not abort the scan; error is logged and execution continues.
- kuzuDb flows as an explicit parameter through all layers (server → initScheduler → runScan → runDeepScan) — no globals or re-opening the database.
- Startup backfill uses node count (not edge count) as the empty-graph signal — zero nodes is unambiguous even when edges exist from a partial load.
- Health sync_status uses strict equality: kuzuEdges === sqliteEdges; any discrepancy reports 'drift detected'.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 17 Plan 03 (health reporting / smoke test) can proceed immediately.
- All three wiring points are live: orchestrator auto-syncs, scheduler propagates kuzuDb, daemon self-heals.
- /health now provides operator-visible sync parity, satisfying SYNC-03.

---
*Phase: 17-sync-bridge*
*Completed: 2026-04-11*
