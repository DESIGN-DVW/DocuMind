---
phase: 02-context-profile-loader
plan: 02
subsystem: configuration
tags: [context-profile, daemon, watcher, keyword-processor, backfill, pm2]

requires:
  - phase: 02-context-profile-loader
    plan: 01
    provides: context/loader.mjs (loadProfile), context/utils.mjs (commonDir), config/profiles/dvwdesign.json

provides:
  - daemon/server.mjs — profile-gated startup; ctx threaded to watcher and scheduler
  - daemon/watcher.mjs — file watcher using ctx.repoRoots instead of hardcoded DVWDesign path
  - processors/keyword-processor.mjs — keyword extraction using ctx.keywordTaxonomy (no module-scope Sets)
  - scripts/db/backfill/backfill-classifications.mjs — classification using ctx.classificationRules (compiled RegExp)
  - scripts/db/migrate.mjs — migration runner loads profile and passes ctx to backfillClassifications
  - ecosystem.config.cjs — DOCUMIND_PROFILE env var in PM2 env blocks

affects:
  - Phase 3 (ORCH phase) — relationship type validation against ctx.relationshipTypes deferred here
  - Any caller of indexKeywords or extractKeywords must now supply ctx

tech-stack:
  added: []
  patterns:
    - "Crash-on-startup pattern: loadProfile() called before Express/DB init; process.exit(1) on failure"
    - "ctx threading: passed as explicit function parameter, never via module-scope globals or side effects"
    - "Sets from profile: new Set(ctx.keywordTaxonomy.technology) created inside extractKeywords() call, not at module scope"
    - "REPOS_ROOT derived: commonDir(ctx.repoRoots.map(r => r.path)) in both server.mjs and watcher.mjs"
    - "repoRegistry uses relative paths: path.relative(REPOS_ROOT, r.path) preserves PNG endpoint behavior"

key-files:
  created: []
  modified:
    - daemon/server.mjs
    - daemon/watcher.mjs
    - processors/keyword-processor.mjs
    - scripts/db/backfill/backfill-classifications.mjs
    - scripts/db/migrate.mjs
    - ecosystem.config.cjs

key-decisions:
  - "repoRegistry stores relative paths (path.relative(REPOS_ROOT, r.path)) — PNG endpoint does path.resolve(REPOS_ROOT, repoRegistry.get(repo)) so relative values are required"
  - "REPOS_ROOT_RESOLVED stored at module scope in watcher.mjs — mirrors existing ROOT pattern; required by processPendingChanges closure outside initWatcher"
  - "WATCH_PATTERNS moved inside initWatcher() — depends on ctx so cannot be module-scope"
  - "registryPath kept in server.mjs for diagram relink endpoints — these read registry for per-repo sync, not for REPOS_ROOT initialization"
  - "STOP_WORDS remain hardcoded in keyword-processor.mjs — language-universal; not profile config (confirmed from Plan 01)"

patterns-established:
  - "ctx is always passed as an explicit function parameter — no module-scope profile data"
  - "Module-scope Sets for keyword classification are eliminated; Sets created on each extractKeywords() call from ctx"
  - "REPOS_ROOT derived from ctx.repoRoots via commonDir() — single source of truth; no hardcoded paths in daemon"

requirements-completed: [PROF-02, PROF-04, PROF-05]

duration: 4min
completed: 2026-03-17
---

# Phase 2 Plan 02: Consumer Refactor — Summary

All DVWDesign-specific hardcoded constants removed from daemon and processor files; ctx threaded via function parameters so switching DOCUMIND_PROFILE changes all repo paths, keyword taxonomies, and classification rules without code edits

## Performance

