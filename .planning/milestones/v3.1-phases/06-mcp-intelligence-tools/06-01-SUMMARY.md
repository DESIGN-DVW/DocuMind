---

phase: 06-mcp-intelligence-tools
plan: 01
subsystem: api
tags: [mcp, sqlite, documind, similarity, deviations, intelligence]

# Dependency graph

requires:

  - phase: 05-mcp-server-write-tools

    provides: daemon/mcp-server.mjs with 11 tools and existing server.tool pattern
provides:

  - get_similarities MCP read tool (Tool 7) — returns similar/duplicate document pairs with scores

  - get_deviations MCP read tool (Tool 8) — returns convention deviations with severity and file paths

affects: [07-context-profile-api, future MCP consumers]

# Tech tracking

tech-stack:
  added: []
  patterns:

    - "MCP read tool: conditions array + params array for dynamic WHERE clauses"

    - "Double-join pattern for self-referencing tables: JOIN documents d1 ON cs.doc1_id and JOIN documents d2 ON cs.doc2_id"

    - "Severity ORDER BY using CASE WHEN for priority sort (critical=1, major=2, minor=3, info=4)"

key-files:
  created: []
  modified:

    - daemon/mcp-server.mjs

key-decisions:

  - "Inserted intelligence read tools between existing read tools (Tool 6) and write tools (Tool 7+) to preserve read/write grouping"

  - "get_similarities uses content_similarities table name (not similarities) matching actual schema"

patterns-established:

  - "Dynamic WHERE clause pattern: push conditions[] and params[] separately, join at query construction"

  - "Filter parameter include_reviewed=false / include_resolved=false for defaulting to active/unreviewed items only"

requirements-completed: [MCPI-01, MCPI-02]

# Metrics

duration: 2min
completed: 2026-03-22

---

# Phase 6 Plan 1: MCP Intelligence Tools Summary

## get_similarities and get_deviations read tools added to DocuMind MCP server (11 to 13 tools) exposing similarity scores and convention deviation data to agents via SQL JOIN queries

## Performance

- **Duration:** ~2 min

- **Started:** 2026-03-22T16:09:02Z

- **Completed:** 2026-03-22T16:10:44Z

- **Tasks:** 2

- **Files modified:** 1

## Accomplishments

- `get_similarities` (Tool 7): queries `content_similarities` JOIN `documents` (twice as d1/d2), filterable by repo, min_score, include_reviewed, limit — returns `{ total, pairs }` with doc paths, repos, scores, deviation types

- `get_deviations` (Tool 8): queries `deviations` JOIN `documents` with LEFT JOIN for related doc path, filterable by repo, deviation_type (5 types), severity (4 levels), include_resolved, limit — ordered by severity priority then date

- Tool numbering updated: index_file=9, lint_file=10, fix_file=11, trigger_scan=12, curate_diagram=13

## Task Commits

Each task was committed atomically:

1. **Task 1: Add get_similarities MCP read tool** - `1d57a57` (feat)

2. **Task 2: Add get_deviations MCP read tool** - `f1de3df` (feat)

## Files Created/Modified

- `daemon/mcp-server.mjs` - Added Tools 7 and 8 (get_similarities, get_deviations); renumbered write tools 9-13

## Decisions Made

- Grouped new intelligence read tools between existing read tools and write tools to preserve logical grouping

- Used `content_similarities` as the table name (schema uses this, not `similarities`)

- Severity ORDER BY uses CASE WHEN expression for deterministic priority sort

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MCP server now exposes 13 tools including similarity and deviation intelligence

- Agents can query duplicate/similar doc pairs and convention violations via MCP protocol

- Ready for Phase 6 Plan 2 (next intelligence tools if planned)

---

### Phase: 06-mcp-intelligence-tools

### Completed: 2026-03-22
