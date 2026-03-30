---

phase: 08-slash-command-updates
plan: "02"
subsystem: slash-commands
tags: [figma-curate, global-rules, mcp-tools, diagram-registry, curate_diagram]
dependency_graph:
  requires: [05-02]
  provides: [SLSH-03, SLSH-04]
  affects: [RootDispatcher/commands/figma-curate.md, RootDispatcher/memory/global-rules.md]
tech_stack:
  added: []
  patterns: [MCP tool invocation replacing curl REST calls, single-source-of-truth declaration in global conventions]
key_files:
  created: []
  modified:

    - /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/commands/figma-curate.md

    - /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/memory/global-rules.md

decisions:

  - "/figma-curate now uses curate_diagram MCP tool (Tool 13) as the sole curation method — no curl, no manual file editing"

  - "global-rules.md declares DocuMind diagrams table as single source of truth; DIAGRAM-REGISTRY.md described as generated snapshot"

metrics:
  duration: "~1m 9s"
  completed: "2026-03-22"
  tasks_completed: 2
  files_modified: 2

---

# Phase 08 Plan 02: /figma-curate MCP Update + Global Rules Diagram Declaration Summary

**One-liner:** Rewired `/figma-curate` to use `curate_diagram` MCP tool (replacing curl + manual file edits) and updated `global-rules.md` to declare the DocuMind DB as single source of truth for diagrams.

## What Was Built

### Task 1 — Rewrite /figma-curate (commit `6417c75`)

Rewrote the `/figma-curate` slash command in `RootDispatcher/commands/figma-curate.md`:

- **Removed:** Bash from allowed-tools (no more curl needed)

- **Added:** `mcp__documind__get_diagrams` and `mcp__documind__curate_diagram` to allowed-tools

- **Step 1 — Validate:** Now calls `get_diagrams` MCP tool to find the diagram and confirm `generated` status (fallback to local DIAGRAM-REGISTRY.md if MCP unavailable)

- **Step 2 — Curate:** Single `curate_diagram` call replaces the previous 4-step process (edit registry, replace URLs, call curl, handle fallback)

- **Step 3 — Report:** Uses tool response fields (`propagation.markdown_files_updated`, `propagation.repos_affected`) directly

- **Bulk Mode:** Loops `curate_diagram` calls instead of the bulk-relink curl endpoint

- **Notes:** Replaced "update registry first, then propagate via DocuMind" with accurate description of MCP full-pipeline behavior

### Task 2 — Update global-rules.md (commit `fc27237`)

Updated `RootDispatcher/memory/global-rules.md`:

- **Diagram Registry subsection:** Opening sentence changed from "source of truth for diagram URLs" to "DocuMind `diagrams` table is the **single source of truth**; DIAGRAM-REGISTRY.md is a **generated snapshot**"

- **Relinking Protocol:** Step 3 now references `curate_diagram` MCP tool; curl endpoint block replaced with MCP tool list (`curate_diagram`, `register_diagram`, `get_diagrams`)

- **File-per-diagram note:** Updated to reference `register_diagram` MCP tool instead of manual tracking in DIAGRAM-REGISTRY.md

- **Last updated date:** Updated to 2026-03-22

## Decisions Made

1. `/figma-curate` uses `curate_diagram` MCP tool as the sole curation method — removing Bash from allowed-tools enforces this

2. `global-rules.md` now clearly declares the DB as the single source of truth, making the v3.0 architectural decision explicit in ecosystem-wide conventions

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/commands/figma-curate.md` — modified and committed (6417c75)

- [x] `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/memory/global-rules.md` — modified and committed (fc27237)

- [x] All 5 verification checks: PASS

- [x] Requirements SLSH-03 and SLSH-04 addressed

## Self-Check: PASSED
