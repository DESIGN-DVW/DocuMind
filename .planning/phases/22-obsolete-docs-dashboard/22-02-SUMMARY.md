---

phase: 22-obsolete-docs-dashboard
plan: 02
subsystem: daemon
tags: [rest-api, obsolescence, scheduler, cron, endpoints]
dependency_graph:
  requires: [22-01]
  provides: [obsolescence-rest-api, daily-detection-cron]
  affects: [daemon/server.mjs, daemon/scheduler.mjs]
tech_stack:
  added: []
  patterns: [sqlite-master-guard, route-order-batch-before-param, non-fatal-try-catch]
key_files:
  created: []
  modified:

    - daemon/server.mjs

    - daemon/scheduler.mjs

decisions:

  - "GET /obsolete uses sqlite_master guard — returns empty result on fresh install, not 500"

  - "POST /obsolete/batch-dismiss registered before POST /obsolete/:id/dismiss — prevents route capture of literal string 'batch-dismiss'"

  - "detectObsolescence call placed after generateDiagramSnapshot try/catch inside CRON_DAILY outer try block — runs only when scan succeeds"

  - "Dismiss expiry is 30 days from call time (Date.now() + 30 * 24 * 60 * 60 * 1000)"

metrics:
  duration: ~3 min
  completed: "2026-04-20"
  tasks_completed: 2
  files_modified: 2

---

# Phase 22 Plan 02: REST Endpoints + Scheduler Wiring Summary

REST API surface for obsolescence signals + daily detection cron wired — obsolescence data is now queryable and auto-refreshed.

## What Was Built

Three new REST endpoints added to `daemon/server.mjs` and `detectObsolescence` wired into the daily cron in `daemon/scheduler.mjs`.

### REST Endpoints (daemon/server.mjs)

**GET /obsolete** — returns paginated, filterable obsolescence signal rows.

- Query params: `repo`, `flag`, `limit` (default 50), `offset` (default 0), `include_dismissed` (default `false`)

- Response: `{ total, count, offset, rows[] }` where each row includes `path`, `repository`, `filename`, `confidence_score`, `flag_label`, `age_days`, `dismissed_until`

- Guards against missing `obsolescence_signals` table (returns `{ total: 0, count: 0, offset: 0, rows: [] }`)

**POST /obsolete/batch-dismiss** — dismisses multiple signals in a single SQLite transaction.

- Body: `{ ids: [1, 2, 3] }`

- Response: `{ status: 'dismissed', count: N, dismissed_until: ISO }`

- Registered **before** `:id/dismiss` to prevent route capture

**POST /obsolete/:id/dismiss** — dismisses a single signal for 30 days.

- Response: `{ status: 'dismissed', id: N, dismissed_until: ISO }`

- Returns 404 if signal not found or table doesn't exist

### Scheduler Wiring (daemon/scheduler.mjs)

`detectObsolescence` imported from `../processors/obsolescence-detector.mjs` and called inside `CRON_DAILY` immediately after the `generateDiagramSnapshot` try/catch block. Wrapped in its own non-fatal try/catch — detection failure never aborts the daily scan. Logs scanned/flagged/cleared counts on success.

## Commits

| Task | Description | Hash |
| ---- | ----------- | ---- |
| 1 | Add GET /obsolete + POST dismiss endpoints | bd31090 |
| 2 | Wire detectObsolescence into CRON_DAILY | d38abef |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files verified:

- `daemon/server.mjs` — 3 endpoint registrations confirmed (lines 474, 533, 565)

- `daemon/scheduler.mjs` — 2 occurrences of `detectObsolescence` confirmed (import + call)

- batch-dismiss (line 533) before :id/dismiss (line 565) — routing order correct

Commits verified: bd31090, d38abef both present in git log.

## Self-Check: PASSED
