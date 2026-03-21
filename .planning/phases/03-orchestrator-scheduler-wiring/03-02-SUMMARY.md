---
phase: 03-orchestrator-scheduler-wiring
plan: 02
subsystem: orchestrator
tags: [orchestrator, scan-pipeline, incremental, full, deep, fts5, keyword-processor, graph, relations]

requires:
  - phase: 03-01
    provides: 4-arg indexMarkdown(db, filePath, repository, ctx); buildRelationships(db) idempotent
  - phase: 02-01
    provides: loadProfile() returning ctx with repoRoots, classificationRules, keywordTaxonomy
provides:
  - runScan(db, ctx, options) — single entry point for all scan modes
  - incremental mode: mtime vs last_scanned skip; returns added/updated/skipped counts
  - full mode: re-indexes every file; deviation placeholder logged
  - deep mode: full + indexKeywords per doc + buildRelationships + both FTS5 rebuilds
affects: [scheduler-wiring, hooks-wiring, rest-scan-endpoint, watcher-wiring]

tech-stack:
  added: []
  patterns:
  - "fast-glob used via default import (CJS compat) — named ESM export not supported on Node 24"
  - "rebuildFTS called once per scan batch end — never per-file"
  - "getRepoFiles filters ctx.repoRoots by name when repo arg provided"

key-files:
  created:
  - orchestrator.mjs
  modified: []

key-decisions:
  - "fast-glob default import used (not named) — Node 24 ESM named export not supported by CJS package"
  - "runFullScan pre-loads existing paths to distinguish added vs updated without extra DB round-trips"
  - "runDeepScan passes startMs from caller through runFullScan to ensure total duration in result"

requirements-completed: [ORCH-01, ORCH-06]

duration: 2m 3s
completed: 2026-03-17
---

# Phase 3 Plan 02: Central Scan Orchestrator Summary

> Three-mode scan pipeline (incremental/full/deep) consolidating all processor calls into a single runScan export with per-batch FTS5 rebuilds and mtime-based incremental skip logic

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-17T18:37:34Z
- **Completed:** 2026-03-17T18:39:37Z
- **Tasks:** 2 (1 implementation + 1 smoke test)
- **Files created:** 1

## Accomplishments

- Created `orchestrator.mjs` (284 lines) exporting `runScan(db, ctx, options)` as the sole public function
- `incremental` mode: loads existing doc state from DB, uses mtime vs `last_scanned` to skip unchanged files, returns `{ added, updated, skipped }` counts
- `full` mode: re-indexes every file regardless of mtime; logs deviation analysis placeholder for Plan 04
- `deep` mode: full index + per-doc `indexKeywords` + `rebuildKeywordsFTS` + `buildRelationships` + final `rebuildFTS`
- `rebuildFTS` and `rebuildKeywordsFTS` called once per scan batch — never per individual file
- `getRepoFiles` helper uses fast-glob with `node_modules/.git/dist/build` ignore list
- Smoke test against live DB: 28 files found in DocuMind repo, FTS5 search returned results after rebuild (1850ms)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create orchestrator.mjs with three scan modes** — `0d005f3` (feat)
2. **Task 2: Smoke test verification** — no new commit (test script written, run, deleted; no file state change)

## Files Created/Modified

- `orchestrator.mjs` — Three-mode scan pipeline; exports `runScan`; 284 lines

## Decisions Made

- `fast-glob` used via default import (`import fg from 'fast-glob'; const { glob } = fg`) — Node 24 does not support named ESM exports from CJS packages
- `runFullScan` pre-loads the set of existing doc paths at the start to classify each indexed file as `added` vs `updated` without extra per-file DB queries
- `runDeepScan` receives `startMs` from `runScan` and passes it through to `runFullScan` so that `durationMs` in the deep result reflects total elapsed time from the original call, not just the full-scan sub-phase

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] fast-glob named ESM export not supported**

- **Found during:** Task 1 verification (`node -e "import('./orchestrator.mjs')"`)
- **Issue:** `import { glob } from 'fast-glob'` throws `SyntaxError: Named export 'glob' not found` on Node 24 because fast-glob is a CJS package
- **Fix:** Switched to `import fg from 'fast-glob'; const { glob } = fg;` (default import + destructure)
- **Files modified:** `orchestrator.mjs`
- **Commit:** `0d005f3` (included in Task 1 commit)

## Smoke Test Results (Task 2)

- Repo: DocuMind (single repo)
- Documents found: 28
- Added: 27, Updated: 0, Skipped: 1
- FTS5 search after rebuild: true (matches > 0 for "markdown")
- Duration: 1850ms (well under 30s threshold)
- Test script deleted after verification

## User Setup Required

None.

## Next Phase Readiness

- `runScan(db, ctx, { mode, repo })` is ready for import by scheduler (Plan 03), server.mjs scan endpoint, hooks.mjs, and watcher.mjs
- Deep scan `keywords` and `edges` counts in result object give callers visibility into work done
- Deviation and similarity analysis remain as placeholders — Plan 04 will replace the log statements with real implementations

---

*Phase: 03-orchestrator-scheduler-wiring*
*Completed: 2026-03-17*

## Self-Check: PASSED

- FOUND: `orchestrator.mjs`
- FOUND: `.planning/phases/03-orchestrator-scheduler-wiring/03-02-SUMMARY.md`
- FOUND commit: `0d005f3` (Task 1)
