# Phase 5: MCP Server — Write Tools - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>

## Phase Boundary

Add autonomous document maintenance tools to the DocuMind MCP server: linting, fixing, re-indexing, triggering scans, and diagram registry management. All write operations validate paths against context profile repo roots. Register the DocuMind MCP server across all DVWDesign repos so agents everywhere can call these tools.

</domain>

<decisions>

## Implementation Decisions

### Diagram Registry Centralization

- DocuMind DB (`diagrams` table) is the **single source of truth** for all diagram data

- Single auto-generated snapshot at `DocuMind/docs/diagrams/DIAGRAM-REGISTRY.md` — all repos grouped, read-only, regenerated after any write

- Existing per-repo DIAGRAM-REGISTRY.md files: **deprecate and delete** (run one final reverse-sync first; only RootDispatcher and any2figma have them)

- `register_diagram` auto-detects `diagram_type` from .mmd content (first line: graph, flowchart, sequenceDiagram, etc.)

- `curate_diagram` sets curated URL **and** propagates old→new URL across all repos in one call (folds relink_diagram into curate_diagram)

- URL propagation leaves changes **unstaged** — agent or user reviews and commits

### Write Tool Scope & Autonomy

- **Separate tools**: `lint_file` (read-only, reports issues) and `fix_file` (applies fixes) — matches CLI pattern

- `trigger_scan` defaults to **incremental** (changed files only, fast); accepts optional `mode='full'` for deep scan

- All write tools validate paths against **context profile repo roots only** — same restriction as Phase 4 read tools

- `relink_diagram` requirement (MCPW-05) is **folded into `curate_diagram`** — one tool sets URL + propagates

### Error Responses & Feedback

- Every response is **structured JSON**: `{ success, summary (1-line), details (array), duration_ms }`

- Failed operations include `suggested_action` field — helps agents self-correct (e.g., "Run trigger_scan first to index the file")

- `fix_file` returns: `{ fixes_applied: ['Table Separator Spacing', ...], file, lines_changed }`

- `lint_file` returns: `{ issues: [{ line, rule, message, fixable }] }` — agents know what can be auto-fixed

### Cross-Repo MCP Registration

- Add `documind` entry to **each repo's `.mcp.json`** — explicit, auditable

- Use **absolute paths** to `mcp-server.mjs` and `documind.db` (same pattern as Phase 4)

- **All tools available to all repos** — path validation prevents cross-repo damage

- Registration is **part of this phase** — tools and registration ship together

### Claude's Discretion

- Exact error codes and message wording

- Whether to batch lint issues by file section or return flat list

- Internal retry logic for scan operations

- Snapshot markdown formatting details

</decisions>

<specifics>

## Specific Ideas

- The approved plan (Section F in the plan file) has the full architecture: MCP write tools → command rewrites → per-repo deprecation

- `curate_diagram` should call existing `relinkDiagram()` + `propagateRelinkAllRepos()` from `processors/relink-processor.mjs` — reuse, don't rewrite

- MCP server currently opens DB with `{ readonly: true }` — must be removed and WAL pragma added for write tools

- The `/diagram-registry` slash command (symlinked to 16 repos from RootDispatcher) needs rewriting to be MCP-first after write tools exist

- Update `RootDispatcher/memory/global-rules.md` to declare DB as single source of truth for diagrams

</specifics>

<deferred>

## Deferred Ideas

- Updating `/figma-diagram` and `/figma-curate` slash commands to use MCP tools — depends on write tools existing first; could be a quick follow-up dispatch

- Auto-commit propagated URL changes per repo — user chose unstaged for now; revisit if too much manual work

- Per-repo read-only snapshots of diagram registry — user chose delete; revisit if teams miss local reference

</deferred>

---

### Phase: 05-mcp-server-write-tools

### Context gathered: 2026-03-22
