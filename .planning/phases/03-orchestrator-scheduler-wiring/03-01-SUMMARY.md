---

phase: 03-orchestrator-scheduler-wiring
plan: 01
subsystem: processors
tags: [markdown-processor, graph, relations, sqlite, classification, summary-extraction, sibling-cap]

requires:

  - phase: 02-context-profile-loader

    provides: ctx object with classificationRules array from loadProfile()
provides:

  - extractSummary function (priority: frontmatter.description > first paragraph > null)

  - classifyPath function consuming ctx.classificationRules array

  - 4-arg indexMarkdown (db, filePath, repository, ctx) populating summary + classification

  - buildRelationships with siblingsByDir pre-compute, >50 dir skip, 10-edge cap, idempotent DELETE

affects: [03-02-orchestrator, scheduler-wiring, graph-rebuild-cron]

tech-stack:
  added: []
  patterns:

  - "ctx passed as last arg to indexMarkdown — processMarkdown remains ctx-free for standalone callers"

  - "siblingsByDir pre-computed Map for O(1) directory group lookup before main loop"

  - "AUTO-DETECTED edges cleared before rebuild via metadata LIKE filter — preserves manual edges"

key-files:
  created: []
  modified:

  - processors/markdown-processor.mjs

  - graph/relations.mjs

key-decisions:

  - "processMarkdown retains simple frontmatter.category || 'other' fallback — adding ctx would break standalone callers"

  - "siblingsByDir Map pre-computed before transaction — avoids repeated filter scans inside hot loop"

  - "Supersedes edge count (167K) is pre-existing behavior outside plan scope — sibling cap (5,425 edges, max 10/doc) is confirmed working"

patterns-established:

  - "extractSummary: frontmatter.description > first non-heading paragraph > null (500-char cap)"

  - "classifyPath: frontmatter.classification > frontmatter.category > ctx.classificationRules > 'other'"

  - "buildRelationships idempotent: DELETE auto_detected edges before INSERT"

requirements-completed: [INTL-01, INTL-02, INTL-04]

duration: 2min
completed: 2026-03-17

---

# Phase 3 Plan 01: Processor Foundation for Orchestrator Summary

> 4-arg indexMarkdown with ctx-based classification and summary extraction; buildRelationships sibling edge cap (10/doc, skip dirs >50) with idempotent DELETE

## Performance

- **Duration:** ~2 min

- **Started:** 2026-03-17T18:31:45Z

- **Completed:** 2026-03-17T18:33:53Z

- **Tasks:** 3 (2 code changes + 1 integration verification)

- **Files modified:** 2

## Accomplishments

- Added `extractSummary(frontmatter, content)` — populates the `summary` column that was previously never written

- Replaced `detectCategory()` with `classifyPath(filePath, frontmatter, ctx)` — classification now driven by ctx.classificationRules

- Updated `indexMarkdown` to 4-arg signature; UPSERT covers both `summary` and `classification` columns

- Pre-computed `siblingsByDir` Map eliminates O(n) filter per doc; directories with >50 files skipped entirely

- Sibling edges capped at 10 per doc (live run: 5,425 `related_to` edges, max per doc = 10)

- `buildRelationships` is now idempotent — DELETE auto_detected edges before each rebuild

## Task Commits

Each task was committed atomically:

1. **Task 1: Add extractSummary, classifyPath, 4-arg indexMarkdown** - `f670dc3` (feat)

2. **Task 2: Cap sibling edges in buildRelationships** - `1404588` (feat)

3. **Task 3: Integration smoke test (no commit — script written, run, deleted)**

## Files Created/Modified

- `processors/markdown-processor.mjs` - Added extractSummary, classifyPath; replaced detectCategory; 4-arg indexMarkdown with summary+classification UPSERT

- `graph/relations.mjs` - siblingsByDir pre-compute; >50 dir skip; 10-edge cap; idempotent DELETE before rebuild

## Decisions Made

- `processMarkdown` keeps `frontmatter.category || 'other'` — it is called standalone (not just from indexMarkdown) so adding ctx would be a breaking change for existing callers

- siblingsByDir Map built before the transaction, not inside it — avoids repeated `.filter()` scans inside the hot 8K-doc loop

- Supersedes relationship volume (167K edges) is pre-existing behavior from sections 2-3 of buildRelationships and is outside this plan's scope; sibling cap (the plan's concern) is confirmed working at 5,425 edges / max 10 per doc

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Live run produced 172,845 total relationships (above the 100K estimate in the plan), but the excess is entirely from `supersedes` relationships (167K) which were pre-existing. The sibling (`related_to`) edges are 5,425 with a confirmed max of 10 per doc — exactly what the cap was designed to achieve. Documented in STATE.md as a note for the orchestrator phase.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `indexMarkdown(db, filePath, repository, ctx)` is ready for orchestrator import

- `buildRelationships(db)` is ready for weekly cron — idempotent, safe to call repeatedly

- Both files can be imported by Plan 02 (orchestrator) without further changes

- Concern: monitor `supersedes` edge growth — if it approaches 500K it may need the same skip/cap treatment as siblings

---

### Phase: 03-orchestrator-scheduler-wiring

### Completed: 2026-03-17

## Self-Check: PASSED

- FOUND: `processors/markdown-processor.mjs`

- FOUND: `graph/relations.mjs`

- FOUND: `.planning/phases/03-orchestrator-scheduler-wiring/03-01-SUMMARY.md`

- FOUND commit: `f670dc3` (Task 1)

- FOUND commit: `1404588` (Task 2)
