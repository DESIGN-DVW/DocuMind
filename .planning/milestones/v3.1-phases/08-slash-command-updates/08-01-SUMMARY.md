---
phase: 08-slash-command-updates
plan: "01"
subsystem: api
tags: [mcp, slash-commands, diagram-registry, figma-diagram, get_diagrams, register_diagram]

requires:
  - phase: 07-diagram-registry-completion
    provides: "register_diagram MCP tool (Tool 14) and get_diagrams MCP tool (Tool 6) in DocuMind MCP server"
  - phase: 06-mcp-intelligence-tools
    provides: "DocuMind MCP server with tool routing"

provides:
  - "/diagram-registry slash command reads from DocuMind DB via get_diagrams MCP tool"
  - "/figma-diagram Step 4 registers via register_diagram MCP tool instead of manual file edits"

affects:
  - 09-markdown-propagation
  - any phase involving slash commands or diagram workflows

tech-stack:
  added: []
  patterns:
    - "Slash commands use MCP tools as primary backend, with local file reads as fallback only"
    - "DIAGRAM-REGISTRY.md treated as generated snapshot, not editable source"

key-files:
  created: []
  modified:
    - "/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/commands/diagram-registry.md"
    - "/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/commands/figma-diagram.md"

key-decisions:
  - "DocuMind diagrams table is single source of truth; DIAGRAM-REGISTRY.md is a generated snapshot"
  - "Slash commands get primary data from MCP tools, fall back to local file reads if MCP unavailable"
  - "register_diagram auto-detects diagram_type and regenerates snapshot — no manual registry format needed"

patterns-established:
  - "MCP-first: slash commands call MCP tools before touching filesystem"
  - "Graceful degradation: fallback to local files if MCP unavailable"

requirements-completed: [SLSH-01, SLSH-02]

duration: 2min
completed: 2026-03-22
---

# Phase 8 Plan 01: Slash Command Updates Summary

**Rewired `/diagram-registry` and `/figma-diagram` to use DocuMind MCP tools (`get_diagrams` Tool 6, `register_diagram` Tool 14) as the primary backend, replacing direct file reads and manual DIAGRAM-REGISTRY.md edits**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-22T16:42:36Z
- **Completed:** 2026-03-22T16:43:56Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `/diagram-registry` now calls `get_diagrams` MCP tool for all diagram data; status counts and pending actions derived from the response array
- `/figma-diagram` Step 4 now calls `register_diagram` MCP tool with mmd_path; tool auto-detects type, inserts/updates DB, and regenerates DIAGRAM-REGISTRY.md
- Both commands retain graceful fallbacks to local file operations if MCP is unavailable
- `DIAGRAM-REGISTRY.md` correctly repositioned as generated snapshot, not source of truth

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite /diagram-registry to use get_diagrams MCP tool** - `e5073e6` (feat)
2. **Task 2: Rewrite /figma-diagram Step 4 to use register_diagram MCP tool** - `ba16013` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/commands/diagram-registry.md` — Rewrote Step 1 to call `get_diagrams` MCP; Step 2 derives counts from response array; Step 3 uses mmd_path/png_path fields; removed DocuMind integration section (now primary); updated Notes
- `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/commands/figma-diagram.md` — Added `mcp__documind__register_diagram` to allowed-tools; replaced Step 4 manual edit with `register_diagram` call; updated Step 6 report to include registry action; added fallback note; updated Notes

## Decisions Made

- `get_diagrams` with no params returns all diagrams across repos — sufficient for the registry view use case; filtering by repo remains optional
- Manual DIAGRAM-REGISTRY.md format block removed from figma-diagram (the MCP tool handles structure); moved to fallback-only prose description
- `mcp__documind__get_diagrams` added to diagram-registry allowed-tools; `mcp__documind__register_diagram` added to figma-diagram allowed-tools

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Both slash commands in RootDispatcher/commands/ are now MCP-native
- Ready for Phase 9 (markdown propagation across DVWDesign repos)
- Diagram workflow is fully wired: create (.mmd) → generate (PNG + FigJam) → register (MCP) → view (MCP)

---

*Phase: 08-slash-command-updates*
*Completed: 2026-03-22*

## Self-Check: PASSED

- FOUND: `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/commands/diagram-registry.md`
- FOUND: `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/commands/figma-diagram.md`
- FOUND: `.planning/phases/08-slash-command-updates/08-01-SUMMARY.md`
- FOUND commit: `e5073e6` (feat: rewrite /diagram-registry)
- FOUND commit: `ba16013` (feat: update /figma-diagram Step 4)
