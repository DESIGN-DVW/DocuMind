# Phase 5: MCP Server — Write Tools - Research

**Researched:** 2026-03-22
**Domain:** MCP stdio write tools + markdownlint Node.js API + orchestrator integration + cross-repo .mcp.json registration
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Diagram Registry Centralization

- DocuMind DB (`diagrams` table) is the **single source of truth** for all diagram data

- Single auto-generated snapshot at `DocuMind/docs/diagrams/DIAGRAM-REGISTRY.md` — all repos grouped, read-only, regenerated after any write

- Existing per-repo DIAGRAM-REGISTRY.md files: **deprecate and delete** (run one final reverse-sync first; only RootDispatcher and any2figma have them)

- `register_diagram` auto-detects `diagram_type` from .mmd content (first line: graph, flowchart, sequenceDiagram, etc.)

- `curate_diagram` sets curated URL **and** propagates old→new URL across all repos in one call (folds relink_diagram into curate_diagram)

- URL propagation leaves changes **unstaged** — agent or user reviews and commits

#### Write Tool Scope & Autonomy

- **Separate tools**: `lint_file` (read-only, reports issues) and `fix_file` (applies fixes) — matches CLI pattern

- `trigger_scan` defaults to **incremental** (changed files only, fast); accepts optional `mode='full'` for deep scan

- All write tools validate paths against **context profile repo roots only** — same restriction as Phase 4 read tools

- `relink_diagram` requirement (MCPW-05) is **folded into `curate_diagram`** — one tool sets URL + propagates

#### Error Responses & Feedback

- Every response is **structured JSON**: `{ success, summary (1-line), details (array), duration_ms }`

- Failed operations include `suggested_action` field — helps agents self-correct (e.g., "Run trigger_scan first to index the file")

- `fix_file` returns: `{ fixes_applied: ['Table Separator Spacing', ...], file, lines_changed }`

- `lint_file` returns: `{ issues: [{ line, rule, message, fixable }] }` — agents know what can be auto-fixed

#### Cross-Repo MCP Registration

- Add `documind` entry to **each repo's `.mcp.json`** — explicit, auditable

- Use **absolute paths** to `mcp-server.mjs` and `documind.db` (same pattern as Phase 4)

- **All tools available to all repos** — path validation prevents cross-repo damage

- Registration is **part of this phase** — tools and registration ship together

### Claude's Discretion

- Exact error codes and message wording

- Whether to batch lint issues by file section or return flat list

- Internal retry logic for scan operations

- Snapshot markdown formatting details

### Deferred Ideas (OUT OF SCOPE)

- Updating `/figma-diagram` and `/figma-curate` slash commands to use MCP tools — depends on write tools existing first; could be a quick follow-up dispatch

- Auto-commit propagated URL changes per repo — user chose unstaged for now; revisit if too much manual work

- Per-repo read-only snapshots of diagram registry — user chose delete; revisit if teams miss local reference

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |

| --- | --- | --- |

| MCPW-01 | `index_file` tool — re-index a single file after edit | `indexMarkdown(db, filePath, repository, ctx)` already exported from `processors/markdown-processor.mjs`; MCP tool wraps it with path validation + FTS5 rebuild |

| MCPW-02 | `lint_file` tool — lint a file and return issues | `markdownlint` 0.36.1 (already installed) provides `sync()` API; issues have `ruleNames`, `lineNumber`, `fixInfo` (null = not auto-fixable); config loaded from `config/.markdownlint.json` |

| MCPW-03 | `fix_file` tool — auto-fix a file's markdown issues | `markdownlint.applyFixes(content, issues)` applies all auto-fixable issues; `fix-markdown.mjs` covers non-auto-fixable patterns (code block language detection, bold-italic conversion); write file, re-index |

| MCPW-04 | `trigger_scan` tool — trigger incremental or full scan via orchestrator | `runScan(db, ctx, { mode, repo })` exported from `orchestrator.mjs`; supports 'incremental', 'full', 'deep'; MCP server must open DB read-write (remove `readonly: true`) |

| MCPW-05 | `relink_diagram` (folded into `curate_diagram`) — set curated FigJam URL and propagate | `relinkDiagram()` + `propagateRelinkAllRepos()` already exported from `processors/relink-processor.mjs`; wraps in one MCP tool; leaves changes unstaged |

| MCPW-06 | Path validation against `ctx.repoRoots` for all write operations | `ctx.repoRoots` array (from `loadProfile()`) contains `{ name, path }` entries; validate with `path.startsWith(root.path)` check before any file I/O |

</phase_requirements>

---

## Summary

Phase 5 adds 5 write tools to the existing `daemon/mcp-server.mjs` and registers that server in all 16 DVWDesign repos' `.mcp.json` files. The critical prerequisite is removing `{ readonly: true }` from the DB connection in `mcp-server.mjs` and adding WAL pragma — the read-only connection blocks all write tool operations including `trigger_scan` (which calls `runScan` which writes to DB).

