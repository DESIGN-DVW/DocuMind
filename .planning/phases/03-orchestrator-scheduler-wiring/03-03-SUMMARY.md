---
phase: 03-orchestrator-scheduler-wiring
plan: 03
subsystem: daemon-wiring
tags: [scheduler, watcher, hooks, orchestrator, indexMarkdown, runScan, cron]

requires:
  - phase: 03-02
    provides: runScan(db, ctx, options) — single entry point for incremental/full/deep scan modes
  - phase: 03-01
    provides: 4-arg indexMarkdown(db, filePath, repository, ctx) with classification + summary

provides:
  - scheduler.mjs — three cron jobs (hourly/daily/weekly) calling runScan with scan_history telemetry
  - server.mjs /scan and /index endpoints delegating to runScan non-blocking via setImmediate
  - watcher.mjs markdown handler calling indexMarkdown(db, path, repo, CTX)
  - hooks.mjs post-write/post-commit calling indexMarkdown; scan calling runScan

affects: [scheduler-cron, rest-scan-endpoint, rest-index-endpoint, watcher-markdown, hooks-post-write, hooks-post-commit, hooks-scan]

tech-stack:
  added: []
  patterns:
  - "setImmediate used for non-blocking scan trigger in /scan and /index endpoints — responds before scan runs"
  - "Module-level CTX variable pattern in watcher.mjs mirrors existing ROOT pattern — captured in initWatcher closure"
  - "post-commit hook iterates mdFiles with per-file error handling — single file failure does not abort batch"

key-files:
  created: []
  modified:
  - daemon/scheduler.mjs
  - daemon/server.mjs
  - daemon/watcher.mjs
  - daemon/hooks.mjs

key-decisions:
  - "setImmediate chosen over fire-and-forget promise for /scan and /index — ensures response is sent before scan begins"
  - "CTX stored at module scope in watcher.mjs (alongside ROOT) — processPendingChanges is a module-level function outside initWatcher closure, so parameter passing is not viable"
  - "deriveRepoName iterates ctx.repoRoots with startsWith then falls back to DVWDesign path segment — handles nested repos like FigmaAPI/FigmailAPP"
  - "post-commit TODO block wrapped in { } to avoid let/const block-scoping issue with switch/case"

requirements-completed: [ORCH-02, ORCH-03, ORCH-04, ORCH-05]

duration: 2m 58s
completed: 2026-03-17
---

# Phase 3 Plan 03: Daemon Entry-Point Wiring Summary

> All four daemon entry points (scheduler cron jobs, /scan endpoint, watcher markdown handler, hooks post-write/post-commit/scan) wired to call runScan or indexMarkdown instead of TODO stubs — zero scan/index TODOs remain across scheduler, server, watcher, and hooks

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-17T18:43:15Z
- **Completed:** 2026-03-17T18:46:13Z
- **Tasks:** 2 (scheduler+server wiring, watcher+hooks wiring)
- **Files modified:** 4

## Accomplishments

- `scheduler.mjs` — added `runScan` import; updated `initScheduler(db, root, ctx)` signature (was 2-arg); replaced all three cron TODOs with real `runScan` calls including `scan_history` telemetry rows (documents_found, documents_added, documents_updated, duration_ms)
- `server.mjs` — added `runScan` import; replaced `/scan` TODO with non-blocking `setImmediate` calling `runScan(db, ctx, { mode, repo })`; replaced `/index` TODO with same pattern using `incremental` mode; updated `/hook` handler to pass `ctx` to `processHook`
- `watcher.mjs` — added `indexMarkdown` import; added module-level `CTX` variable stored in `initWatcher`; replaced markdown TODO with `indexMarkdown(db, path, repoMatch, CTX)` with error handling
- `hooks.mjs` — added `indexMarkdown` and `runScan` imports; added `deriveRepoName(filePath, ctx)` helper; updated `processHook(db, event, ctx)` signature; replaced `post-write` TODO with `indexMarkdown` call returning `{ status, file }`; replaced `post-commit` TODO with per-file loop returning `{ status, count }`; replaced `scan` TODO with `setImmediate` calling `runScan`

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire scheduler and /scan endpoint to orchestrator** — `d098313` (feat)
2. **Task 2: Wire watcher and hooks to indexMarkdown/runScan** — `0858316` (feat)

## Files Created/Modified

- `daemon/scheduler.mjs` — Three cron jobs now call `runScan` with full scan_history telemetry; signature updated to `(db, root, ctx)`
- `daemon/server.mjs` — `/scan` and `/index` endpoints use `setImmediate` + `runScan`; processHook call passes `ctx`
- `daemon/watcher.mjs` — Markdown file changes trigger `indexMarkdown(db, path, repo, CTX)` via module-level CTX
- `daemon/hooks.mjs` — `processHook(db, event, ctx)` handles post-write/post-commit via `indexMarkdown`; scan via `runScan`

## Decisions Made

- `setImmediate` chosen over fire-and-forget promise for `/scan` and `/index` — ensures HTTP response is sent before the scan begins, avoiding potential timeout issues on large corpora
- `CTX` stored at module scope in watcher.mjs alongside `ROOT` — `processPendingChanges` is a module-level function called via `setTimeout` and cannot receive `ctx` through the closure created inside `initWatcher`
- `deriveRepoName` iterates `ctx.repoRoots` with `startsWith` first, then falls back to extracting the segment after `DVWDesign` — handles nested repos (e.g., `FigmaAPI/FigmailAPP`) that would fail simple path splitting
- `post-commit` case wrapped in `{ }` braces to prevent `let mdFiles` declaration from creating a block-scoping conflict with the outer `switch` statement

## Deviations from Plan

None — plan executed exactly as written.

## User Setup Required

None.

## Next Phase Readiness

- All four daemon entry points now route through the orchestrator or markdown processor — the scan pipeline is complete end-to-end
- Phase 3 Plan 04 (deviation/similarity analysis) can replace the placeholder log statements in `runFullScan` inside `orchestrator.mjs` now that all triggers are wired
- The `convert` and pdf/docx TODOs in watcher remain (out of scope for this plan) — they are logged for Phase 4/5 work

---

*Phase: 03-orchestrator-scheduler-wiring*
*Completed: 2026-03-17*

## Self-Check: PASSED

- FOUND: `daemon/scheduler.mjs`
- FOUND: `daemon/server.mjs`
- FOUND: `daemon/watcher.mjs`
- FOUND: `daemon/hooks.mjs`
- FOUND: `.planning/phases/03-orchestrator-scheduler-wiring/03-03-SUMMARY.md`
- FOUND commit: `d098313` (Task 1)
- FOUND commit: `0858316` (Task 2)
