---

phase: 02-context-profile-loader
plan: 01
subsystem: configuration
tags: [zod, json-schema, profile-loader, context, configuration]

requires:

  - phase: 01-schema-migration-foundation

    provides: Stable SQLite schema and migration runner; backfill scripts (which hold hardcoded values being migrated)

provides:

  - context/schema.mjs — profileSchema Zod validator with strict mode and field-level errors

  - context/loader.mjs — loadProfile() async function returning frozen ctx object

  - context/utils.mjs — commonDir() utility for deriving common ancestor directory

  - config/profiles/dvwdesign.json — reference profile reproducing all hardcoded constants

affects:

  - 02-02-consumer-refactor (loader is the dependency all consumers receive ctx from)

  - daemon/server.mjs (must call loadProfile() at startup)

  - daemon/watcher.mjs (REPOS_ROOT replaced by ctx.repoRoots + commonDir)

  - processors/keyword-processor.mjs (TECH_KEYWORDS/ACTION_KEYWORDS replaced by ctx.keywordTaxonomy)

  - scripts/db/backfill/backfill-classifications.mjs (CLASSIFICATION_RULES replaced by ctx.classificationRules)

tech-stack:
  added: []
  patterns:

  - "Startup crash pattern: loadProfile() throws on missing/invalid/schema-fail — never silently degrades"

  - "Path resolution: always path.resolve() before path.dirname() to handle relative profile paths correctly"

  - "Regex compilation: classificationRules patterns compiled to RegExp in buildCtx() once, not per-document"

  - "Shallow freeze: Object.freeze(ctx) prevents accidental mutation; deep freeze deferred to Phase 3+"

  - "Registry bridge: profile references external repository-registry.json by path; loader reads it at load time"

key-files:
  created:

  - context/schema.mjs

  - context/loader.mjs

  - context/utils.mjs

  - config/profiles/dvwdesign.json

  modified: []

key-decisions:

  - "repositoryRegistryPath uses 3 levels up (../../../) from config/profiles/ — not 2 as shown in research doc which measured from DocuMind root"

  - "path.resolve() applied to profilePath argument before dirname() to ensure relative paths work correctly"

  - "Tech keyword count is 53 unique (not 67/68 as stated in plan done criteria — source Set had duplicate supabase; actual unique count after dedup is 53)"

  - "STOP_WORDS kept hardcoded in keyword-processor.mjs — they are language-universal, not DVWDesign-specific"

patterns-established:

  - "Profile loader pattern: resolve path → read file → JSON.parse → Zod validate → buildCtx → freeze"

  - "commonDir from context/utils.mjs is the single source of truth for REPOS_ROOT derivation across all consumers"

requirements-completed: [PROF-01, PROF-02, PROF-03]

duration: 4min
completed: 2026-03-17

---

# Phase 2 Plan 01: Context Profile Loader — Infrastructure Summary

Zod-validated JSON profile loader with frozen ctx object, reference dvwdesign.json profile, and commonDir utility — foundation for all Phase 2 consumer refactors

## Performance

- **Duration:** 3m 57s

- **Started:** 2026-03-17T17:42:15Z

- **Completed:** 2026-03-17T17:46:10Z

- **Tasks:** 2

- **Files created:** 4

## Accomplishments

- `context/schema.mjs` validates profile JSON with Zod strict mode — rejects unknown keys and produces field-level error messages

- `context/loader.mjs` loads, validates, and freezes ctx at startup; throws descriptive errors for missing/invalid input; resolves repoRoots from external repository-registry.json (16 repos loaded)

- `context/utils.mjs` exports `commonDir()` pure function for deriving REPOS_ROOT from ctx.repoRoots without code duplication

- `config/profiles/dvwdesign.json` reproduces all hardcoded constants: 12 classification rules, 53 unique tech keywords, 17 action keywords, 8 relationship types

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Zod schema, shared utility, and reference profile JSON** - `617c85a` (feat)

2. **Task 2: Create loader module with crash-on-invalid behavior** - `dd9b961` (feat)

**Plan metadata:** `98020c9` (docs: complete plan)

## Files Created/Modified

- `context/schema.mjs` — Zod profileSchema with strict validation, sub-schemas for repository/classificationRule/keywordTaxonomy/lintRules

- `context/loader.mjs` — loadProfile() with path resolution chain, crash-on-invalid error handling, registry bridge, and Object.freeze(ctx)

- `context/utils.mjs` — commonDir() pure function for common ancestor directory computation

- `config/profiles/dvwdesign.json` — Reference DVWDesign profile with all hardcoded values externalized

## Decisions Made

- **repositoryRegistryPath depth:** Research doc said `../../` but that was measured from DocuMind root. The profile file is at `config/profiles/`, so the correct relative path is `../../../RootDispatcher/...` (3 levels up). Fixed during Task 2 verification.

- **path.resolve() before dirname():** Passing a relative path to loadProfile() caused `path.dirname('./config/profiles/dvwdesign.json')` to produce `config/profiles` (relative), and `path.resolve('config/profiles', '../../../RootDispatcher/...')` resolved from CWD instead of the profile's directory. Fix: always `path.resolve(filePath)` first.

- **Tech keyword count is 53:** The plan's done criteria stated "67 unique tech keywords (deduplicated)" but the source TECH_KEYWORDS Set only contained 53 unique items. The plan overestimated; the profile is correct.

## Deviations from Plan

### Auto-fixed Issues

#### 1. [Rule 1 - Bug] Fixed incorrect repositoryRegistryPath depth in dvwdesign.json

- **Found during:** Task 2 (loader verification)

- **Issue:** Profile had `../../RootDispatcher/...` which resolved to `/DocuMind/RootDispatcher/...` instead of the sibling `/DVWDesign/RootDispatcher/...`

- **Fix:** Changed to `../../../RootDispatcher/config/repository-registry.json` (3 levels up from `config/profiles/`)

- **Files modified:** `config/profiles/dvwdesign.json`

- **Verification:** loadProfile() successfully loaded 16 repos from the actual registry

- **Committed in:** dd9b961 (Task 2 commit)

#### 2. [Rule 1 - Bug] Added path.resolve() to profilePath before dirname() in loader

- **Found during:** Task 2 (loader verification)

- **Issue:** Relative profilePath argument caused dirname() to return a relative path, making registry resolution resolve from CWD rather than the profile directory

- **Fix:** `const filePath = path.resolve(profilePath || ...)` applied before any path operations

- **Files modified:** `context/loader.mjs`

- **Verification:** Registry reads correctly from both relative and absolute profile paths

- **Committed in:** dd9b961 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes required for correct registry path resolution. No scope creep.

## Issues Encountered

None beyond the path resolution bugs documented above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All four files exist and verified

- loadProfile() tested end-to-end: valid profile, missing file, invalid JSON, schema failure

- commonDir() tested with empty array, shared prefix, and DVWDesign-specific paths

- 16 active repos loaded correctly from RootDispatcher's repository-registry.json

- Ready for Plan 02: consumer refactors (keyword-processor, backfill-classifications, watcher, server)

### Phase: 02-context-profile-loader

### Completed: 2026-03-17