All the heavy machinery already exists. `lint_file` uses `markdownlint` 0.36.1 (already a transitive dependency, verified installed). `fix_file` combines `markdownlint.applyFixes()` for rule-compliant auto-fixes with the custom fix functions from `fix-markdown.mjs` for non-auto-fixable patterns (code block language detection, bold-italic conversion). `index_file` calls `indexMarkdown()` directly. `trigger_scan` delegates to `runScan()` from `orchestrator.mjs`. `curate_diagram` calls `relinkDiagram()` + `propagateRelinkAllRepos()` from `relink-processor.mjs`.

The registration task requires adding a `documind` entry to 15 repos' `.mcp.json` files (DocuMind's own `.mcp.json` already exists at `/Users/Shared/htdocs/github/DVWDesign/DocuMind/.mcp.json`). All 16 repos' `.mcp.json` files were confirmed to exist on disk. The snapshot task writes a single `docs/diagrams/DIAGRAM-REGISTRY.md` to DocuMind after any diagram write, and runs a one-time reverse-sync + delete of the two per-repo DIAGRAM-REGISTRY.md files (RootDispatcher and any2figma).

**Primary recommendation:** Add 5 write tools to `mcp-server.mjs`, flip DB from readonly to read-write with WAL pragma, implement path validation helper, register in 15 remaining repos' `.mcp.json` files, and write the one-time deprecation script for per-repo registries.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |

| --- | --- | --- | --- |

| `markdownlint` | `0.36.1` (already installed) | Lint API (`sync()`, `applyFixes()`) | Already a transitive dep of `markdownlint-cli2`; confirmed installed at `node_modules/markdownlint/`; exposes CJS `sync`, `applyFixes` API |

| `markdownlint-cli2` | `^0.15.0` (already installed) | Config resolution, custom rule loading | Already installed; provides config merging and custom rule loading pipeline — reuse its config loading rather than re-implementing |

| `better-sqlite3` | `^12.6.2` (existing) | DB writes for index_file, trigger_scan, curate_diagram | Must open read-write (not readonly) in mcp-server.mjs for Phase 5 |

| `@modelcontextprotocol/sdk` | `^1.27.1` (existing) | MCP server + stdio transport | Already installed from Phase 4 |

| `zod` | `^3.25.0` (existing) | Tool schema validation | Already installed |

### Supporting

| Library | Version | Purpose | When to Use |

| --- | --- | --- | --- |

| `fs/promises` | Node built-in | File read/write for fix_file, curate_diagram propagation | All file I/O for write tools |

| `path` | Node built-in | Path validation against `ctx.repoRoots` | Security boundary enforcement |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |

| --- | --- | --- |

| `markdownlint` sync API | Shell-exec `markdownlint-cli2` | Subprocess adds latency, parsing overhead, and no fixInfo access; sync API is synchronous and returns structured objects |

| `markdownlint.applyFixes()` | Re-implement fix logic from scratch | `applyFixes()` handles overlapping edits correctly (sorted by line/column, applied in reverse); hand-rolling this is error-prone |

| Reuse functions from `fix-markdown.mjs` | Call `node scripts/fix-markdown.mjs` via subprocess | Import the fix functions directly (`detectLanguage`, `fixCodeBlockLanguages`, `fixBoldItalicToHeadingsOrLists`, `fixLineBreaks`) — no subprocess, no stdout parsing |

**Installation:** No new packages needed. All dependencies are already installed.

---

## Architecture Patterns

### Current State of mcp-server.mjs

The existing file (Phase 4) has 6 read tools and opens the DB with `{ readonly: true }`. Phase 5 adds 5 write tools to the same file. Key structural changes needed:

1. Remove `{ readonly: true }` from the DB constructor

2. Add `db.pragma('journal_mode = WAL')` after DB open

3. Import additional modules: `markdownlint`, `fs/promises`, orchestrator, relink-processor, markdown-processor

4. Add path validation helper function (used by all write tools)

5. Register 5 new tools with `server.tool()`

### Recommended Structure Within mcp-server.mjs

```text

// Line 1: stdout redirect (existing)
// Imports (existing + new)
// DB open — READ-WRITE with WAL pragma (CHANGED from Phase 4)
// ctx = await loadProfile() (existing)
// server = new McpServer() (existing)
// --- Read Tools (existing, unchanged) ---
// Tool 1-6: search_docs, get_related, get_keywords, get_tree, check_existing, get_diagrams
// --- Write Tools (new) ---
// Helper: validatePath(filePath, ctx) — throws if path is not under any repoRoot
// Tool 7: index_file
// Tool 8: lint_file
// Tool 9: fix_file
// Tool 10: trigger_scan
// Tool 11: curate_diagram
// --- Transport start (existing) ---

```

### Pattern 1: Path Validation Helper

**What:** All write tools call this before touching the filesystem.

**When to use:** Every write tool that accepts a file path parameter.

#### Implementation:

