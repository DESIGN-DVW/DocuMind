---

phase: 13-git-clone-ingestion-dual-mode
plan: "01"
subsystem: daemon
tags: [ingestion, clone-mode, git, docker, env-config, scheduler]
dependency_graph:
  requires: [12-02]
  provides: [dual-mode-ingestion]
  affects: [daemon/server.mjs, daemon/scheduler.mjs, config/env.mjs]
tech_stack:
  added: []
  patterns: [execFile-over-exec, promisify, idempotent-clone-check, conditional-cron-registration]
key_files:
  created:

    - daemon/ingestion.mjs

  modified:

    - config/env.mjs

    - daemon/server.mjs

    - daemon/scheduler.mjs

decisions:

  - GIT_TOKEN read from process.env at runtime (not exported from env.mjs) — secrets must not be module-level exports

  - initIngestion() does not mutate DOCUMIND_REPOS_DIR — docker-compose sets it at container start

  - execFile (not exec) used for all git commands to prevent shell injection

  - Fallback for diverged repos: fetch + reset --hard origin/HEAD after ff-only failure

  - Pull cron registered as a second CRON_HOURLY job — node-cron handles multiple jobs per schedule; scan is content-hash idempotent so double-scanning is harmless

metrics:
  duration: 1m 35s
  completed: "2026-03-26"
  tasks: 2
  files: 4

---

# Phase 13 Plan 01: Git Clone Ingestion Dual Mode Summary

Dual-mode repository ingestion via `REPO_MODE` env variable — mount mode keeps the default macOS dev workflow unchanged; clone mode enables the Docker container to fetch its own repos on startup and pull them on schedule.

## Tasks Completed

| Task | Name | Commit | Files |

| ---- | ---- | ------ | ----- |

| 1 | Create ingestion module and add REPO_MODE to env.mjs | df692dc | daemon/ingestion.mjs, config/env.mjs |

| 2 | Wire ingestion into server startup and scheduler pull cron | ab474a8 | daemon/server.mjs, daemon/scheduler.mjs |

## Decisions Made

### GIT_TOKEN secret handling

Read from `process.env.GIT_TOKEN` inside `initIngestion()` at runtime, not exported via `config/env.mjs`. Keeps secrets out of module-level scope per project convention that env.mjs stays side-effect-free for non-secret config.

### DOCUMIND_REPOS_DIR not mutated by ingestion

`initIngestion()` does not touch `process.env.DOCUMIND_REPOS_DIR`. In clone mode, `docker-compose.yml` sets `DOCUMIND_REPOS_DIR=/app/repos` before the container starts, so `env.mjs` already exports the correct `REPOS_DIR` value when imported.

### execFile over exec

All git operations use `child_process.execFile` via `promisify` (not `exec`). This avoids shell injection — arguments are passed as an array and never interpolated into a shell string.

### ff-only pull with reset fallback

`pullAllRepos()` attempts `git pull --ff-only` first. If it fails (diverged history, forced push upstream), falls back to `git fetch origin` + `git reset --hard origin/HEAD`. This matches Docker's ephemeral nature — we own the working tree and want it to always match origin.

### Two CRON_HOURLY jobs in clone mode

The pull cron registers a second job on `CRON_HOURLY` alongside the existing incremental scan. node-cron runs multiple jobs on the same schedule sequentially. Since scan uses `content_hash` deduplication, scanning a just-pulled repo twice is harmless but slightly wasteful. Kept simple per the plan's guidance.

## Artifacts

| Path | Description |

| ---- | ----------- |

| `daemon/ingestion.mjs` | Exports `initIngestion()` and `pullAllRepos()` |

| `config/env.mjs` | Added `REPO_MODE` export (defaults to `'mount'`) |

| `daemon/server.mjs` | Calls `await initIngestion()` before `loadProfile()` |

| `daemon/scheduler.mjs` | Imports `pullAllRepos` and `REPO_MODE`; registers pull cron when `REPO_MODE=clone` |

## Key Links

- `daemon/server.mjs` → `daemon/ingestion.mjs` via `await initIngestion()` before `loadProfile()`

- `daemon/scheduler.mjs` → `daemon/ingestion.mjs` via `pullAllRepos()` in CRON_HOURLY cron

- `daemon/ingestion.mjs` → `config/env.mjs` via `import { REPO_MODE, REPOS_LIST }`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

| Item | Status |

| ---- | ------ |

| daemon/ingestion.mjs exists | FOUND |

| config/env.mjs exists | FOUND |

| daemon/server.mjs exists | FOUND |

| daemon/scheduler.mjs exists | FOUND |

| Commit df692dc exists | FOUND |

| Commit ab474a8 exists | FOUND |
