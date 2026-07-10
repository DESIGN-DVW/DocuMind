---

phase: 17-sync-bridge
plan: "03"
subsystem: database
tags: [kuzu, sqlite, graph, sync, rebuild, standalone-script]

requires:

  - phase: 17-01

    provides: rebuildKuzuGraph(db, kuzuDb) exported from graph/kuzu-sync.mjs

  - phase: 16-02

    provides: initKuzuSchema(kuzuDb) exported from graph/kuzu-init.mjs, KUZU_DIR from config/env.mjs

  - phase: 16-01

    provides: process.exit(0) pattern for standalone kuzu scripts (GC segfault prevention)

provides:

  - scripts/rebuild-kuzu-graph.mjs — standalone operator-runnable graph rebuild script

  - npm run graph:rebuild — SYNC-02 satisfied

affects: [phase-18-text-to-cypher, phase-19-graph-api, operations]

tech-stack:
  added: []
  patterns:

    - "Standalone Kuzu scripts: open own DB instances, call initKuzuSchema first, process.exit(0) last"

    - "Kuzu single-writer constraint: daemon must be stopped before running standalone script"

key-files:
  created:

    - scripts/rebuild-kuzu-graph.mjs

  modified:

    - package.json

key-decisions:

  - "Script opens its own kuzu.Database (not shared) — operator must stop daemon first (single-writer)"

  - "initKuzuSchema called before rebuildKuzuGraph — ensures schema exists for fresh Kuzu dirs"

  - "process.exit(0) required at script end — kuzu@0.11.3 GC segfault prevention (established 16-01)"

patterns-established:

  - "Standalone rebuild: initKuzuSchema → rebuildKuzuGraph → close Kuzu → close SQLite → process.exit(0)"

requirements-completed: [SYNC-02]

duration: 3min
completed: "2026-04-12"

---

# Phase 17 Plan 03: Sync Bridge — Standalone Rebuild Script Summary

## Standalone `npm run graph:rebuild` script that opens its own SQLite and Kuzu DB instances, calls initKuzuSchema + rebuildKuzuGraph, prints node/edge counts, and exits 0 — satisfying SYNC-02

## Performance

- **Duration:** ~3 min

- **Started:** 2026-04-11T15:20:21Z

- **Completed:** 2026-04-12T01:25:17Z

- **Tasks:** 1

- **Files modified:** 2

## Accomplishments

- Created `scripts/rebuild-kuzu-graph.mjs` with prominent daemon stop warning, correct DB open/close order, and process.exit(0) GC segfault prevention

- Added `graph:rebuild` npm script to package.json

- SYNC-02 requirement satisfied: operators can run `npm run graph:rebuild` for manual full Kuzu graph rebuild

- Phase 17 complete: all 3 plans done (kuzu-sync.mjs, orchestrator wiring, standalone rebuild script)

## Task Commits

1. **Task 1: Create scripts/rebuild-kuzu-graph.mjs and add graph:rebuild to package.json** - `450ad58` (feat)

**Plan metadata:** _(see final commit below)_

## Files Created/Modified

- `scripts/rebuild-kuzu-graph.mjs` — standalone Kuzu graph rebuild; opens own DB instances, calls initKuzuSchema + rebuildKuzuGraph, exits 0

- `package.json` — added `"graph:rebuild": "node scripts/rebuild-kuzu-graph.mjs"` to scripts block

## Decisions Made

- Script opens its own `kuzu.Database` (not sharing the daemon's instance) — this is intentional; the single-writer constraint means the daemon must be stopped first. Clear warning printed at startup.

- `initKuzuSchema` is called before `rebuildKuzuGraph` to handle fresh Kuzu dirs (idempotent; no harm on existing schema).

- `process.exit(0)` is mandatory — kuzu@0.11.3 GC segfault prevention, established in Phase 16-01 and confirmed in Phase 17-01.

## Deviations from Plan

None — plan executed exactly as written. Prettier reformatted `try { } catch (_) {}` blocks to multi-line style during lint-staged pre-commit hook; behavior unchanged.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Operators run `npm run graph:rebuild` after stopping the daemon.

## Next Phase Readiness

- Phase 17 fully complete — all 3 plans delivered

- Phase 18 (text-to-Cypher LLM) can begin; Kuzu graph populated via rebuild script or daemon auto-sync

- `npm run graph:rebuild` is the operator escape hatch for full graph resets before Phase 18+ features ship

---

### Phase: 17-sync-bridge

### Completed: 2026-04-12
