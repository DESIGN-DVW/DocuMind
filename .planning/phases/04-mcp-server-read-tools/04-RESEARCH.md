# Phase 4: MCP Server — Read Tools - Research

**Researched:** 2026-03-17
**Domain:** Model Context Protocol stdio server + SQLite query bridge
**Confidence:** HIGH

---

## Summary

Phase 4 creates `daemon/mcp-server.mjs` — a separate stdio entry point that exposes DocuMind's SQLite data as MCP tools consumable by Claude Code agents across all DVWDesign repos. The implementation requires one new npm package (`@modelcontextprotocol/sdk@^1.27.1`) and one version bump (`zod` to `^3.25.0`). All tool query logic already exists in the live codebase as REST endpoints in `server.mjs` and helper functions in `graph/relations.mjs` — the work is wiring those queries into MCP tool handlers with zero stdout pollution.

The critical constraint is stdout isolation: because the stdio transport uses stdout as the JSON-RPC wire, any `console.log()` call anywhere in the import chain corrupts the protocol. This must be the first line of `mcp-server.mjs` — before any module imports — and must redirect `console.log` to stderr. The existing REST endpoints in `server.mjs` already show the correct SQL patterns; the MCP tools essentially re-execute those same queries with Zod-validated inputs.

The phase also requires adding an `mcp-server` entry to `ecosystem.config.cjs` so the MCP process starts alongside the main HTTP daemon under PM2.

**Primary recommendation:** Create `daemon/mcp-server.mjs` as a self-contained stdio process that opens its own DB connection, redirects stdout to stderr at line 1, and wires all 7 read tools against existing SQL patterns extracted from `server.mjs`.

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |

| --- | --- | --- |

| MCPR-01 | `daemon/mcp-server.mjs` as separate entry point with stderr-only logging | Separate entry point required by MCP SDK stdio transport design; stdout redirect pattern documented in PITFALLS.md |

| MCPR-02 | `search_docs` tool — full-text search with repo/category/classification filters | Query pattern exists in `server.mjs` `/search` endpoint (lines 131–157); needs classification filter added |

| MCPR-03 | `get_related` tool — graph traversal (doc ID + hops, returns paths and relationship types) | `findRelated(db, docId, maxDepth)` already exported from `graph/relations.mjs` — direct call with hop parameter |

| MCPR-04 | `get_keywords` tool — keyword cloud for a repo with TF-IDF scores | Query pattern exists in `server.mjs` `/keywords` endpoint (lines 260–287) |

| MCPR-05 | `get_tree` tool — folder hierarchy for a repo | Query pattern exists in `server.mjs` `/tree/:repo` endpoint (lines 200–213) |

| MCPR-06 | `check_existing` tool — "does a doc covering X already exist?" (search + scoring) | Requires FTS5 search + scoring heuristic; no existing endpoint but SQL is subset of `search_docs` |

| MCPR-07 | `get_diagrams` tool — diagram registry with stale status | Query pattern exists in `server.mjs` `/diagrams` endpoint (lines 299–330) |

| MCPR-08 | stdio transport for Claude Code integration | `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`; verified in STACK.md |

</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |

| --- | --- | --- | --- |

| `@modelcontextprotocol/sdk` | `^1.27.1` | MCP server + stdio transport | Official Anthropic SDK; only spec-compliant implementation; 33K+ npm dependents; current stable at 1.27.1 (verified via npm) |

| `zod` (bump) | `^3.25.0` | Tool schema validation | SDK requires zod `>=3.25.0` as peer dep; current DocuMind pin `^3.22.4` must be bumped |

| `better-sqlite3` | `^12.6.2` (existing) | DB queries in tool handlers | Synchronous API fits perfectly in MCP tool handlers; no async DB wrangling needed |

### Supporting

| Library | Version | Purpose | When to Use |

| --- | --- | --- | --- |

| `@modelcontextprotocol/inspector` | via `npx` | Dev tool for interactive tool testing | Run during development before wiring into Claude Code; add as `mcp:inspect` npm script |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |

| --- | --- | --- |

| Separate `mcp-server.mjs` entry point | Embed stdio transport in `server.mjs` | Embedding risks stdout pollution from Express internals and existing `console.log` calls; separate entry point allows clean stdout isolation |

