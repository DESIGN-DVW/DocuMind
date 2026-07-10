---

phase: 18-query-layer
plan: "03"
subsystem: graph
tags:

  - kuzu

  - cypher

  - graph-traversal

  - mcp

  - get_related

dependency_graph:
  requires:

    - "18-01: graph/kuzu-queries.mjs (kuzuFindRelated)"

    - "16-kuzu-foundation: kuzu.Database, KUZU_DIR"

  provides:

    - "get_related MCP tool backed by Kuzu Cypher traversal"

    - "direction=forward|reverse|both param on get_related"

  affects:

    - "MCP consumers using get_related"

tech_stack:
  added: []
  patterns:

    - "mcp-server.mjs opens own kuzu.Database (separate OS process from daemon/server.mjs — safe)"

    - "process.on('exit') closes kuzuDb gracefully in MCP process"

    - "kuzuFindRelated async call pattern: await kuzuFindRelated(kuzuDb, doc_id, hops, direction)"

key_files:
  created: []
  modified:

    - daemon/mcp-server.mjs

key_decisions:

  - "mcp-server.mjs opens its own kuzu.Database — safe because MCP runs in a separate OS process; concurrent reads OK per Kuzu WAL mode"

  - "findRelated (SQLite) import removed — only used in get_related, now fully replaced by kuzuFindRelated"

  - "direction param default is forward — backward-compatible with all existing callers"

patterns-established:

  - "MCP tools may open own Kuzu DB (read-only) without HTTP bridging — safe in separate process"

requirements-completed:

  - QUERY-02

duration: ~5min
completed: "2026-04-13"

---

# Phase 18 Plan 03: MCP get_related Kuzu Wiring Summary

## get_related MCP tool rewired from SQLite findRelated to Kuzu Cypher traversal with direction=forward|reverse|both support

## Performance

- **Duration:** ~5 min

- **Started:** 2026-04-13T00:00:00Z

- **Completed:** 2026-04-13T00:05:00Z

- **Tasks:** 1/2 (Task 2 awaits human verification)

- **Files modified:** 1

## Accomplishments

- Replaced `findRelated` (SQLite CTE graph) with `kuzuFindRelated` (Kuzu Cypher variable-length paths)

- Added `direction` param to `get_related` MCP schema — enables reverse traversal ("who references this doc?")

- Opened dedicated `kuzu.Database` in mcp-server.mjs process with proper cleanup

- Removed unused `findRelated` import from `graph/relations.mjs`

- Response contract `{ doc_id, hops, total, related: [...] }` preserved — no breaking changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Kuzu imports and Database init to mcp-server.mjs, update get_related tool** - `90f9b44` (feat)

**Plan metadata:** _(pending — awaiting checkpoint verification)_

## Files Created/Modified

- `daemon/mcp-server.mjs` - get_related tool rewired to kuzuFindRelated; kuzu import + DB init added; direction param added; findRelated removed

## Decisions Made

- `mcp-server.mjs` opens its own `kuzu.Database` — safe because the MCP process is a separate OS process from `daemon/server.mjs`. Each process holds at most one writer at a time. Read-only MCP queries use Kuzu WAL mode for concurrent safety.

- `direction` param default is `'forward'` — backward-compatible for all existing callers that don't pass direction.

- `findRelated` (SQLite graph/relations.mjs) import fully removed — it was only used in the get_related handler, no orphaned import.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all edits applied cleanly; syntax check passed; imports verified.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- QUERY-02 satisfied: get_related supports reverse traversal for "who references this doc?" queries

- Task 2 (human verification) must be completed to fully close plan 18-03

- Awaiting graph population (kuzu-sync.mjs prepare+execute fix) before results will be non-empty

- Phase 18-02 (REST /graph endpoint) and Phase 19 (text-to-Cypher) can proceed in parallel

---

### Phase: 18-query-layer

### Completed: 2026-04-13
