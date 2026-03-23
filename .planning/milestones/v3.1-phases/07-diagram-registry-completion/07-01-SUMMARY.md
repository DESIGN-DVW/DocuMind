---
phase: 07-diagram-registry-completion
plan: 01
subsystem: mcp
tags: [mcp, diagrams, mermaid, sqlite, orchestrator, scheduler]

requires:
  - phase: 05-mcp-server-write-tools
    provides: curate_diagram tool and generateDiagramSnapshot helper (Tool 13)

provides:
  - register_diagram MCP tool (Tool 14) with .mmd auto-type-detection and DB insert/update
  - generateDiagramSnapshot exported from orchestrator.mjs for shared use
  - Automatic DIAGRAM-REGISTRY.md regeneration after daily and weekly scheduled scans

affects:
  - 07-02 (DIAG-01/DIAG-02 completion audit if applicable)
  - Any phase extending MCP toolset beyond Tool 14

tech-stack:
  added: []
  patterns:
    - "Shared orchestrator function pattern: extract helpers to orchestrator.mjs, wrap in mcp-server for env-specific behavior (writingNow)"
    - "Non-blocking post-scan hooks: snapshot failures caught and logged, do not fail the parent scan"

key-files:
  created: []
  modified:
    - orchestrator.mjs
    - daemon/mcp-server.mjs
    - daemon/scheduler.mjs

key-decisions:
  - "generateDiagramSnapshot extracted to orchestrator.mjs as exported function; mcp-server wraps it with writingNow guard to suppress chokidar re-indexing"
  - "register_diagram uses content-based heuristics for diagram_type auto-detection (sequenceDiagram, stateDiagram, gantt, classDiagram, graph TD/LR + folder keywords)"
  - "SHA-256 source_hash enables unchanged detection — no unnecessary DB update if .mmd file content is identical"
  - "Snapshot failures in scheduler are non-fatal — caught in inner try/catch so scan completion is unaffected"

patterns-established:
  - "Tool 14 pattern: validate file exists, read content, compute hash, upsert DB, regenerate snapshot"
  - "Scheduler post-scan hook pattern: inner try/catch wraps auxiliary step after main scan logging"

requirements-completed:
  - DIAG-01
  - DIAG-02

duration: 2m 15s
completed: 2026-03-22
---

# Phase 07 Plan 01: Diagram Registry Completion Summary

**register_diagram MCP tool (Tool 14) with Mermaid type auto-detection, and automatic DIAGRAM-REGISTRY.md regeneration wired into daily and weekly cron scans**

## Performance

- **Duration:** 2 min 15 sec
- **Started:** 2026-03-22T21:43:47Z
- **Completed:** 2026-03-22T21:46:02Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `register_diagram` as Tool 14 in `mcp-server.mjs` — accepts `.mmd` path, auto-detects diagram type from content, inserts or updates the `diagrams` table, and regenerates the DIAGRAM-REGISTRY.md snapshot
- Extracted `generateDiagramSnapshot` from `mcp-server.mjs` into `orchestrator.mjs` as a proper exported function reusable by any caller
- Wired diagram snapshot generation into both the daily (2 AM) and weekly (Sunday 3 AM) scheduled scans with non-blocking error handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Add register_diagram MCP tool and extract generateDiagramSnapshot** - `148361a` (feat)
2. **Task 2: Wire snapshot generation into daily and weekly scheduled scans** - `b3dde11` (feat)

## Files Created/Modified

- `orchestrator.mjs` - Added `export async function generateDiagramSnapshot(db, rootDir)` with full table-to-markdown logic
- `daemon/mcp-server.mjs` - Replaced local function with import wrapper; added Tool 14 `register_diagram`
- `daemon/scheduler.mjs` - Updated import, added post-scan snapshot calls to daily and weekly crons, updated init log

## Decisions Made

- Extracted `generateDiagramSnapshot` to `orchestrator.mjs` rather than duplicating it; the MCP server wraps the shared function with `writingNow` tracking to prevent the chokidar file watcher from re-indexing the snapshot while it is being written.
- `register_diagram` uses `crypto.createHash('sha256')` for source hash — stable fingerprint enabling `unchanged` detection without re-writing the DB row.
- Diagram type auto-detection uses regex heuristics on content: `sequenceDiagram`, `stateDiagram`, `gantt`, `classDiagram` are definitive; `graph TD/LR` defaults to `flowchart` unless folder/directory keywords suggest `folder_tree`.
- Snapshot failures in the scheduler are non-fatal by design — the scan result and DB record are committed before the snapshot is attempted.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- DIAG-01 (auto-regenerating snapshot) and DIAG-02 (register_diagram tool) are both satisfied.
- All 14 MCP tools load without errors.
- The diagram registry pipeline is complete; any follow-on work would be in a future phase.

---

*Phase: 07-diagram-registry-completion*
*Completed: 2026-03-22*