| `StdioServerTransport` only | `StreamableHTTPServerTransport` on Express | HTTP transport is for Phase 5+ (SAAS-06) — stdio is the Claude Code integration target for Phase 4 |

#### Installation:

```bash

npm install @modelcontextprotocol/sdk

# Edit package.json: "zod": "^3.22.4" → "^3.25.0"

npm install

```

## Architecture Patterns

### Recommended Project Structure

```text

daemon/
├── server.mjs          # Existing Express HTTP daemon — unchanged
├── mcp-server.mjs      # NEW: stdio MCP entry point
├── scheduler.mjs       # Existing — unchanged
├── watcher.mjs         # Existing — unchanged
└── hooks.mjs           # Existing — unchanged

```

The MCP server is a sibling to `server.mjs`, not embedded in it. It opens its own DB connection and imports `findRelated` from `graph/relations.mjs`. It does NOT import from `server.mjs` (circular import risk + stdout pollution from Express startup).

### Pattern 1: Stdout Redirect at Line 1

**What:** Before any import, redirect `console.log` to write to stderr instead of stdout.

**When to use:** Mandatory for any stdio MCP server process. Any module in the import chain that calls `console.log` would corrupt the JSON-RPC wire.

#### Example:

```javascript

// daemon/mcp-server.mjs — FIRST TWO LINES, before any import
// Redirect stdout → stderr so JSON-RPC wire is never polluted
const _origLog = console.log.bind(console);
console.log = (...args) => process.stderr.write(args.join(' ') + '\n');

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// ... rest of imports

```

**Warning:** `console.log = ...` only redirects calls made after this assignment. In ES modules, import hoisting means all imports are resolved at module parse time, but module-level side effects run in order of import. Since the redirect is the first executable code, it fires before any imported module's top-level code runs — this is correct behavior.

### Pattern 2: McpServer Tool Registration

**What:** Register tools with `server.tool(name, description, zodSchema, handler)`. Handler returns `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`.

**When to use:** All 7 read tools follow this pattern.

#### Example (from official SDK docs):

```javascript

// Source: @modelcontextprotocol/sdk official docs
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({ name: 'DocuMind', version: '3.0.0' });

server.tool(
  'search_docs',
  'Full-text search across all indexed documentation. Returns ranked results with file path, repository, classification, and a content snippet.',
  {
    query: z.string().describe('Search terms — supports FTS5 boolean operators (AND, OR, NOT)'),
    repo: z.string().optional().describe('Filter to a specific repository name (e.g. "DocuMind")'),
    category: z.string().optional().describe('Filter by document category (e.g. "architecture")'),
    classification: z.string().optional().describe('Filter by classification path prefix (e.g. "engineering/architecture")'),
    limit: z.number().int().min(1).max(100).default(20).describe('Maximum results to return'),
  },
  async ({ query, repo, category, classification, limit }) => {
    // ... query logic
    return {
      content: [{ type: 'text', text: JSON.stringify({ query, count: results.length, results }) }],
    };
  }
);

```

### Pattern 3: Structured Error Returns (Not Thrown Exceptions)

**What:** MCP tool handlers should catch DB errors and return structured error objects in the content array rather than throwing. Thrown exceptions propagate as MCP protocol errors with opaque messages.

**When to use:** Wrap all DB operations in try/catch inside every tool handler.

#### Example:

```javascript

async ({ query }) => {
  try {
    const results = db.prepare(sql).all(query);
    return { content: [{ type: 'text', text: JSON.stringify({ results }) }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: err.message, query }) }],
      isError: true,
    };
  }
}

```

### Pattern 4: PM2 Second App Entry

**What:** Add a second entry in `ecosystem.config.cjs` `apps` array for `mcp-server.mjs`. Use `exec_interpreter: 'node'` and `exec_mode: 'fork'`. The MCP process must NOT use cluster mode (incompatible with stdio).

**When to use:** Required for MCPR-01 — "MCP server registered in ecosystem.config.cjs and starts alongside main daemon."

#### Example:

```javascript

// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'documind',
      script: 'daemon/server.mjs',
      // ... existing config
    },
    {
      name: 'documind-mcp',
      script: 'daemon/mcp-server.mjs',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        DOCUMIND_DB: './data/documind.db',
        DOCUMIND_PROFILE: process.env.DOCUMIND_PROFILE || './config/profiles/dvwdesign.json',
      },
      error_file: './data/logs/mcp-error.log',
      out_file: '/dev/null', // stdout is JSON-RPC wire — never log to out_file
    },
  ],
};

```

**Critical:** Set `out_file: '/dev/null'` on the MCP PM2 entry so PM2 does not capture the JSON-RPC stdout stream as a log.

### Pattern 5: Claude Code MCP Registration

**What:** Register the MCP server in Claude Code's MCP config so agents can call it.

**When to use:** Required to satisfy the success criterion "Calling search_docs from Claude Code returns ranked results."

**Config location:** `~/.claude/claude_desktop_config.json` or project-level `.claude/mcp.json` (Claude Code reads both).

#### Example:

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

### Anti-Patterns to Avoid

- **Importing `server.mjs` from `mcp-server.mjs`:** Express startup emits to stdout; the circular import also risks initialization order issues.

- **`console.log` redirect placed after first import:** Any module-level `console.log` in imported code fires at import time, before the redirect takes effect. The redirect must be the very first executable code.

- **Using cluster mode in PM2 for MCP:** Cluster mode spawns multiple processes sharing stdio — incompatible with a single-client stdio transport.

- **Returning raw objects from tool handlers:** MCP SDK requires the `content` array shape. Returning a plain object causes a schema validation error in the SDK.

- **Tool count over 20:** Cursor has a hard limit of 40 MCP tools total across all servers; design DocuMind Phase 4 with 7 tools, well within limits and leaving room for Phase 5 write tools.

## What Already Exists (Don't Re-Build)

Every query the MCP tools need is already written in `daemon/server.mjs`. Extract, don't invent:

| MCP Tool | Source Endpoint | SQL Pattern Location |

| --- | --- | --- |

| `search_docs` | `GET /search` | `server.mjs` lines 131–157 |

| `get_related` | `GET /graph` (partial) | `graph/relations.mjs` `findRelated()` — recursive CTE already written |

| `get_keywords` | `GET /keywords` | `server.mjs` lines 260–287 |

| `get_tree` | `GET /tree/:repo` | `server.mjs` lines 200–213 |

| `check_existing` | N/A (new) | Subset of search_docs SQL + score heuristic |

| `get_diagrams` | `GET /diagrams` | `server.mjs` lines 299–330 |

The `findRelated(db, docId, maxDepth)` function in `graph/relations.mjs` is the direct implementation for `get_related` — import and call it directly.

**Key insight:** Don't hand-roll graph traversal. `findRelated()` with recursive CTE is already implemented, tested (verified in Phase 3), and capped correctly.

## Tool Specifications

### `search_docs` (MCPR-02)

Extends the existing `/search` query with a `classification` filter. The existing query joins `documents_fts` to `documents`; add `AND d.classification LIKE ?` for prefix matching when classification is provided.

#### Input schema:

- `query: string` — FTS5 query string

- `repo: string?` — repository filter

- `category: string?` — category filter

- `classification: string?` — classification prefix filter (`LIKE 'engineering/%'`)

- `limit: integer(1-100, default 20)`

#### Output shape:

```json

{ "query": "...", "count": 5, "results": [{ "id": 1, "path": "...", "repository": "...", "category": "...", "classification": "...", "snippet": "..." }] }

```

### `get_related` (MCPR-03)

Direct wrapper around `findRelated(db, docId, maxDepth)`.

#### Input schema:

- `doc_id: integer` — document ID (from search_docs results)

- `hops: integer(1-3, default 2)` — max traversal depth

#### Output shape:

```json

{ "doc_id": 42, "hops": 2, "count": 12, "related": [{ "doc_id": 7, "relationship_type": "imports", "weight": 1.0, "depth": 1, "path": "...", "repository": "..." }] }

```

**Note:** Enforce `hops <= 3` in the Zod schema to prevent runaway recursive CTEs. The `findRelated` query has no built-in depth limit beyond the parameter passed.

### `get_keywords` (MCPR-04)

#### Input schema:

- `repo: string?` — repository filter

- `category: string?` — keyword category filter (technology/action/topic)

- `limit: integer(1-200, default 50)`

#### Output shape:

```json

{ "count": 30, "keywords": [{ "keyword": "sqlite", "category": "technology", "score": 0.85, "repository": "DocuMind", "path": "..." }] }

```

### `get_tree` (MCPR-05)

#### Input schema:

- `repo: string` — repository name (required)

#### Output shape:

```json

{ "repository": "DocuMind", "folder_count": 15, "folders": [{ "path": "...", "depth": 0, "doc_count": 5, "folder_type": "docs" }] }

```

### `check_existing` (MCPR-06)

**What it does:** Searches FTS5 for documents matching the query, then scores them by title relevance and classification match to answer "has this already been documented?" Returns a boolean `exists` field plus top matches with confidence scores.

#### Input schema:

- `query: string` — topic description to check

- `repo: string?` — narrow search to a repo

- `threshold: number(0-1, default 0.5)` — minimum score to report as "existing"

#### Output shape:

```json

{ "query": "...", "exists": true, "confidence": 0.82, "matches": [{ "path": "...", "score": 0.82, "title": "...", "classification": "..." }] }

```

**Implementation:** Run FTS5 search (same as search_docs), then compute a simple score from: snippet match quality (rank from FTS5) + whether the title/filename contains query terms. No ML needed — the FTS5 rank column provides the signal.

### `get_diagrams` (MCPR-07)

#### Input schema:

- `repo: string?` — filter by repository

- `stale_only: boolean(default false)` — return only stale diagrams

- `limit: integer(1-100, default 50)`

#### Output shape:

```json

{ "count": 8, "diagrams": [{ "name": "auth-flow", "repository": "DocuMind", "stale": false, "figjam_url": "...", "curated_url": "...", "png_url": "/diagrams/png/DocuMind/auth-flow.png" }] }

```

## Common Pitfalls

### Pitfall 1: stdout Pollution Kills the Protocol

**What goes wrong:** Any `console.log()` call in the import chain writes to stdout, which the MCP client interprets as a malformed JSON-RPC message. Claude reports "invalid JSON" or disconnects immediately.

**Why it happens:** DocuMind's existing processors all use `console.log` (they were built for terminal/daemon use, not stdio transport).

**How to avoid:** Redirect `console.log` before any import at line 1 of `mcp-server.mjs`. Also verify by running `npx @modelcontextprotocol/inspector node daemon/mcp-server.mjs` — any stdout pollution shows up as parse errors in the inspector.

**Warning signs:** Inspector shows "unexpected token" on connect; tool calls succeed in HTTP mode but fail in stdio mode.

### Pitfall 2: PM2 Capturing JSON-RPC as Log Output

**What goes wrong:** PM2's default `out_file` captures everything written to stdout. If PM2 manages the MCP process and writes stdout to a log file, the JSON-RPC pipe is drained by PM2 before the client can read it, silently dropping messages.

**Why it happens:** PM2 assumes stdout is log output. For the HTTP daemon this is correct. For the MCP stdio daemon it is catastrophic.

**How to avoid:** Set `out_file: '/dev/null'` in the PM2 app config for `documind-mcp`. The `error_file` can still capture stderr (logging goes there).

**Warning signs:** MCP Inspector connects fine (direct `node` invocation) but Claude Code agent cannot get responses when using PM2-managed process.

### Pitfall 3: `findRelated` Without Depth Cap

**What goes wrong:** Calling `findRelated(db, docId, 10)` on a hub document with many relationships causes the recursive CTE to traverse thousands of edges, blocking the synchronous `better-sqlite3` call for seconds.

**Why it happens:** The recursive CTE in `findRelated` stops only at `maxDepth` — there is no row count limit in the query itself.

**How to avoid:** Enforce `hops: z.number().int().min(1).max(3)` in the Zod schema. The `findRelated` query in `graph/relations.mjs` adds `ORDER BY r.depth, r.weight DESC` but no `LIMIT` — consider adding `LIMIT 200` to the CTE query itself as a hard safety cap.

**Warning signs:** Tool calls for well-connected documents take > 2 seconds; MCP client timeout.