```javascript

/**

 * Validate that a file path is under a known repo root.

 * @param {string} filePath - Absolute path to validate

 * @param {object} ctx - Context profile with repoRoots

 * @returns {{ valid: boolean, repoName: string|null }}

 */
function validatePath(filePath, ctx) {
  const resolved = path.resolve(filePath);
  for (const root of ctx.repoRoots) {
    if (resolved.startsWith(root.path + '/') || resolved === root.path) {
      return { valid: true, repoName: root.name };
    }
  }
  return { valid: false, repoName: null };
}

```

#### Usage in every write tool:

```javascript

const { valid, repoName } = validatePath(file, ctx);
if (!valid) {
  return {
    content: [{ type: 'text', text: JSON.stringify({
      success: false,
      summary: 'Path rejected: not under any known repo root',
      details: [`${file} is not within any of ${ctx.repoRoots.length} registered repo roots`],
      suggested_action: 'Ensure the file path is absolute and within a registered repository',
      duration_ms: Date.now() - startMs,
    }) }],
    isError: true,
  };
}

```

### Pattern 2: DB Open Read-Write with WAL

**Critical change from Phase 4:** Remove `{ readonly: true }`. Add WAL pragma.

```javascript

// BEFORE (Phase 4):
const db = new Database(DB_PATH, { readonly: true });
db.pragma('foreign_keys = ON');

// AFTER (Phase 5):
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

```

**Why WAL matters:** `server.mjs` (HTTP daemon) also holds an open connection. WAL mode allows concurrent readers while one writer is active — critical so the MCP server's writes don't block the HTTP daemon's reads.

### Pattern 3: Lint + Fix with markdownlint Node.js API

The `markdownlint` package is a CJS module. Import it with `createRequire` from ESM:

```javascript

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { sync: markdownlintSync, applyFixes } = require('markdownlint');

```

#### lint_file flow:

```javascript

const content = await fs.readFile(file, 'utf-8');
const config = JSON.parse(await fs.readFile(MARKDOWNLINT_CONFIG, 'utf-8'));
const results = markdownlintSync({ strings: { [file]: content }, config });
const issues = (results[file] || []).map(issue => ({
  line: issue.lineNumber,
  rule: issue.ruleNames[0],
  message: issue.ruleDescription,
  detail: issue.errorDetail,
  fixable: issue.fixInfo !== null,
}));

```

#### fix_file flow (two-pass):

```javascript

// Pass 1: markdownlint auto-fixable rules (MD009 trailing spaces, MD010 tabs, etc.)
const issues = markdownlintSync({ strings: { [file]: content }, config })[file] || [];
const pass1 = applyFixes(content, issues);

// Pass 2: custom fixes from fix-markdown.mjs (code block languages, bold-italic conversion)
// Import the fix functions directly — they are pure string transforms
const pass2Lines = fixCodeBlockLanguages(pass1.split('\n'));
const pass3Lines = fixBoldItalicToHeadingsOrLists(pass2Lines);
const pass4Lines = fixLineBreaks(pass3Lines);
const finalContent = pass4Lines.join('\n');

```

**Key finding:** `markdownlint.applyFixes()` only applies issues where `fixInfo !== null`. MD040 (missing code block language) does NOT have `fixInfo` in markdownlint 0.36.1 — it is not auto-fixable by the library. The custom `fixCodeBlockLanguages()` from `fix-markdown.mjs` handles MD040 by content-based language detection. This two-pass approach covers all patterns.

### Pattern 4: trigger_scan Calling orchestrator.mjs

`runScan` is already exported from `orchestrator.mjs`. The MCP tool wraps it:

```javascript

// mcp-server.mjs already imports nothing from orchestrator — add import:
import { runScan } from '../orchestrator.mjs';

// Tool handler:
const startMs = Date.now();
const result = await runScan(db, ctx, { mode, repo: repo || null });
return { content: [{ type: 'text', text: JSON.stringify({
  success: true,
  summary: `${mode} scan complete: ${result.added} added, ${result.updated} updated`,
  details: [result],
  duration_ms: result.durationMs,
}) }] };

```

**Mode mapping:** `trigger_scan` accepts `mode: 'incremental' | 'full'` (no 'deep' exposed — deep is too slow for on-demand MCP call). Default: `'incremental'`.

### Pattern 5: curate_diagram

Both functions needed are already exported from `processors/relink-processor.mjs`:

- `relinkDiagram(db, name, curatedUrl)` — updates DB

- `propagateRelinkAllRepos(db, oldUrl, newUrl, registryPath)` — find-replace in all repo .md files

The `registryPath` argument is the path to `repository-registry.json`. This is available from the context profile: `ctx.repoRoots` is built from the registry. The registry path itself can be resolved from the profile file path — it is stored in `validated.repositoryRegistryPath` relative to the profile file. This needs to be surfaced in the ctx object or re-derived at tool call time.

