---

phase: 09-markdown-tooling-propagation
plan: "01"
subsystem: infra
tags: [markdownlint, lint-rules, propagation, DVW001, MD060A, ecosystem]

requires: []
provides:

  - "scripts/propagate-lint-rules.mjs: propagates DVW001+MD060A to all 16 DVWDesign repos"

  - "All 16 target repos have config/rules/ with both custom rule files"

  - "All 16 target repos have .markdownlint-cli2.jsonc referencing the custom rules"

  - "markdownlint-cli2 and markdownlint-rule-force-align-table-columns installed in all target repos"

affects:

  - markdown-tooling-propagation

  - ecosystem-wide lint enforcement

tech-stack:
  added:

    - markdownlint-cli2 (devDep in 16 repos)

    - markdownlint-rule-force-align-table-columns (devDep in 16 repos)

  patterns:

    - "Propagation script pattern: --dry-run preview + --repo single-target + auto pm detection"

    - "pnpm workspace root detection: check pnpm-workspace.yaml, use -w flag if found"

key-files:
  created:

    - scripts/propagate-lint-rules.mjs

  modified: []

key-decisions:

  - "Target repos get customRules only, NOT config.extends — only DocuMind has full .markdownlint.json"

  - "pnpm workspace roots (LibraryAssetManager) need -w flag for pnpm add, detected via pnpm-workspace.yaml"

  - "Merge strategy for existing .markdownlint-cli2.jsonc: strip JSONC comments, parse, add missing rules, re-serialize"

patterns-established:

  - "Propagation script: always --dry-run first, then --repo for single-target recovery"

  - "pnpm workspace detection: check pnpm-workspace.yaml alongside pnpm-lock.yaml"

requirements-completed:

  - PROP-01

  - PROP-02

duration: 4min
completed: "2026-03-22"

---

# Phase 9 Plan 01: Lint Rule Propagation Summary

## Propagation script copies DVW001 (table-separator-spacing) and MD060A (force-align-table-columns) custom markdownlint rules to all 16 DVWDesign repositories, each receiving config/rules/ files and .markdownlint-cli2.jsonc

## Performance

- **Duration:** ~4 min

- **Started:** 2026-03-22T17:00:03Z

- **Completed:** 2026-03-22T17:04:23Z

- **Tasks:** 2

- **Files modified:** 1 (scripts/propagate-lint-rules.mjs)

## Accomplishments

- Created `scripts/propagate-lint-rules.mjs` with --dry-run and --repo flags, pnpm/npm detection, merge-safe config writing

- Propagated DVW001 + MD060A rules to all 16 target DVWDesign repos (rules copied, config written, deps installed)

- Confirmed markdownlint-cli2 loads custom rules in RootDispatcher, GlossiaApp, and shared-packages without module errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create propagation script** - `0b51f3d` (feat)

2. **Task 2: Run propagation and verify** - `043708b` (fix — workspace pnpm fix applied during execution)

## Files Created/Modified

- `scripts/propagate-lint-rules.mjs` - Propagation script for DVW001 + MD060A across 16 DVWDesign repos

## Decisions Made

- Target repos get `customRules` only in their `.markdownlint-cli2.jsonc` — no `config.extends` reference since they lack DocuMind's `config/.markdownlint.json`

- Merge strategy for repos with existing config: strip JSONC comments, JSON.parse, push missing rules, re-serialize

- pnpm workspace roots need `-w` flag detected via presence of `pnpm-workspace.yaml`

## Deviations from Plan

### Auto-fixed Issues

#### 1. [Rule 1 - Bug] Fixed pnpm workspace root install command

- **Found during:** Task 2 (run propagation)

- **Issue:** LibraryAssetManager is a pnpm workspace root — `pnpm add -D` fails with ERR_PNPM_ADDING_TO_ROOT, requires `-w` flag

- **Fix:** Added `pnpm-workspace` pm type detected via `pnpm-workspace.yaml`; changed install command to `pnpm add -D -w <pkg>`

- **Files modified:** `scripts/propagate-lint-rules.mjs`

- **Verification:** Re-ran `--repo LibraryAssetManager` — OK, deps installed successfully

- **Committed in:** `043708b`

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Necessary fix for pnpm workspace repos. 15/16 repos succeeded on first pass, 1 recovered via --repo flag. No scope creep.

## Issues Encountered

- LibraryAssetManager uses pnpm workspace root — required `-w` flag not in original script. Fixed inline per deviation Rule 1.

## User Setup Required

None - no external service configuration required. All changes are file-system level.

## Next Phase Readiness

- All 16 DVWDesign repos now have custom lint rules active

- Running `npx markdownlint-cli2 "**/*.md"` in any target repo enforces DVW001 and MD060A

- Phase 09 Plan 02 can now implement lint violation fixing across repos

---

### Phase: 09-markdown-tooling-propagation

### Completed: 2026-03-22