### Pitfall 4: Tool Description Quality Affects Claude's Behavior

**What goes wrong:** Vague tool descriptions ("gets documents") cause Claude to call the wrong tool, pass wrong parameter types, or not call the tool at all when it would be useful.

**Why it happens:** Claude uses tool descriptions and parameter descriptions to decide when and how to invoke tools. This is a prompting problem, not a code problem.

**How to avoid:** Write descriptions as if explaining to a knowledgeable colleague what the tool is for and when to use it. Include example use cases in the description string. Field descriptions must describe the exact format expected (e.g., "repository name as it appears in the registry, e.g. 'DocuMind' or 'RootDispatcher'").

**Warning signs:** MCP Inspector works perfectly but Claude Code never chooses to call the tool; or Claude passes incorrect values (number as string, etc.).

### Pitfall 5: Separate DB Connection Isn't WAL-Aware

**What goes wrong:** `mcp-server.mjs` opens a second DB connection while `server.mjs` is also running. If WAL mode is not set on the MCP connection, writes from the HTTP daemon may not be immediately visible to the MCP reader.

**Why it happens:** WAL mode must be set per-connection. Opening `new Database(DB_PATH)` without `db.pragma('journal_mode = WAL')` defaults to DELETE mode, which conflicts with an existing WAL-mode database.

**How to avoid:** Set `db.pragma('journal_mode = WAL')` and `db.pragma('foreign_keys = ON')` at MCP server startup, same as `server.mjs` does. The MCP server is read-only (Phase 4) so it can also set `db.pragma('query_only = true')` as an additional safety guard.

## Code Examples

### Minimal Wiring Pattern

```javascript

// daemon/mcp-server.mjs
// MUST be first — redirect console.log before any imports
console.log = (...args) => process.stderr.write(args.join(' ') + '\n');

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { loadProfile } from '../context/loader.mjs';
import { findRelated } from '../graph/relations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.env.DOCUMIND_DB || path.join(ROOT, 'data/documind.db');

const db = new Database(DB_PATH, { readonly: true });
db.pragma('journal_mode = WAL');

const ctx = await loadProfile();

const server = new McpServer({ name: 'DocuMind', version: '3.0.0' });

// Register all tools here (see tool specs above)

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('[mcp-server] DocuMind MCP ready\n');

```

### search_docs Implementation Pattern

```javascript

// Extracted from server.mjs /search endpoint — adapted for MCP
server.tool(
  'search_docs',
  'Full-text search across all DocuMind-indexed documentation. Returns ranked results with path, repository, classification, and content snippet. Use this to find existing docs before creating new ones.',
  {
    query: z.string().describe('FTS5 search query. Supports AND, OR, NOT operators. Example: "sqlite migration"'),
    repo: z.string().optional().describe('Limit to one repository. Must match registry name exactly, e.g. "DocuMind"'),
    category: z.string().optional().describe('Filter by document category, e.g. "architecture" or "operations"'),
    classification: z.string().optional().describe('Filter by classification path prefix, e.g. "engineering/architecture"'),
    limit: z.number().int().min(1).max(100).default(20).describe('Max results (1-100, default 20)'),
  },
  async ({ query, repo, category, classification, limit }) => {
    try {
      let sql = `
        SELECT d.id, d.path, d.repository, d.filename, d.category, d.classification,
               snippet(documents_fts, 3, '[', ']', '...', 32) as snippet
        FROM documents_fts
        JOIN documents d ON documents_fts.rowid = d.id
        WHERE documents_fts MATCH ?
      `;
      const params = [query];
      if (repo) { sql += ' AND d.repository = ?'; params.push(repo); }
      if (category) { sql += ' AND d.category = ?'; params.push(category); }
      if (classification) { sql += ' AND d.classification LIKE ?'; params.push(classification + '%'); }
      sql += ' ORDER BY rank LIMIT ?';
      params.push(limit);

      const results = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify({ query, count: results.length, results }) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  }
);

```

### npm Script Additions

```json

{
  "mcp:dev": "node daemon/mcp-server.mjs",
  "mcp:inspect": "npx @modelcontextprotocol/inspector node daemon/mcp-server.mjs"
}

```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |

| --- | --- | --- | --- |