**Snapshot generation:** After `relinkDiagram()`, regenerate `DocuMind/docs/diagrams/DIAGRAM-REGISTRY.md` from the diagrams table (all repos grouped). This is a new function, not currently in `relink-processor.mjs`.

### Pattern 6: Cross-Repo .mcp.json Registration

All 16 repos' `.mcp.json` files are confirmed to exist at `/Users/Shared/htdocs/github/DVWDesign/{repo}/.mcp.json`. The DocuMind `.mcp.json` already has the `documind` entry (from Phase 4 Plan 2). The remaining 15 repos each need:

```json

{
  "mcpServers": {
    "documind": {
      "command": "node",
      "args": ["/Users/Shared/htdocs/github/DVWDesign/DocuMind/daemon/mcp-server.mjs"],
      "env": {
        "DOCUMIND_DB": "/Users/Shared/htdocs/github/DVWDesign/DocuMind/data/documind.db",
        "DOCUMIND_PROFILE": "/Users/Shared/htdocs/github/DVWDesign/DocuMind/config/profiles/dvwdesign.json"
      }
    }
  }
}

```

Each existing `.mcp.json` may already have other MCP servers (e.g., figma-desktop, shadcn, mongodb). The `documind` key must be **merged in** without overwriting existing entries. Read → parse → merge → write.

#### Confirmed repos with existing .mcp.json (15 to update):

1. RootDispatcher

2. FigmaAPI/@figma-core

3. FigmaAPI/FigmaDSController

4. FigmaAPI/@figma-docs

5. FigmaAPI/FigmailAPP

6. CampaignManager

7. AdobePlugIns

8. shared-packages

9. Figma-Plug-ins

10. Aprimo

11. any2figma

12. mjml-dev-mode

13. LibraryAssetManager

14. RandD

15. GlossiaApp

**DocuMind already has** `documind` in its `.claude/mcp.json` (Phase 4), and its root `.mcp.json` only has `figma-desktop`. The root `.mcp.json` (at `/Users/Shared/htdocs/github/DVWDesign/DocuMind/.mcp.json`) also needs the `documind` entry.

### Anti-Patterns to Avoid

- **Opening DB readonly then calling write tools:** `better-sqlite3` with `{ readonly: true }` throws `SQLITE_READONLY` on any write statement including FTS5 rebuild. Must remove `readonly: true`.

- **Importing orchestrator.mjs without redirecting console.log first:** `orchestrator.mjs` uses `console.log()` extensively. The stdout redirect at line 1 of `mcp-server.mjs` covers this — it runs before all imports. Do NOT place the redirect after any import.