- **Duration:** 4m 14s
- **Started:** 2026-03-17T17:50:21Z
- **Completed:** 2026-03-17T17:54:35Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `daemon/server.mjs` loads profile at startup and crashes with a clear error on missing/invalid profile — Express, DB, and watcher initialization never run without a valid ctx
- `daemon/watcher.mjs` derives WATCH_PATTERNS from `ctx.repoRoots` via `commonDir()` imported from `context/utils.mjs` — no hardcoded DVWDesign path
- `processors/keyword-processor.mjs` has zero module-scope keyword Sets — techSet and actionSet built inside each `extractKeywords()` call from `ctx.keywordTaxonomy`
- `scripts/db/backfill/backfill-classifications.mjs` uses `ctx.classificationRules` (RegExp already compiled by loader) — no hardcoded rules array
- `scripts/db/migrate.mjs` loads profile before backfill and passes ctx to `backfillClassifications(db, ctx)`
- `ecosystem.config.cjs` exposes `DOCUMIND_PROFILE` in both `env` and `env_development` blocks for PM2 overrides

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire server.mjs startup and refactor watcher.mjs + ecosystem.config.cjs** - `1a7812e` (feat)
2. **Task 2: Refactor keyword-processor.mjs, backfill-classifications.mjs, and update migrate.mjs caller** - `3c8891e` (feat)

**Plan metadata:** (docs: complete plan — committed after SUMMARY.md)

## Files Created/Modified

- `daemon/server.mjs` — loadProfile() at startup; commonDir import; ctx passed to initWatcher/initScheduler; repoRegistry from ctx
- `daemon/watcher.mjs` — commonDir import; hardcoded REPOS_ROOT removed; initWatcher(db, root, ctx) signature; WATCH_PATTERNS inside function; REPOS_ROOT_RESOLVED at module scope
- `processors/keyword-processor.mjs` — TECH_KEYWORDS and ACTION_KEYWORDS Sets deleted; extractKeywords(content, ctx, topN); classifyKeyword(word, techSet, actionSet); indexKeywords(db, documentId, content, ctx)
- `scripts/db/backfill/backfill-classifications.mjs` — CLASSIFICATION_RULES array deleted; backfillClassifications(db, ctx); classifyPath(docPath, rules)
- `scripts/db/migrate.mjs` — import { loadProfile }; ctx = await loadProfile() before backfill; backfillClassifications(db, ctx)
- `ecosystem.config.cjs` — DOCUMIND_PROFILE env var in env and env_development blocks

## Decisions Made

- **repoRegistry relative paths:** The PNG endpoint does `path.resolve(REPOS_ROOT, repoRegistry.get(repo))` — so the Map must store relative paths. Used `path.relative(REPOS_ROOT, r.path)` to convert ctx.repoRoots absolute paths back to relative values. Preserves exact endpoint behavior.
- **REPOS_ROOT_RESOLVED at module scope:** The `processPendingChanges` function is a standalone async function (not nested in initWatcher) that references REPOS_ROOT. Added `let REPOS_ROOT_RESOLVED = null;` at module scope — mirrors the existing `ROOT` pattern in watcher.mjs.
- **registryPath kept for relink endpoints:** The plan specified keeping `registryPath` for diagram relink endpoints. Those endpoints read the registry JSON directly for per-repo sync operations — this is intentional and unrelated to REPOS_ROOT initialization.
- **STOP_WORDS remain hardcoded:** Confirmed from Plan 01 decision — language-universal stop words are not profile config.

## Deviations from Plan

None — plan executed exactly as written. The repoRegistry relative-path conversion was implicitly required by the existing PNG endpoint logic (plan specified: "derive it from ctx using the shared `commonDir` utility" and match the original behavior).

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 2 complete: context profile loader infrastructure (Plan 01) and all consumer refactors (Plan 02) done
- Switching `DOCUMIND_PROFILE` to any valid profile JSON now changes repo paths, keyword taxonomies, and classification rules without code edits
- Relationship type validation against `ctx.relationshipTypes` deferred to Phase 3 (ORCH phase) — intentional per research recommendation
- Any future caller of `indexKeywords` or `extractKeywords` must supply `ctx` — no backward-compatible fallback

---

*Phase: 02-context-profile-loader*
*Completed: 2026-03-17*

## Self-Check: PASSED

All files verified present. All commits verified in git log.