| Graph traversal with hop depth | Recursive JS loop over DB results | `findRelated()` in `graph/relations.mjs` | Already written, tested, capped; recursive CTE is 10x faster than JS traversal for graph data |

| Input validation for tool parameters | Manual type checks | Zod schema in `server.tool()` call | SDK enforces Zod schema before calling handler; no manual validation needed |

| MCP protocol framing | Custom JSON-RPC serializer | `@modelcontextprotocol/sdk` | Protocol is complex (streaming, batching, error codes); SDK handles it all |

| FTS5 ranking | Custom scoring | SQLite `rank` column from FTS5 query | FTS5 BM25 rank is provided automatically in ORDER BY rank; more accurate than hand-rolled scoring |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |

| --- | --- | --- | --- |

| SSE transport (deprecated) | `StdioServerTransport` + `StreamableHTTPServerTransport` | MCP spec 2025-11-25 | SSE is removed from spec; do not use `SSEServerTransport` |

| `Server` class from SDK | `McpServer` high-level class | SDK v1.x | `McpServer` is the recommended API; `Server` is lower-level and requires more boilerplate |

## Open Questions

1. **`check_existing` scoring threshold**

   - What we know: FTS5 returns a `rank` column (negative float; closer to 0 = more relevant); no normalized 0–1 score

   - What's unclear: What threshold makes `check_existing` useful vs. noisy — needs tuning against real DocuMind data

   - Recommendation: Implement with a configurable `threshold` parameter defaulting to 0.5 (normalized by dividing rank by a fixed baseline); let Claude Code usage inform tuning in Phase 5

2. **`readonly: true` vs WAL PRAGMA**

   - What we know: `new Database(DB_PATH, { readonly: true })` opens in read-only mode; WAL PRAGMA on a read-only connection is a no-op

   - What's unclear: Whether better-sqlite3 `readonly` option conflicts with `journal_mode = WAL` PRAGMA

   - Recommendation: Use `readonly: true` constructor option; skip the WAL PRAGMA on the MCP connection; verify with a quick test before relying on it

3. **Tool description iteration**

   - What we know: STATE.md notes "MCP tool description quality affects model behavior — test with MCP Inspector before finalizing tool definitions"

   - What's unclear: Which descriptions will cause Claude to under-use or misuse tools

   - Recommendation: Write initial descriptions with example use cases; defer tuning to post-Phase-4 observation

## Sources

### Primary (HIGH confidence)

- `@modelcontextprotocol/sdk` npm — version 1.27.1 confirmed current stable (verified via `npm show @modelcontextprotocol/sdk version`)

- `daemon/server.mjs` — all SQL patterns for search, keywords, tree, diagrams (direct codebase inspection)

- `graph/relations.mjs` — `findRelated(db, docId, maxDepth)` recursive CTE implementation (direct codebase inspection)

- `context/loader.mjs` — `loadProfile()` return shape; ctx object fields confirmed (direct codebase inspection)

- `ecosystem.config.cjs` — existing PM2 config structure; out_file/error_file pattern (direct codebase inspection)

- `.planning/research/STACK.md` — MCP import paths, zod version requirement, transport strategies (project research document)

- `.planning/research/PITFALLS.md` — stdout pollution pitfall, tool count limits, security considerations (project research document)

### Secondary (MEDIUM confidence)

- MCP TypeScript SDK GitHub releases — v1.27.1 confirmed (verified in STACK.md)

- MCP official build-server docs — `McpServer`, `StdioServerTransport` API patterns (cited in STACK.md)

- Cursor 40-tool hard limit — design for well under this ceiling (cited in PITFALLS.md)

## Metadata

### Confidence breakdown:

- Standard stack: HIGH — MCP SDK version confirmed via npm; zod requirement confirmed from prior research

- Architecture: HIGH — patterns derived from direct codebase inspection of existing endpoints; nothing invented

- Tool specs: HIGH — SQL patterns copy-adapted from live endpoints; `findRelated` signature confirmed from source

- Pitfalls: HIGH — stdout pollution pattern confirmed by prior research; PM2 out_file risk derived from PM2 docs and MCP stdio constraints

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (MCP SDK updates frequently; re-verify import paths if SDK version changes significantly)