- **Not rebuilding FTS5 after index_file:** `indexMarkdown()` does NOT call FTS5 rebuild — it's the orchestrator's job. The `index_file` MCP tool must call `db.prepare("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')").run()` after indexing a file. (The orchestrator's `rebuildFTS()` is not exported — implement inline or extract to a shared utility.)

- **Calling `propagateRelinkAllRepos` without the registryPath:** The function requires a path to `repository-registry.json`. This is NOT directly on `ctx` — it must be derived from the profile file or hardcoded from `DB_PATH`. Most reliable: derive it from the profile path using the same logic as `context/loader.mjs`.

- **Overwriting .mcp.json files wholesale:** Each `.mcp.json` has existing servers. Parse → merge → write to preserve existing entries.

- **Removing `readonly: true` without WAL pragma:** On a live system where `server.mjs` holds a WAL-mode connection, a new connection without WAL pragma defaults to DELETE mode and causes `SQLITE_BUSY` when both connections try to write. WAL pragma must be set.

---

## What Already Exists (Don't Rebuild)

| Write Tool | Existing Code | Location | What Remains |

| --- | --- | --- | --- |

| `index_file` | `indexMarkdown(db, filePath, repository, ctx)` | `processors/markdown-processor.mjs:129` | Path validation + FTS5 rebuild + repo name derivation |

| `lint_file` | `markdownlint.sync()` | `node_modules/markdownlint/` | Load config, map result shape to `{ line, rule, message, fixable }` |

| `fix_file` | `applyFixes()` + `fixCodeBlockLanguages()`, `fixBoldItalicToHeadingsOrLists()`, `fixLineBreaks()` | `node_modules/markdownlint/` + `scripts/fix-markdown.mjs` | Import fix functions, two-pass apply, write file, re-index |

| `trigger_scan` | `runScan(db, ctx, { mode, repo })` | `orchestrator.mjs:637` | Thin MCP wrapper with mode validation |

| `curate_diagram` | `relinkDiagram()` + `propagateRelinkAllRepos()` | `processors/relink-processor.mjs:45,87` | Snapshot generation + MCP wrapper |

**Key insight:** The total new code is thin MCP wrappers around already-implemented logic. The bulk of Phase 5 is integration (path validation, DB write-mode, snapshot generation) and registration (15 `.mcp.json` file edits).

---

## Tool Specifications

### `index_file` (MCPW-01)

#### Input schema:

- `file: string` — Absolute path to the markdown file to re-index

#### Output shape:

```json

{
  "success": true,
  "summary": "Indexed FILENAME — 1 file updated",
  "details": [{ "file": "...", "repository": "DocuMind", "action": "updated" }],
  "duration_ms": 45
}

```

#### Implementation notes:

- Validate path → derive `repoName` from `ctx.repoRoots` match

- Call `indexMarkdown(db, file, repoName, ctx)`

- Call FTS5 rebuild inline: `db.prepare("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')").run()`

- Return structured JSON

### `lint_file` (MCPW-02)

#### Input schema:

- `file: string` — Absolute path to the markdown file to lint

#### Output shape:

```json

{
  "success": true,
  "summary": "3 issues found in FILENAME (2 fixable)",
  "issues": [
    { "line": 12, "rule": "MD040", "message": "Fenced code blocks should have a language specified", "detail": null, "fixable": false },
    { "line": 5, "rule": "MD009", "message": "Trailing spaces", "detail": "Expected: 0 or 2; Actual: 3", "fixable": true }
  ],
  "total": 3,
  "fixable_count": 2,
  "duration_ms": 12
}

```

#### Implementation notes:

- Config loaded from `config/.markdownlint.json` relative to DocuMind ROOT

- Custom rules in `config/rules/` (two `.cjs` files found: `force-align-table-columns.cjs`, `table-separator-spacing.cjs`) — pass to markdownlint via `customRules` option

- `fixable: issue.fixInfo !== null` — MD040 is not auto-fixable; MD009, MD010, MD012 are

### `fix_file` (MCPW-03)

#### Input schema:

- `file: string` — Absolute path to the markdown file to fix

#### Output shape:

```json

{
  "success": true,
  "summary": "Fixed FILENAME — 3 fixes applied, 8 lines changed",
  "fixes_applied": ["MD009 Trailing Spaces", "code-block-language-detection", "bold-italic-conversion"],
  "file": "/absolute/path/to/file.md",
  "lines_changed": 8,
  "duration_ms": 35
}

```

#### Implementation notes:

- Two-pass fix: markdownlint `applyFixes()` then custom fix functions from `fix-markdown.mjs`

- Import fix functions directly from `fix-markdown.mjs` (they are exported as named functions: `fixCodeBlockLanguages`, `fixBoldItalicToHeadingsOrLists`, `fixLineBreaks`)

- Write file only if content changed

- Call `indexMarkdown()` + FTS5 rebuild after successful write (keeps DB in sync with disk)

### `trigger_scan` (MCPW-04)

#### Input schema:

- `mode: 'incremental' | 'full'` (default: `'incremental'`)

- `repo: string?` — optional repo name to limit scan; omit for all repos

#### Output shape:

```json

{
  "success": true,
  "summary": "Incremental scan complete: 3 updated, 0 added, 42 skipped",
  "details": [{ "mode": "incremental", "repo": null, "documentsFound": 45, "added": 0, "updated": 3, "skipped": 42, "durationMs": 1200 }],
  "duration_ms": 1200
}

```

#### Implementation notes:

- `mode='full'` maps to `runScan(db, ctx, { mode: 'full', repo })` — not 'deep' (too slow)

- `runScan` handles all console.log internally — already redirected by mcp-server.mjs line 1

### `curate_diagram` (MCPW-05, satisfies MCPW-05)

#### Input schema:

- `name: string` — Diagram name (must match `diagrams.name` column in DB)

- `curated_url: string` — New FigJam URL to set as curated

#### Output shape:

```json

{
  "success": true,
  "summary": "Diagram 'auth-flow' curated — URL propagated to 3 files across 2 repos",
  "details": {
    "diagram": "auth-flow",
    "old_url": "https://www.figma.com/board/old...",
    "new_url": "https://www.figma.com/board/new...",
    "propagated": { "DocuMind": ["docs/arch.md"], "RootDispatcher": ["docs/overview.md", ".planning/ARCH.md"] }
  },
  "snapshot_written": "/Users/Shared/htdocs/github/DVWDesign/DocuMind/docs/diagrams/DIAGRAM-REGISTRY.md",
  "duration_ms": 280
}

```

#### Implementation notes:

- `relinkDiagram(db, name, curatedUrl)` — returns `{ id, oldUrl, repository }`; null if not found

- `propagateRelinkAllRepos(db, oldUrl, newUrl, registryPath)` — needs `registryPath` for `repository-registry.json`

- Snapshot: query `SELECT * FROM diagrams ORDER BY repository, name` → generate markdown table → write to `DocuMind/docs/diagrams/DIAGRAM-REGISTRY.md`

- Changes left unstaged (propagation modifies .md files in repos; user or agent commits)

---

## Key Implementation Details

### registryPath Derivation for curate_diagram

`propagateRelinkAllRepos()` requires the path to `repository-registry.json`. The context loader resolves this from the profile file at startup. In `mcp-server.mjs`, the profile path is known (`process.env.DOCUMIND_PROFILE`). The profile JSON contains `repositoryRegistryPath` (relative to the profile file).

**Simplest approach:** Re-read the profile JSON at MCP server startup to extract `repositoryRegistryPath` and resolve it to an absolute path. Store as module-level constant `REGISTRY_PATH`. This avoids modifying the frozen `ctx` object.

```javascript

const profileRaw = JSON.parse(await fs.readFile(profileFilePath, 'utf-8'));
const REGISTRY_PATH = path.resolve(path.dirname(profileFilePath), profileRaw.repositoryRegistryPath);

```

### FTS5 Rebuild After Single-File Index

`indexMarkdown()` does not call FTS5 rebuild — that is the orchestrator's responsibility. For single-file `index_file` and `fix_file` tools, rebuild inline:

```javascript

db.prepare("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')").run();

```

This is safe and fast for single-file operations. For `trigger_scan`, `runScan()` handles FTS5 rebuild internally.

### Custom Rules in lint_file

Two custom markdownlint rules exist in `config/rules/`:

- `force-align-table-columns.cjs`

- `table-separator-spacing.cjs`

These must be passed to `markdownlint.sync()` via the `customRules` option:

```javascript

const customRules = [
  require(path.join(ROOT, 'config/rules/force-align-table-columns.cjs')),
  require(path.join(ROOT, 'config/rules/table-separator-spacing.cjs')),
];
const results = markdownlintSync({ strings: { [file]: content }, config, customRules });

```

### Per-Repo DIAGRAM-REGISTRY.md Deprecation

One-time task within this phase:

1. Run `reverseSyncFromRegistry(db, 'RootDispatcher', repoPath)` to sync any file-only data to DB

2. Run `reverseSyncFromRegistry(db, 'any2figma', repoPath)` for the other registry

3. Delete the files: `docs/diagrams/DIAGRAM-REGISTRY.md` in both repos

4. Write the consolidated `DocuMind/docs/diagrams/DIAGRAM-REGISTRY.md`

`reverseSyncFromRegistry()` is already exported from `relink-processor.mjs`.

### Tool Count

Phase 4: 6 read tools. Phase 5: 5 write tools. Total: 11 tools. Well within Cursor's 40-tool hard limit and leaves room for any future additions.

---

## Common Pitfalls

### Pitfall 1: DB Readonly Blocks All Write Tools

**What goes wrong:** Leaving `{ readonly: true }` in `new Database(DB_PATH, { readonly: true })` causes every write tool to throw `SQLITE_READONLY: attempt to write a readonly database` at runtime. This will not fail at server startup — only when a write tool is called.

**Why it happens:** `readonly: true` was correct for Phase 4 read-only tools. Phase 5 requires writes.

**How to avoid:** Remove `{ readonly: true }` from the DB constructor. Add `db.pragma('journal_mode = WAL')`. The FTS5 rebuild in `index_file` and `fix_file` is also a write operation.

**Warning signs:** All write tools return SQLITE_READONLY errors; read tools continue working fine.

### Pitfall 2: orchestrator.mjs console.log Pollution Risk

**What goes wrong:** `orchestrator.mjs` has many `console.log()` calls (8+ confirmed). When `trigger_scan` calls `runScan()`, those log calls fire. If stdout redirect is not line 1 of `mcp-server.mjs`, they pollute the JSON-RPC wire.

**Why it happens:** New imports added in Phase 5 (orchestrator, relink-processor, markdown-processor) all have `console.log` calls.

**How to avoid:** The existing Phase 4 line 1 redirect `console.log = (...args) => process.stderr.write(args.join(' ') + '\n')` already covers this — it runs before all module imports by ESM hoisting order. Do NOT move or remove it.

**Warning signs:** MCP Inspector shows "unexpected token" when calling trigger_scan but not when calling read tools.

### Pitfall 3: markdownlint is CJS in an ESM Module

**What goes wrong:** `import markdownlint from 'markdownlint'` fails with `ERR_REQUIRE_ESM` or similar because `markdownlint` is a CJS module without ESM exports.

**Why it happens:** `mcp-server.mjs` uses `"type": "module"` (ESM). `markdownlint` 0.36.1 is CJS-only.

**How to avoid:** Use `createRequire`:

```javascript

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { sync: markdownlintSync, applyFixes } = require('markdownlint');

```

**Warning signs:** Server crashes on startup with `Cannot use import statement in a module` or `require is not defined`.

### Pitfall 4: fix_file Without Re-indexing Leaves DB Stale

**What goes wrong:** `fix_file` writes changed content to disk but the DB still has the old content, old content_hash, and old lint issues. Subsequent `lint_file` calls on the same file return stale issues.

**Why it happens:** File writes and DB writes are decoupled — there is no hook that auto-triggers re-indexing from `mcp-server.mjs`.

**How to avoid:** Always call `indexMarkdown(db, file, repoName, ctx)` + FTS5 rebuild after writing the fixed file. The chokidar watcher in `daemon/watcher.mjs` would also pick this up if running, but the MCP server should not rely on the watcher being active.

**Warning signs:** `lint_file` after `fix_file` still reports issues that were fixed.

### Pitfall 5: .mcp.json Merge Overwrites Existing Servers

**What goes wrong:** Writing a new `.mcp.json` with only the `documind` entry removes existing servers (figma-desktop, shadcn, mongodb, etc.) from repos that already have them.

**Why it happens:** JSON.stringify of a new object discards the existing content.

**How to avoid:** Always read-parse-merge-write: `const existing = JSON.parse(await fs.readFile(path)); existing.mcpServers.documind = documindEntry; await fs.writeFile(path, JSON.stringify(existing, null, 2))`.

**Warning signs:** Figma Desktop MCP or other servers stop working in repos after Phase 5 registration.

### Pitfall 6: registryPath Not Available in curate_diagram

**What goes wrong:** `propagateRelinkAllRepos()` receives `undefined` as `registryPath`, which causes `fs.readFile(undefined)` to throw `TypeError`.

**Why it happens:** `ctx` is frozen and does not expose `repositoryRegistryPath`. The relink processor needs it but `loadProfile()` does not return it.

**How to avoid:** Derive `REGISTRY_PATH` at module startup by reading the profile JSON directly (separate from `loadProfile()`). Store as module-level constant. See "registryPath Derivation" above.

---

## Code Examples

### DB Open (Phase 5 version)

```javascript

// Source: direct codebase inspection of mcp-server.mjs + better-sqlite3 docs
const db = new Database(DB_PATH); // No readonly:true
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

```

### markdownlint CJS Import in ESM

```javascript

// Source: Node.js docs for createRequire + markdownlint package inspection
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { sync: markdownlintSync, applyFixes } = require('markdownlint');

```

### lint_file Tool Registration

```javascript

server.tool(
  'lint_file',
  'Lint a markdown file using DocuMind markdownlint config. Returns all issues with line numbers, rule codes, and whether each issue is auto-fixable. Use before fix_file to understand what will be changed.',
  {
    file: z.string().describe('Absolute path to the markdown file to lint'),
  },
  async ({ file }) => {
    const startMs = Date.now();
    const { valid } = validatePath(file, ctx);
    if (!valid) { /* ... error response ... */ }

    const content = await fs.readFile(file, 'utf-8');
    const config = JSON.parse(await fs.readFile(MARKDOWNLINT_CONFIG_PATH, 'utf-8'));
    const customRules = [require(RULES_DIR + '/force-align-table-columns.cjs'), require(RULES_DIR + '/table-separator-spacing.cjs')];
    const raw = markdownlintSync({ strings: { [file]: content }, config, customRules });
    const issues = (raw[file] || []).map(i => ({
      line: i.lineNumber,
      rule: i.ruleNames[0],
      message: i.ruleDescription,
      detail: i.errorDetail,
      fixable: i.fixInfo !== null,
    }));
    const fixableCount = issues.filter(i => i.fixable).length;
    return { content: [{ type: 'text', text: JSON.stringify({
      success: true,
      summary: `${issues.length} issue${issues.length !== 1 ? 's' : ''} found (${fixableCount} auto-fixable)`,
      issues,
      total: issues.length,
      fixable_count: fixableCount,
      duration_ms: Date.now() - startMs,
    }) }] };
  }
);

```

### fix_file Two-Pass Pattern

```javascript

// Pass 1: markdownlint auto-fixable rules
const issues1 = markdownlintSync({ strings: { [file]: content }, config, customRules })[file] || [];
const pass1Content = applyFixes(content, issues1);
const fixedRules = issues1.filter(i => i.fixInfo !== null).map(i => i.ruleNames[0]);

// Pass 2: custom fix-markdown.mjs functions (pure string transforms)
let lines = pass1Content.split('\n');
lines = fixCodeBlockLanguages(lines);
lines = fixBoldItalicToHeadingsOrLists(lines);
lines = fixLineBreaks(lines);
const finalContent = lines.join('\n');

// Write only if changed
const changed = finalContent !== content;
if (changed) {
  await fs.writeFile(file, finalContent, 'utf-8');
  await indexMarkdown(db, file, repoName, ctx);
  db.prepare("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')").run();
}

```

### curate_diagram Snapshot Generation

```javascript

// Generate consolidated DIAGRAM-REGISTRY.md from all diagrams
async function generateDiagramSnapshot(db) {
  const diagrams = db.prepare('SELECT * FROM diagrams ORDER BY repository, name').all();
  const byRepo = {};
  for (const d of diagrams) {
    if (!byRepo[d.repository]) byRepo[d.repository] = [];
    byRepo[d.repository].push(d);
  }

  const lines = [
    '# Diagram Registry — All Repositories',
    '',
    `*Auto-generated by DocuMind MCP. Last updated: ${new Date().toISOString()}. Do not edit manually.*`,
    '',
  ];

  for (const [repo, rows] of Object.entries(byRepo)) {
    lines.push(`## ${repo}`, '');
    lines.push('| Diagram | Type | Status | Generated URL | Curated URL | Updated |');
    lines.push('| ------- | ---- | ------ | ------------- | ----------- | ------- |');
    for (const d of rows) {
      const status = d.curated_url ? 'curated' : d.stale ? 'stale' : 'generated';
      const updated = (d.curated_at || d.generated_at || '').slice(0, 10);
      lines.push(`| ${d.name} | ${d.diagram_type} | ${status} | ${d.figjam_url || ''} | ${d.curated_url || ''} | ${updated} |`);
    }
    lines.push('');
  }

  const snapshotPath = path.join(ROOT, 'docs/diagrams/DIAGRAM-REGISTRY.md');
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, lines.join('\n'), 'utf-8');
  return snapshotPath;
}

