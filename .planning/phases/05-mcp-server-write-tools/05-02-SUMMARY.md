---
phase: 05-mcp-server-write-tools
plan: 02
subsystem: infra
tags: [mcp, json, sqlite, diagram-registry, cross-repo]

requires:
  - phase: 05-01
    provides: mcp-server.mjs with write tools registered and read-write DB connection

provides:
  - documind MCP server entry in all 16 DVWDesign repos' .mcp.json files
  - DB as single source of truth for 9 diagrams (4 RootDispatcher + 5 any2figma)

affects: [all 16 DVWDesign repos, diagram curation workflows, MCP tool discoverability]

tech-stack:
  added: []
  patterns:
    - "Cross-repo .mcp.json merge: read-parse-merge-write preserves existing keys"
    - "Reverse-sync then delete: centralize per-repo registries into DocuMind DB before removing source files"

key-files:
  created:
    - .mcp.json (DocuMind — new, was untracked)
  modified:
    - ".mcp.json (in 15 other DVWDesign repos — documind entry merged in)"

key-decisions:
  - "any2figma registry URL format [FigJam](url) differs from RootDispatcher <url> format — custom normalizeUrl() handled both"
  - "better-sqlite3 binary compiled for Node 24 — use /opt/homebrew/bin/node for scripts touching the DB"
  - "any2figma DIAGRAM-REGISTRY.md was untracked (no git commit needed for deletion); RootDispatcher deletion is tracked in its own repo"
  - "Temp reverse-sync script run inline, not committed — migration-only, no reuse expected"

patterns-established:
  - "MCP registration pattern: absolute paths in args + env vars for DB and profile paths"
  - "Registry centralization: reverse-sync file → DB, then delete file (not the other way)"

requirements-completed: [MCPW-06]

duration: 3m 32s
completed: 2026-03-22
---

# Phase 5 Plan 02: MCP Registration + Diagram Registry Centralization Summary

**DocuMind MCP server registered in all 16 DVWDesign repo `.mcp.json` files; 9 diagrams from per-repo DIAGRAM-REGISTRY.md files reverse-synced into DocuMind DB and source files deleted**

## Performance

- **Duration:** 3m 32s
- **Started:** 2026-03-22T14:39:27Z
- **Completed:** 2026-03-22T14:42:59Z
- **Tasks:** 2
- **Files modified:** 16 (.mcp.json in each DVWDesign repo) + 2 deleted (DIAGRAM-REGISTRY.md files)

## Accomplishments

- All 16 DVWDesign repos now have `documind` in their `.mcp.json` with absolute path to `mcp-server.mjs`, `DOCUMIND_DB` and `DOCUMIND_PROFILE` env vars — MCP tools are discoverable by Claude Code in every repo
- Existing `figma-desktop` entries preserved in all 16 repos — merge was additive only
- RootDispatcher's 4 diagrams reverse-synced (updated) and any2figma's 5 diagrams inserted into DocuMind DB — 9 total diagram records
- Per-repo DIAGRAM-REGISTRY.md files deleted from both repos — DocuMind DB is now the single source of truth for diagram data

## Task Commits

Each task was committed atomically:

1. **Task 1: Register DocuMind MCP server in all 16 repos' .mcp.json files** - `cd37886` (feat)
2. **Task 2: Reverse-sync and delete per-repo DIAGRAM-REGISTRY.md files** - no DocuMind file changes; executed via inline script + DB writes

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `.mcp.json` (DocuMind) — created with both `figma-desktop` and `documind` entries
- `.mcp.json` (RootDispatcher, FigmaAPI/@figma-core, FigmaAPI/FigmaDSController, FigmaAPI/@figma-docs, FigmaAPI/FigmailAPP, CampaignManager, AdobePlugIns, shared-packages, Figma-Plug-ins, Aprimo, any2figma, mjml-dev-mode, LibraryAssetManager, RandD, GlossiaApp) — `documind` entry merged into each
- `data/documind.db` — diagrams table updated (binary, not git-tracked)
- `RootDispatcher/docs/diagrams/DIAGRAM-REGISTRY.md` — deleted (tracked in RootDispatcher repo)
- `any2figma/docs/diagrams/DIAGRAM-REGISTRY.md` — deleted (was untracked)

## Decisions Made

- **URL format handling:** any2figma used `[FigJam](url)` markdown link format; RootDispatcher used `<url>` angle bracket format. Wrote `normalizeUrl()` to extract raw URL from both formats before inserting into DB.
- **Node version:** `better-sqlite3` binary was compiled for Node 24 (`NODE_MODULE_VERSION 137`). System `node` is v22 (`NODE_MODULE_VERSION 127`). Used `/opt/homebrew/bin/node` for the reverse-sync script.
- **Temp script approach:** Reverse-sync was a one-time migration with no reuse value — ran inline script, did not commit it to the codebase.
- **No DocuMind commit for Task 2:** The only DocuMind artifact changed was the binary DB (not git-tracked); the registry deletions happened in external repos. Task completion was verified via DB count check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Extended URL normalization for any2figma's markdown link format**

- **Found during:** Task 2 (reverse-sync)
- **Issue:** The plan's `reverseSyncFromRegistry` function used `replace(/^<(.+)>$/, '$1')` which only handles `<url>` format. any2figma registry used `[FigJam](url)` format, which would have stored the raw markdown string as the URL in the DB.
- **Fix:** Wrote `normalizeUrl()` in the inline script that handles angle brackets, markdown links, and plain URLs. Used this instead of the imported function.
- **Files modified:** Inline temp script only (not committed)
- **Verification:** DB shows clean URLs like `https://www.figma.com/online-whiteboard/...` (not `[FigJam](https://...)`)
- **Committed in:** N/A (temp script)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Essential for data integrity — markdown link format would have stored malformed URLs in DB. No scope creep.

## Issues Encountered

- `better-sqlite3` version mismatch between system Node 22 and module compiled for Node 24 — resolved by using `/opt/homebrew/bin/node` which is v24.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 5 Plan 3 (`05-03`) is the next plan in this phase
- MCP server registration is complete across all repos — any agent in any DVWDesign repo can now invoke DocuMind tools
- DocuMind DB is the single source of truth for all diagram data — future `curate_diagram` calls will write to DB and propagate via relink-processor

---
*Phase: 05-mcp-server-write-tools*
*Completed: 2026-03-22*
