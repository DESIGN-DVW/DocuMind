---
phase: 17-sync-bridge
plan: 01
subsystem: database
tags: [kuzu, sqlite, graph, sync, better-sqlite3, cypher]

requires:
  - phase: 16-kuzu-foundation
    provides: kuzu.Database singleton (kuzuDb) exported from server.mjs, frozen 8-edge-table schema in kuzu-init.mjs

provides:
  - graph/kuzu-sync.mjs with syncToKuzu and rebuildKuzuGraph exports
  - Incremental node MERGE + drop/recreate edge sync from SQLite to Kuzu
  - Full graph rebuild (wipe all nodes and edges, then re-populate from SQLite)

affects:
  - 17-sync-bridge/17-02 (daemon wiring — imports syncToKuzu)
  - 17-sync-bridge/17-03 (standalone script — imports rebuildKuzuGraph)

tech-stack:
  added: []
  patterns:
    - "kuzu-sync pattern: both exported functions open a short-lived Connection, execute, close in finally — never reopen Database"
    - "Node-before-edge sync ordering: MERGE all Document nodes before creating any edges"
    - "Edges-before-nodes deletion ordering on full rebuild (Kuzu referential integrity)"
    - "insertEdge() private dispatcher: switch on relationship_type to build typed Cypher CREATE with correct property mapping"
    - "metadata column parsed as JSON with fallback to {} for null/empty values"

key-files:
  created:
    - graph/kuzu-sync.mjs
  modified: []

key-decisions:
  - "syncToKuzu uses MERGE for node upsert (idempotent) + drop-all-edges then recreate — SQLite is always source of truth"
  - "rebuildKuzuGraph delegates to syncToKuzu after full wipe — avoids duplicating re-population logic"
  - "insertEdge uses switch dispatch (not map of lambdas) for clarity and explicit per-type property mapping"
  - "process.exit() intentionally excluded — module is daemon-safe; standalone scripts handle exit"
  - "id passed as JS integer directly from better-sqlite3 — no BigInt coercion needed"

patterns-established:
  - "Connection lifecycle: new kuzu.Connection(kuzuDb) in try block, conn.close() in finally — always short-lived"
  - "REL_TYPES array order: edges deleted in this order on rebuild (safe for referential integrity)"
  - "Cypher MERGE with SET for node upsert: MERGE (d:Document {id: $id}) SET d.path = $path ..."
  - "Edge CREATE uses MATCH first: MATCH (src:Document {id: $src}), (tgt:Document {id: $tgt}) CREATE ..."

requirements-completed: [SYNC-01, SYNC-02]

duration: 2min
completed: 2026-04-11
---

# Phase 17 Plan 01: Sync Bridge Core Summary

**syncToKuzu and rebuildKuzuGraph in graph/kuzu-sync.mjs bridge SQLite doc_relationships into the Kuzu graph with typed Cypher CREATEs for all 8 edge tables**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-11T15:16:42Z
- **Completed:** 2026-04-11T15:18:10Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `graph/kuzu-sync.mjs` from scratch with two exported async functions
- `syncToKuzu`: MERGE all Document nodes from SQLite, drop all 8 edge tables, recreate from `doc_relationships`
- `rebuildKuzuGraph`: full wipe (edges then nodes per referential integrity), delegates re-population to `syncToKuzu`
- `insertEdge` private helper correctly maps all 8 relationship types to typed Cypher CREATEs with proper property extraction from the `metadata` JSON column
- All verification checks pass (exports present, MERGE pattern, doc_relationships query, edge deletion loop, REL_TYPES constant, insertEdge, no process.exit in executable code)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create graph/kuzu-sync.mjs with syncToKuzu and rebuildKuzuGraph** - `4d9817c` (feat)

**Plan metadata:** _(pending — created in final commit)_

## Files Created/Modified

- `graph/kuzu-sync.mjs` — Core sync bridge: syncToKuzu + rebuildKuzuGraph + insertEdge private helper

## Decisions Made

- `syncToKuzu` uses MERGE for node upsert (idempotent re-runs) + drop-and-recreate strategy for edges — SQLite is always source of truth for relationships
- `rebuildKuzuGraph` opens its own Connection for the full wipe phase, then closes it before calling `syncToKuzu` (which opens its own Connection) — avoids holding multiple connections simultaneously
- `insertEdge` uses a `switch` statement (not a map of closures) for explicit, readable per-type property mapping
- `id` passed directly from better-sqlite3 as a JS integer — no BigInt coercion, per Phase 16 smoke test findings
- `process.exit()` intentionally absent — this is a daemon-context module; standalone scripts own their exit

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The plan's `<verify>` block included a raw string check for `process.exit` that matched the JSDoc comment `"Never call process.exit() — daemon-safe"`. Resolved by using comment-stripping in the verification to confirm no executable `process.exit()` call exists. The file is correct — the mention is documentation-only.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `graph/kuzu-sync.mjs` is ready for import by Plan 17-02 (daemon wiring — adds `/sync` endpoint and scheduler hook)
- `graph/kuzu-sync.mjs` is ready for import by Plan 17-03 (standalone CLI script using `rebuildKuzuGraph`)
- Both exported functions accept `(db, kuzuDb)` — the exact signature expected by Plans 17-02 and 17-03

---

_Phase: 17-sync-bridge_
_Completed: 2026-04-11_
