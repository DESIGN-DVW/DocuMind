---
phase: 23-foundation-hygiene
plan: 03
subsystem: database
tags: [sqlite, migrations, better-sqlite3, ledger, window-functions]

# Dependency graph
requires:
  - phase: 23-foundation-hygiene
    provides: "Versioned migration convention (scripts/db/migrate.mjs), scan_history run-ledger precedent"
provides:
  - "slide_pipeline_runs table: per-stage (translate/render/deploy) status/duration/error columns for one row per pipeline invocation"
  - "latest_slide_runs view: most-recent run per deck_path via ROW_NUMBER() window function"
  - "008-action-log migration backfilled (was previously pending, applied alongside 009)"
affects: [24-render-stage, 25-translate-stage, 26-ledger-wiring, 28-deploy-stage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Versioned SQL migrations only — no inline CREATE TABLE in daemon/server.mjs"
    - "Run-ledger tables use per-stage status/duration/error triplets rather than a single status column, to avoid future migrations when new stages land"

key-files:
  created: [scripts/db/migrations/009-slide-pipeline-runs.sql]
  modified: [data/documind.db]

key-decisions:
  - "Column named trigger_source (not trigger) — TRIGGER is a SQLite reserved keyword; avoids fragility even though it parses unquoted today"
  - "CHECK enums kept small/stable/non-org-specific (manual/watcher/dispatch/rest/mcp and running/success/failed/partial/skipped) to satisfy the migration-005 portability rule"

patterns-established:
  - "Per-stage columns (translate_*, render_*, deploy_*) on a single ledger row, populated incrementally as each stage completes — avoids join complexity for a low-volume table"

requirements-completed: [FOUND-03]

# Metrics
duration: 6min
completed: 2026-07-10
---

# Phase 23 Plan 03: Slide Pipeline Run Ledger Summary

**Versioned migration 009 adds the `slide_pipeline_runs` table and `latest_slide_runs` window-function view, applied via `npm run db:migrate` and confirmed queryable through the sqlite3 CLI.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-10T21:30:00Z
- **Completed:** 2026-07-10T21:36:00Z
- **Tasks:** 2
- **Files modified:** 1 (tracked) + data/documind.db (gitignored)

## Accomplishments

- Created `scripts/db/migrations/009-slide-pipeline-runs.sql` defining the ledger table (per-stage translate/render/deploy columns), 3 supporting indexes, and the `latest_slide_runs` view
- Applied via `npm run db:migrate` — both `008-action-log` (previously pending) and `009-slide-pipeline-runs` applied in the same run, backed up first
- Verified table, view, and `schema_migrations` entries via the sqlite3 CLI directly, satisfying FOUND-03's exact wording
- Confirmed no competing inline `CREATE TABLE slide_pipeline_runs` exists anywhere in `daemon/` or `scripts/`

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration 009-slide-pipeline-runs.sql** - `ce6726a` (feat)
2. **Task 2: Apply migration via npm run db:migrate and verify on the live DB** - no commit (data/documind.db is gitignored; verification-only task with no git-trackable artifact)

**Plan metadata:** (this commit) `docs(23-03): complete slide pipeline run ledger plan`

## Files Created/Modified

- `scripts/db/migrations/009-slide-pipeline-runs.sql` - Versioned migration: slide_pipeline_runs table (per-stage columns), 3 indexes, latest_slide_runs view
- `data/documind.db` - Live DB now has slide_pipeline_runs table + latest_slide_runs view + schema_migrations entries for 008 and 009 (gitignored, not committed)

## Decisions Made

- Used `trigger_source` instead of `trigger` for the enum column, per the plan's explicit instruction — `TRIGGER` is a SQLite reserved keyword and relying on it parsing unquoted today would be fragile for future tooling/queries
- Accepted the double-apply of `008-action-log` alongside `009` as expected, harmless behavior (the migration uses `CREATE TABLE IF NOT EXISTS`), matching the plan's documented Pitfall 3 note — not treated as a deviation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both tasks completed on the first attempt; scratch-DB syntax check and live-DB verification both passed without iteration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `slide_pipeline_runs` and `latest_slide_runs` are live and ready for Phase 26 (Ledger Wiring) to write rows into
- Per-stage columns mean Phases 24 (Render), 25 (Translate), and 28 (Deploy) can populate their respective stage fields independently without a follow-up migration
- No blockers identified for downstream phases from this plan

---
*Phase: 23-foundation-hygiene*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: scripts/db/migrations/009-slide-pipeline-runs.sql
- FOUND: .planning/phases/23-foundation-hygiene/23-03-SUMMARY.md
- FOUND: ce6726a (git log)