```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |

| --- | --- | --- | --- |

| Per-repo DIAGRAM-REGISTRY.md as source of truth | DocuMind DB `diagrams` table as single source of truth | Phase 5 decision | Two existing per-repo files (RootDispatcher, any2figma) will be reverse-synced and deleted |

| `relink_diagram` as standalone MCP tool | Folded into `curate_diagram` | Phase 5 decision | One tool sets URL + propagates; no separate relink step |

| DB open as readonly | DB open read-write with WAL | Phase 5 | Required for write tools |

---

## Open Questions

1. **fix-markdown.mjs function imports**

   - What we know: `fix-markdown.mjs` exports no named functions — the file ends in `main().catch(console.error)` and all fix functions are module-scoped

   - What's unclear: Can the fix functions be imported directly without running `main()`?

   - Recommendation: The fix functions (`fixCodeBlockLanguages`, `fixBoldItalicToHeadingsOrLists`, `fixLineBreaks`) are defined but not exported. The planner must add `export` to these functions in `fix-markdown.mjs` before `fix_file` can import them. This is a prerequisite task — 4 lines of `export` additions.

2. **Snapshot write-lock for curate_diagram**

   - What we know: `relink-processor.mjs` uses `writingNow` from `daemon/registry-lock.mjs` to prevent chokidar from re-processing its own writes

   - What's unclear: Should the MCP server also use this guard when writing the consolidated snapshot?

   - Recommendation: Yes — import `writingNow` from `registry-lock.mjs` and add the snapshot path to it before writing. The watcher processes any .md file change; without the guard it would try to index the snapshot immediately after writing.

3. **GlossiaApp and mjml_mcp vs mjml-dev-mode naming**

   - What we know: `.mcp.json` was found at `mjml-dev-mode` but the working directories listed in the env include `mjml_mcp`

   - What's unclear: Are these the same repo or two separate repos?

   - Recommendation: Confirm directory names before registration task. Use the filesystem path (mjml-dev-mode) as the canonical name.

---

## Sources

### Primary (HIGH confidence)

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/daemon/mcp-server.mjs` — Phase 4 implementation; DB open pattern, tool registration pattern, stdout redirect

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/orchestrator.mjs` — `runScan()` export signature, modes, return shape

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/processors/markdown-processor.mjs:129` — `indexMarkdown()` signature

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/processors/relink-processor.mjs` — `relinkDiagram()`, `propagateRelinkAllRepos()`, `reverseSyncFromRegistry()` signatures

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/scripts/fix-markdown.mjs` — fix function implementations (not yet exported)

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/config/.markdownlint.json` — lint config loaded by lint_file tool

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/config/rules/` — two custom rules confirmed: `force-align-table-columns.cjs`, `table-separator-spacing.cjs`

- `node_modules/markdownlint/lib/markdownlint.js` — `sync`, `applyFixes` API; version 0.36.1; verified via live Node.js calls

- Live markdownlint API test — confirmed `fixInfo: null` for MD040; `fixInfo: {editColumn, deleteCount}` for MD009; `applyFixes()` returns fixed string

- Filesystem scan — confirmed 16 repos with `.mcp.json`; DocuMind's `.mcp.json` has only `figma-desktop` (not `documind`); DocuMind's `.claude/mcp.json` has `documind` (Phase 4)

### Secondary (MEDIUM confidence)

- `context/loader.mjs` — profile JSON shape; `repositoryRegistryPath` field location; `ctx` object does not expose registry path directly

### Tertiary (LOW confidence)

- None

---

## Metadata

### Confidence breakdown:

- Standard stack: HIGH — all packages confirmed installed and API-tested via live Node.js calls

- Architecture: HIGH — derived from direct codebase inspection of all relevant modules

- Tool specs: HIGH — I/O shapes derived from CONTEXT.md locked decisions + existing code patterns

- Pitfalls: HIGH — DB readonly issue and CJS/ESM issue verified by inspecting actual code

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable libraries; markdownlint API is very stable)
