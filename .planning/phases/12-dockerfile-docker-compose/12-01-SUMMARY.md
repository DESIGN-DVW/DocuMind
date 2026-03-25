---
phase: 12-dockerfile-docker-compose
plan: "01"
subsystem: infra
tags: [docker, graceful-shutdown, health-check, chokidar, sqlite, sigterm]

requires: []
provides:
  - "SIGTERM/SIGINT graceful shutdown with WAL checkpoint and server drain"
  - "DB-aware /health endpoint returning 503 on DB failure"
  - "Polling-aware chokidar watcher for Docker Desktop VirtioFS bind mounts"
affects:
  - 12-02
  - 12-03

tech-stack:
  added: []
  patterns:
    - "server.close() callback chains WAL checkpoint + db.close() before process.exit(0)"
    - "Safety setTimeout().unref() prevents hang if server drain stalls beyond 5 seconds"
    - "Env var feature flags for Docker-specific behavior (CHOKIDAR_USEPOLLING, CHOKIDAR_INTERVAL)"

key-files:
  created: []
  modified:
    - daemon/server.mjs
    - daemon/watcher.mjs

key-decisions:
  - "Manual SIGTERM handler instead of @godaddy/terminus — no new npm dependency needed"
  - "Safety valve exits with code 1 (not 0) to signal abnormal forced exit to Docker"
  - "usePolling defaults to false when CHOKIDAR_USEPOLLING unset — zero behavior change on macOS native"
  - "server exported from server.mjs for downstream MCP HTTP transport use in later phases"

patterns-established:
  - "Graceful shutdown pattern: server.close() -> WAL checkpoint -> db.close() -> process.exit(0)"
  - "DB liveness in health: SELECT 1 probe, 503 on failure, 200 on success"

requirements-completed:
  - DOCK-04
  - DOCK-05

duration: 1min
completed: "2026-03-25"
---

# Phase 12 Plan 01: Graceful Shutdown and Docker-Ready Daemon Summary

**SIGTERM handler with WAL checkpoint + DB-aware /health probe (SELECT 1, 503 on failure) + CHOKIDAR_USEPOLLING polling support for Docker VirtioFS bind mounts**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-25T13:11:41Z
- **Completed:** 2026-03-25T13:12:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `/health` endpoint now includes a `SELECT 1` DB liveness probe; returns 503 with error message when the database is unreachable, 200 when healthy
- `SIGTERM` and `SIGINT` handlers drain in-flight HTTP requests via `server.close()`, run `wal_checkpoint(TRUNCATE)` + `db.close()`, then `process.exit(0)` — prevents SQLite WAL corruption on `docker stop`
- 5-second safety timeout (`setTimeout(..., 5000).unref()`) forces exit with code 1 if server drain stalls
- `daemon/watcher.mjs` reads `CHOKIDAR_USEPOLLING` and `CHOKIDAR_INTERVAL` env vars — enables stat polling for Docker Desktop VirtioFS bind mounts without affecting macOS native behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Add graceful shutdown handler and DB liveness to /health** - `fdb008f` (feat)
2. **Task 2: Add usePolling support to watcher.mjs** - `a96d52f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `daemon/server.mjs` - /health DB liveness probe, server captured from app.listen(), shutdown() function, SIGTERM/SIGINT handlers, server added to export
- `daemon/watcher.mjs` - usePolling and interval options added to chokidar watch() call

## Decisions Made

- Manual SIGTERM handler chosen over `@godaddy/terminus` — no new dependency, Phase 12 scope is sufficient with manual approach
- Safety valve uses exit code `1` (not `0`) so Docker and process managers can distinguish forced kills from clean exits
- `usePolling` defaults to `false` when env var unset — ensures zero behavior change on macOS native for all current dev workflows
- `server` is now exported from `server.mjs` in anticipation of MCP HTTP transport in a later phase

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `daemon/server.mjs` is ready for Dockerfile CMD integration (use `node daemon/server.mjs` directly — not `npm start` — to ensure signal propagation)
- `CHOKIDAR_USEPOLLING=true` and `CHOKIDAR_INTERVAL=2000` are the recommended docker-compose.yml values for VirtioFS bind mounts (set in Plan 02)
- DB health check is wired and ready for Docker HEALTHCHECK directive (Plan 02)

---
*Phase: 12-dockerfile-docker-compose*
*Completed: 2026-03-25*
