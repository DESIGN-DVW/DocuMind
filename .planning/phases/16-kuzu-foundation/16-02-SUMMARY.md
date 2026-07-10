---

phase: 16-kuzu-foundation
plan: "02"
subsystem: database
tags: [kuzu, graph-database, esm, schema, env-config, node22]

requires:

  - phase: 16-01

    provides: "ESM import form confirmed (import kuzu from 'kuzu'), kuzu@0.11.3 installed"

provides:

  - "config/env.mjs KUZU_DIR export — absolute path from DOCUMIND_KUZU_DIR env var, default data/documind.kuzu"

  - "graph/kuzu-init.mjs with initKuzuSchema(kuzuDb) — idempotent DDL for Document node table + 8 typed edge tables"

  - "Frozen Kuzu schema: 8 typed edge tables (imports, dispatched_to, supersedes, related_to, parent_of, variant_of, depends_on, generated_from)"

affects: [16-03, 17, 18, 19, 20, 21]

tech-stack:
  added: []
  patterns:

    - "KUZU_DIR env pattern: path.resolve(ROOT, process.env.DOCUMIND_KUZU_DIR ?? 'data/documind.kuzu') — follows DB_PATH convention"

    - "initKuzuSchema: DDL-only function that opens a short-lived Connection, runs all IF NOT EXISTS queries, closes conn in finally block"

    - "Kuzu schema frozen in Phase 16 — no DDL changes permitted after this point; Phase 17 sync depends on exact column/property definitions"

key-files:
  created:

    - graph/kuzu-init.mjs

  modified:

    - config/env.mjs

key-decisions:

  - "ESM import form used: `import kuzu from 'kuzu'` (default import) — consistent with Plan 16-01 confirmation; no createRequire fallback"

  - "KUZU_DIR added in DATABASE section of env.mjs immediately after DB_PATH — follows same path.resolve(ROOT, env ?? default) pattern"

  - "initKuzuSchema creates a new Connection for DDL then closes it in finally — kuzuDb ownership stays with server.mjs caller"

  - "conn.close() wraps in try/catch in finally to survive if close() unavailable in edge environments"

  - "8 edge table property types are frozen: imports (weight DOUBLE, link_text STRING), dispatched_to (target_repo STRING), supersedes (confidence DOUBLE), related_to (weight DOUBLE, reason STRING), parent_of (), variant_of (similarity_score DOUBLE), depends_on (), generated_from ()"

patterns-established:

  - "Kuzu DDL pattern: open Connection, query all IF NOT EXISTS tables, close Connection in finally"

  - "Env pattern for new data stores: export const X_DIR = path.resolve(ROOT, process.env.DOCUMIND_X ?? 'data/default')"

requirements-completed: [GRAPH-01, GRAPH-02]

duration: 8min
completed: "2026-04-08"

---

# Phase 16 Plan 02: Kuzu Schema + Env Config Summary

## KUZU_DIR env export added to config/env.mjs and idempotent initKuzuSchema function created defining frozen 8-table Kuzu graph schema (Document node + 8 typed edge tables)

## Performance

- **Duration:** ~8 min

- **Started:** 2026-04-08T01:21:00Z

- **Completed:** 2026-04-08T01:29:17Z

- **Tasks:** 2

- **Files modified:** 2

## Accomplishments

- Added `KUZU_DIR` to `config/env.mjs` in the DATABASE section following the established `DB_PATH` pattern — default `data/documind.kuzu`, overridable via `DOCUMIND_KUZU_DIR`

- Created `graph/kuzu-init.mjs` exporting `initKuzuSchema(kuzuDb)` — opens a short-lived Connection, creates Document node table and all 8 typed edge tables with `IF NOT EXISTS`, logs confirmation, closes connection

- Verified idempotency: calling `initKuzuSchema` twice in sequence produces no errors — second call skips all tables silently

- Schema is frozen: all 8 edge table definitions (names + property types) are locked for Phase 17 data sync dependency

## Task Commits

Each task was committed atomically:

1. **Task 1: Add KUZU_DIR to config/env.mjs** - `0fcca4f` (feat)

2. **Task 2: Create graph/kuzu-init.mjs with frozen 8-table schema** - `e775d4a` (feat)

## Files Created/Modified

- `config/env.mjs` — Added `KUZU_DIR` export (7 lines) in DATABASE section after `DB_PATH`

- `graph/kuzu-init.mjs` — New module: `initKuzuSchema(kuzuDb)` with Document node table + 8 typed edge tables

## Decisions Made

- **ESM import form:** Used `import kuzu from 'kuzu'` (default import) — confirmed working in Plan 16-01; no createRequire needed

- **Connection ownership:** `initKuzuSchema` creates its own Connection for DDL and closes it in `finally`. The `kuzuDb` instance (owned by `server.mjs`) is never closed inside this function — caller retains full lifecycle control

- **Schema property types locked:** The 8 edge tables and their property types match `graph/relations.mjs` relationship data exactly. Do not change after Phase 16 merges.

## Deviations from Plan

None - plan executed exactly as written. `.gitignore` entry for `data/documind.kuzu/` was already present from Plan 16-01, so no change was needed there.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 16-03 (server.mjs wiring) can proceed with these confirmed artifacts:

- **`KUZU_DIR`** is exported from `config/env.mjs` — import and pass to `new kuzu.Database(KUZU_DIR)`

- **`initKuzuSchema(kuzuDb)`** is exported from `graph/kuzu-init.mjs` — call after `new kuzu.Database(KUZU_DIR)` during daemon startup

- **Import form:** `import kuzu from 'kuzu'` (default import, no createRequire)

- **Shutdown order (from Plan 16-01):** `conn.close()` then `db.close()` — in daemon context no `process.exit()` needed

---

### Phase: 16-kuzu-foundation

### Completed: 2026-04-08
