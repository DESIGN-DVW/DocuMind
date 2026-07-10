---

phase: 16-kuzu-foundation
plan: 03
subsystem: database
tags: [kuzu, graph, sqlite, daemon, health-check, graceful-shutdown]

requires:

  - phase: 16-01

    provides: ESM import form confirmed (import kuzu from 'kuzu'); shutdown order pattern

  - phase: 16-02

    provides: KUZU_DIR env export in config/env.mjs; initKuzuSchema function with frozen 8-table schema

provides:

  - kuzu.Database instance owned exclusively by daemon/server.mjs

  - initKuzuSchema called on every daemon startup (idempotent schema init)

  - /health endpoint includes kuzu liveness probe with status + path

  - DOCUMIND_KUZU_DIR env var reflected in daemon path + health response

  - kuzuDb closed before SQLite in graceful shutdown (SIGTERM/SIGINT)

affects:

  - 17-sync-bridge

  - 18-cypher-api

  - 19-llm-query

  - 20-viz

tech-stack:
  added: []
  patterns:

    - "Single-owner kuzuDb: one kuzu.Database per process, opened in server.mjs, passed to modules as parameter"

    - "Async /health: health endpoint upgraded to async for Kuzu liveness probe"

    - "Kuzu-before-SQLite shutdown: kuzuDb.close() called before db.pragma + db.close()"

key-files:
  created: []
  modified:

    - daemon/server.mjs

key-decisions:

  - "kuzuDb export added alongside app, db, server — Phase 17 sync bridge imports it directly"

  - "/health upgraded to async handler — Kuzu query probe requires await"

  - "Kuzu probe in /health uses short-lived Connection (open, query RETURN 1, close) — same pattern as initKuzuSchema DDL connection"

  - "initScheduler/initWatcher signatures unchanged — Phase 17 adds kuzuDb to scheduler when sync bridge is implemented"

patterns-established:

  - "Kuzu liveness probe: new kuzu.Connection(kuzuDb) + conn.query('RETURN 1') + result.getAll() + conn.close() in try/catch"

  - "Shutdown order: kuzuDb.close() -> db.pragma(wal_checkpoint) -> db.close()"

requirements-completed:

  - GRAPH-01

  - GRAPH-02

duration: 4min
completed: 2026-04-08

---

# Phase 16 Plan 03: Kuzu Daemon Integration Summary

## kuzu.Database wired into daemon/server.mjs with async /health probe, DOCUMIND_KUZU_DIR override, and clean shutdown — GRAPH-01 + GRAPH-02 fully satisfied

## Performance

- **Duration:** 4 min

- **Started:** 2026-04-08T01:31:11Z

- **Completed:** 2026-04-08T01:35:00Z

- **Tasks:** 2 (1 code change + 1 smoke test)

- **Files modified:** 1

## Accomplishments

- Added `KUZU_DIR`, `kuzu`, and `initKuzuSchema` imports to server.mjs with a single targeted edit

- Inserted `kuzuDb = new kuzu.Database(KUZU_DIR)` + `await initKuzuSchema(kuzuDb)` after SQLite init, logging `[Kuzu] Database path: <path>`

- Extended `/health` handler to async — adds Kuzu liveness probe (`RETURN 1` query) and returns `kuzu: { status: 'ok', path: KUZU_DIR }` in JSON

- Updated shutdown handler to close `kuzuDb` before SQLite WAL checkpoint + close

- Smoke tested: daemon startup logs both Kuzu lines, `/health` returns 200 with kuzu block, `DOCUMIND_KUZU_DIR=/tmp/test-kuzu-dir` override reflected in health response, no lock file after SIGTERM

## Task Commits

1. **Task 1: Wire kuzu.Database open + initKuzuSchema into server.mjs startup** - `0e5146b` (feat)

2. **Task 2: Smoke test end-to-end** - (no new files; verified via daemon run + curl)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `daemon/server.mjs` - Added Kuzu imports, Database open, /health async probe, shutdown close, kuzuDb export

## Decisions Made

- `/health` upgraded from sync to async — Kuzu `conn.query()` is async; changing to `async (_req, res)` was the minimal correct fix

- `kuzuDb` exported from server.mjs — Phase 17 sync bridge will import it directly rather than reopening a Database

- `initScheduler` signature left unchanged — the plan explicitly deferred adding `kuzuDb` to scheduler until Phase 17

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. All four targeted changes applied cleanly. Smoke test passed on first run.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 16 is complete. All three plans (16-01, 16-02, 16-03) are done. The Phase 16 success criteria from ROADMAP.md are all satisfied:

1. `import kuzu from 'kuzu'` ESM import confirmed working — Plan 01

2. Docker build passes + container runs smoke test — Plan 01

3. `DOCUMIND_KUZU_DIR` redirects Kuzu path — Plans 02 + 03

4. Daemon logs "Kuzu graph initialized" with 8 typed edge tables — Plans 02 + 03

Phase 17 (sync bridge) can begin. It will wire `kuzuDb` into the scheduler and implement document upsert from SQLite into Kuzu on scan completion.

---

### Phase: 16-kuzu-foundation

### Completed: 2026-04-08
