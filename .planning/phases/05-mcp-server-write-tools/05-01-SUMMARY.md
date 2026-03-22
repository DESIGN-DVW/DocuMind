---
phase: 05-mcp-server-write-tools
plan: "01"
subsystem: mcp-server
tags: [mcp, write-tools, sqlite, markdownlint, fix-markdown]
dependency_graph:
  requires: [04-02]
  provides: [mcp-write-tools, path-validation, read-write-db]
  affects: [daemon/mcp-server.mjs, scripts/fix-markdown.mjs]
tech_stack:
  added: [markdownlint (CJS via createRequire), fix-markdown exports]
  patterns: [two-pass markdown fix, path validation helper, WAL read-write DB]
key_files:
  created: []
  modified:
    - daemon/mcp-server.mjs
    - scripts/fix-markdown.mjs
decisions:
  - "markdownlint loaded via createRequire (CJS module) — not ES import"
  - "validatePath checks path.resolve against ctx.repoRoots with startsWith guard"
  - "fix_file two-pass: markdownlint applyFixes first, then custom fix-markdown transforms"
  - "generateDiagramSnapshot defined as module-level function above tool registrations"
  - "curate_diagram skips propagation when oldUrl is null (new diagram with no prior URL)"
  - "DB switched from readonly to read-write with WAL pragma — mcp-server now mutates DB"
metrics:
  duration: "~3m 10s"
  completed: "2026-03-22"
  tasks_completed: 2
  files_modified: 2
---

# Phase 05 Plan 01: MCP Server Write Tools Summary

**One-liner:** 5 write MCP tools (index_file, lint_file, fix_file, trigger_scan, curate_diagram) added to DocuMind MCP server with read-write WAL DB and path validation against ctx.repoRoots.

## What Was Built

Added 5 write tools to `daemon/mcp-server.mjs` alongside the existing 6 read tools, bringing the server to 11 total registered tools. The DB connection was switched from readonly to read-write with WAL journal mode. A `validatePath` helper rejects file paths outside any registered repo root, returning structured errors with suggested_action.

### Tool Inventory (6 read + 5 write = 11 total)

| # | Tool | Type | Purpose |
| -- | ---- | ---- | ------- |
| 1 | search_docs | read | FTS5 full-text search |
| 2 | get_related | read | Graph traversal N hops |
| 3 | get_keywords | read | TF-IDF keyword cloud |
| 4 | get_tree | read | Folder hierarchy |
| 5 | check_existing | read | Duplication check |
| 6 | get_diagrams | read | Diagram registry |
| 7 | index_file | write | Re-index single file + FTS5 rebuild |
| 8 | lint_file | read-intent | markdownlint + custom rules, returns issues |
| 9 | fix_file | write | Two-pass fix + re-index |
| 10 | trigger_scan | write | runScan with mode/repo |
| 11 | curate_diagram | write | relinkDiagram + propagate + snapshot |

### Key Implementation Details

**Task 1 — fix-markdown.mjs exports:** Added `export` keyword to 4 pure transform functions (`detectLanguage`, `fixLineBreaks`, `fixCodeBlockLanguages`, `fixBoldItalicToHeadingsOrLists`). The existing `main()` flow continues to call them internally — no behavior change.

**Task 2 — mcp-server.mjs write tools:**
- DB opened read-write: `new Database(DB_PATH)` + `db.pragma('journal_mode = WAL')`
- `markdownlint` loaded via `createRequire` (CJS module, not ESM-importable)
- `fix_file` two-pass: markdownlint `applyFixes` first, then `fixCodeBlockLanguages` → `fixBoldItalicToHeadingsOrLists` → `fixLineBreaks`
- `curate_diagram` calls `relinkDiagram` (DB update), `propagateRelinkAllRepos` (URL find-replace across all repo .md files), then `generateDiagramSnapshot` (writes `docs/diagrams/DIAGRAM-REGISTRY.md`)
- `REGISTRY_PATH` derived from profile JSON's `repositoryRegistryPath` field at startup
- All tool handlers wrapped in try/catch returning `{ success: false, summary, suggested_action, duration_ms }` with `isError: true`

## Commits

| Hash | Task | Description |
| ---- | ---- | ----------- |
| 2253262 | Task 1 | export 4 fix functions from fix-markdown.mjs |
| df49787 | Task 2 | add 5 write tools to MCP server with read-write DB |

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

| Check | Result |
| ----- | ------ |
| `grep -c 'server.tool' daemon/mcp-server.mjs` | 11 |
| `grep 'readonly' daemon/mcp-server.mjs` | no matches |
| `grep 'journal_mode = WAL' daemon/mcp-server.mjs` | match found |
| `grep -c 'validatePath' daemon/mcp-server.mjs` | 4 (definition + 3 tool usages) |
| 4 fix functions importable from fix-markdown.mjs | pass |
| All dependency imports resolve (markdownlint, orchestrator, relink-processor, markdown-processor) | pass |

## Self-Check: PASSED

Files confirmed:
- `daemon/mcp-server.mjs` — modified with 11 server.tool registrations
- `scripts/fix-markdown.mjs` — 4 exported functions

Commits confirmed:
- `2253262` — present in git log
- `df49787` — present in git log
