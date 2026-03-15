# Architecture Research

**Domain:** Documentation Intelligence Platform (Express + SQLite + PM2)
**Researched:** 2026-03-15
**Confidence:** HIGH (existing codebase analyzed + MCP official docs verified)

## Standard Architecture

### System Overview — v3.0 Target State

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        ENTRY POINTS                                      │
│  ┌────────────────────┐  ┌─────────────────────────────────────────┐    │
│  │  daemon/server.mjs │  │  daemon/mcp-server.mjs (NEW)            │    │
│  │  Express :9000     │  │  stdio transport — Claude Code spawns   │    │
│  └────────┬───────────┘  └───────────────┬─────────────────────────┘    │
│           │                              │                               │
│           └──────────────┬───────────────┘                               │
│                          ▼                                                │
├──────────────────────────────────────────────────────────────────────────┤
│                        SERVICE LAYER (shared)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │  orchestrator│  │  context     │  │  graph/      │  │  processors/│  │
│  │  .mjs (NEW)  │  │  loader (NEW)│  │  relations   │  │  (existing) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  └─────────────┘  │
│         │                 │                                               │
├─────────┴─────────────────┴──────────────────────────────────────────────┤
│                        DATABASE LAYER                                     │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  SQLite — documind.db (better-sqlite3, WAL mode, FTS5)             │  │
│  │  + classifications table (NEW)  + tags table (NEW)                 │  │
│  │  + context_profiles table (NEW) + summary column (NEW)             │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
| --------- | -------------- | ----------------- |
| `daemon/server.mjs` | Express HTTP on :9000, REST endpoints for Claude Code hooks and CLI use | DB, processors, orchestrator, graph |
| `daemon/mcp-server.mjs` (NEW) | stdio MCP server — separate entry point, tools as thin wrappers calling existing service functions | orchestrator, DB (shared modules) |
| `daemon/scheduler.mjs` | node-cron job registration; currently has TODO stubs | orchestrator (NEW wiring target) |
| `daemon/watcher.mjs` | chokidar file change detection | processor invocation via hooks |
| `daemon/hooks.mjs` | Routes Claude Code post-write/post-commit events to handlers | processors, DB |
| `processors/markdown-processor.mjs` | Parse + lint + FTS-index markdown | DB (documents table, FTS5) |
| `processors/keyword-processor.mjs` | TF-IDF extraction via natural.js | DB (keywords table); called by scheduler weekly |
| `processors/tree-processor.mjs` | Folder hierarchy analysis | DB (folder_nodes table) |
| `processors/mermaid-processor.mjs` | Generate .mmd files, register diagrams | DB (diagrams table) |
| `processors/relink-processor.mjs` | FigJam URL propagation across repos | DB, filesystem (all 14 repos) |
| `graph/relations.mjs` | Build directional relationship edges from document content analysis | DB (doc_relationships table) |
| `graph/queries.mjs` | Recursive CTE traversal of relationship graph | DB |
| `orchestrator.mjs` (NEW) | Single coordination layer that wires processors to scheduler triggers | All processors, graph module, DB |
| `context/loader.mjs` (NEW) | Load + validate context profile JSON; expose active profile to all modules | filesystem, DB (context_profiles table) |
| `scripts/db/schema.sql` | Authoritative schema definition for all tables | n/a |

## Recommended Project Structure (additions only)

```text
DocuMind/
├── daemon/
│   ├── server.mjs          # Existing — Express :9000 (unchanged)
│   ├── mcp-server.mjs      # NEW — stdio MCP entry point
│   ├── scheduler.mjs       # Existing — wiring TODO stubs replaced
│   ├── watcher.mjs         # Existing
│   └── hooks.mjs           # Existing
├── processors/             # All existing — no changes to processor logic
│   └── ...
├── graph/
│   ├── relations.mjs       # Existing — buildRelationships (currently never called)
│   └── queries.mjs         # Existing
├── context/                # NEW directory
│   ├── loader.mjs          # Load + validate context profile JSON
│   └── profiles/
│       └── dvwdesign.json  # DVWDesign ecosystem profile (default)
├── orchestrator.mjs        # NEW — single wiring module for scheduler + processors
├── scripts/
│   └── db/
│       ├── schema.sql      # Add classification/tag/summary columns in migration
│       └── init-database.mjs
└── config/
    └── (existing)
```

### Structure Rationale

- `daemon/mcp-server.mjs` is a separate entry point (not embedded in `server.mjs`) because stdio transport requires exclusive ownership of stdout for JSON-RPC — any `console.log` in the same process corrupts the stream. (HIGH confidence — official MCP docs)
- `orchestrator.mjs` at root level (not inside `daemon/`) because it must be importable by both `daemon/server.mjs` (for on-demand triggers) and `daemon/mcp-server.mjs` (for write tools), without pulling in Express.
- `context/` directory separates profile loading concerns from processing logic — keeps processors context-agnostic and testable.

## Architectural Patterns

### Pattern 1: MCP as Thin-Wrapper Companion Process

**What:** `daemon/mcp-server.mjs` is a separate Node.js entry point that imports the same service modules as `server.mjs`. MCP tools are implemented as thin wrappers that call existing service functions or make internal HTTP requests to `localhost:9000`. Claude Code spawns it as a child process via stdio.

**When to use:** When you already have a working HTTP service and want to expose the same capabilities as MCP tools without rewriting business logic.

**Trade-offs:** Two entry points to maintain, but zero duplication of business logic. The MCP process and the Express process share the SQLite database file safely because better-sqlite3 uses WAL mode (concurrent readers allowed, single writer via serialized access).

**Configuration in claude_desktop_config.json or Claude Code project settings:**

```json
{
  "mcpServers": {
    "documind": {
      "command": "node",
      "args": ["/Users/Shared/htdocs/github/DVWDesign/DocuMind/daemon/mcp-server.mjs"]
    }
  }
}
```

**Key constraint:** In `mcp-server.mjs`, all logging must go to `process.stderr`, never `process.stdout`. `console.log` is banned in this file — use `console.error` or a file logger.

**Example tool structure:**

```javascript
// daemon/mcp-server.mjs
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';
import { searchDocuments } from '../services/search.mjs'; // shared module

const server = new McpServer({ name: 'documind', version: '3.0.0' });

server.tool('search_docs', { query: z.string(), repo: z.string().optional() }, async ({ query, repo }) => {
  const results = searchDocuments(db, query, { repo });
  return { content: [{ type: 'text', text: JSON.stringify(results) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Pattern 2: Orchestrator Module for Scheduler Wiring

**What:** A single `orchestrator.mjs` module exports named functions (`runIncrementalScan`, `runFullScan`, `runKeywordRefresh`, `runGraphRebuild`) that each coordinate the correct sequence of processor calls. The scheduler imports these and calls them by name in cron callbacks — no business logic lives in `scheduler.mjs`.

**When to use:** When you have stub TODOs in cron jobs (exactly the current state of `daemon/scheduler.mjs`) and multiple entry points (scheduler, HTTP endpoint `/scan`, MCP write tool `trigger_scan`) that all need to do the same work.

**Trade-offs:** Adds one abstraction layer, but is required to avoid duplicating scan logic across the scheduler, the `/scan` endpoint in `server.mjs`, and any future MCP write tool.

**Wiring pattern:**

```javascript
// orchestrator.mjs
import { scanAllRepos } from './scripts/scan-all-repos.mjs';
import { buildRelationships } from './graph/relations.mjs';
import { extractKeywords } from './processors/keyword-processor.mjs';

export async function runFullScan(db, config) {
  await scanAllRepos(db, config.repos);
  await buildRelationships(db);
  await extractKeywords(db);
}

// daemon/scheduler.mjs (after wiring)
import { runFullScan } from '../orchestrator.mjs';
cron.schedule('0 2 * * *', () => runFullScan(db, ctx.config));
```

### Pattern 3: Context Profile Loader

**What:** A `context/loader.mjs` module reads a JSON profile file at startup. The profile defines which repos to scan, what classification tree to apply, what relationship types are active, and what lint rules to enforce. The loaded profile is passed through to all subsystems as a `ctx` object — no module reaches into global config directly.

**When to use:** Required for DocuMind to be portable across deployments (Step #3 goal). Also required internally because the classification tree, relationship types, and scan paths need to be swappable without code changes.

**Profile structure:**

```json
{
  "name": "dvwdesign",
  "version": "1.0.0",
  "scan": {
    "roots": ["/Users/Shared/htdocs/github/DVWDesign/"],
    "repos": ["DocuMind", "RootDispatcher", "LibraryAssetManager"]
  },
  "classifications": {
    "tree": {
      "api": ["swagger", "openapi", "endpoints"],
      "architecture": ["adr", "system", "diagram"],
      "operations": ["runbook", "deploy", "incident"]
    }
  },
  "relationships": {
    "active_types": ["imports", "parent_of", "depends_on", "supersedes"]
  },
  "lint": {
    "rules_path": "./config/.markdownlint.json",
    "custom_patterns_path": "./config/custom-error-patterns.json"
  }
}
```

**Loader pattern:**

```javascript
// context/loader.mjs
import { readFileSync } from 'fs';
import { z } from 'zod';

const ProfileSchema = z.object({ name: z.string(), scan: z.object({...}), ... });

export function loadProfile(profilePath) {
  const raw = JSON.parse(readFileSync(profilePath, 'utf8'));
  return ProfileSchema.parse(raw); // throws on invalid profile
}
```

### Pattern 4: Hierarchical Classification via Materialized Path in SQLite

**What:** Store document classifications as a materialized path string (`api/authentication/jwt`) in the `documents.classification` column, with a separate `classifications` table storing the tree definition. Queries use SQLite `LIKE 'api/%'` for subtree traversal — no recursive CTE needed for classification lookups.

**When to use:** The classification tree is read-heavy (every search filters by it), shallow (3-4 levels max), and relatively static (defined in the context profile). Materialized path outperforms nested sets for this access pattern.

**Why not adjacency list or nested sets:** Adjacency list requires recursive CTEs for subtree queries (expensive for frequent search filtering). Nested sets require expensive re-numbering on any tree change. Materialized path for a shallow, mostly-read classification tree is the correct choice. (MEDIUM confidence — multiple SQL hierarchy sources agree on this access pattern recommendation)

**Schema addition:**

```sql
-- In migration
ALTER TABLE documents ADD COLUMN classification TEXT;   -- e.g. 'api/authentication'
ALTER TABLE documents ADD COLUMN summary TEXT;          -- first 500 chars or AI summary
ALTER TABLE documents ADD COLUMN tags TEXT;             -- JSON array: ["jwt","oauth"]

CREATE TABLE IF NOT EXISTS classifications (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,        -- 'api/authentication/jwt'
  label TEXT NOT NULL,              -- 'JWT Authentication'
  parent_path TEXT,                 -- 'api/authentication'
  context_profile TEXT NOT NULL,    -- which profile defines this node
  keywords TEXT,                    -- JSON array of detection keywords
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_classifications_parent ON classifications(parent_path);
CREATE INDEX IF NOT EXISTS idx_documents_classification ON documents(classification);
```

**Subtree query:**

```sql
-- All documents under 'api/' subtree
SELECT * FROM documents WHERE classification LIKE 'api/%' OR classification = 'api';
```

## Data Flow

### Request Flow — MCP Tool Call

```text
Claude Code agent calls tool "search_docs"
    ↓
mcp-server.mjs receives JSON-RPC over stdin
    ↓
Tool handler calls searchDocuments(db, query, filters)  [shared service module]
    ↓
SQLite FTS5 MATCH query executed
    ↓
Results serialized to JSON
    ↓
MCP returns content block via stdout JSON-RPC
    ↓
Claude Code receives structured result
```

### Request Flow — Scheduled Scan

```text
node-cron fires 'daily full scan' at 2 AM
    ↓
scheduler.mjs calls orchestrator.runFullScan(db, ctx)
    ↓
orchestrator calls scan-all-repos.mjs (file discovery + markdown-processor)
    ↓
orchestrator calls graph/relations.mjs buildRelationships()
    ↓
orchestrator calls keyword-processor.mjs extractKeywords()
    ↓
orchestrator updates scan_history with result counts
    ↓
statistics table updated
```

### Request Flow — Context Profile Boot

```text
daemon/server.mjs starts
    ↓
context/loader.mjs loadProfile(DOCUMIND_PROFILE env or default)
    ↓
Profile validated via Zod schema
    ↓
ctx object (profile + db) passed to initScheduler(ctx), initWatcher(ctx)
    ↓
Scheduler registers cron jobs with ctx in closure
    ↓
mcp-server.mjs (separate process) loads same profile independently
```

### State Management

- **SQLite WAL mode:** Both the Express process (port 9000) and the MCP stdio process read from the same `documind.db` file safely. WAL allows concurrent reads with one writer at a time. better-sqlite3 serializes writes within each process automatically.
- **Context profile:** Loaded once at startup, held in memory, re-read only on explicit reload command. No runtime mutation.
- **Classification tree:** Defined in the context profile JSON, synced to `classifications` table at startup. Documents get classification assigned during indexing.
- **Scheduler state:** All scheduler state is in SQLite (scan_history, statistics). No in-memory scheduler state survives restarts.

## Suggested Build Order (Dependency Constraints)

Phase ordering is driven by what each component depends on:

1. **Schema migration first** — classifications column, tags column, summary column, and context_profiles table must exist before any processor can write to them. All other phases depend on this.

2. **Context profile loader second** — `context/loader.mjs` is the configuration contract that all other new modules accept as input. Must exist before orchestrator or MCP server are written.

3. **Orchestrator third** — Depends on existing processors (all present) plus the context profile shape. Once orchestrator exists, scheduler TODOs can be replaced in a single pass.

4. **Scheduler wiring fourth** — Mechanically replaces `// TODO` stubs in `scheduler.mjs` with `orchestrator.*` calls. Depends on orchestrator.

5. **MCP server fifth** — Depends on shared service modules (which are already the Express handler implementations, refactored to be importable). Read tools come first (search, graph, keywords, tree) because they have no side effects. Write tools (index, lint, fix) come after read tools are confirmed working.

6. **Classification population sixth** — Depends on schema (Phase 1), context profile (Phase 2), and the orchestrator scan pipeline (Phase 3-4). Classification assignment runs during the next full scan.

## Integration Points

### MCP Server — Claude Code

| Interface | Pattern | Notes |
| --------- | ------- | ----- |
| Claude Code spawns `node daemon/mcp-server.mjs` | stdio JSON-RPC | Claude Code manages process lifecycle |
| Tool registry defined in `mcp-server.mjs` | `server.tool(name, schema, handler)` | @modelcontextprotocol/sdk ^1.x |
| Logging in mcp-server.mjs | `console.error()` only — never `console.log()` | stdout is reserved for JSON-RPC protocol |
| Shared DB access | WAL mode allows concurrent reads | MCP process reads; Express process reads+writes |

### Express Server — Existing Consumers

| Interface | Pattern | Notes |
| --------- | ------- | ----- |
| Claude Code hooks | `POST /hook` with event payload | Unchanged — hooks.mjs handles routing |
| CLI scripts | Direct DB access or `npm run` commands | Unchanged |
| `/scan` endpoint | Should call `orchestrator.runFullScan()` | Replaces inline scan logic in server.mjs |

### Context Profile — All Modules

| Interface | Pattern | Notes |
| --------- | ------- | ----- |
| Profile loading | `loadProfile(path)` → validated `ctx` object | Zod validates on startup; crash-fast on invalid profile |
| Profile path | `DOCUMIND_PROFILE` env var, fallback to `context/profiles/dvwdesign.json` | PM2 ecosystem.config.cjs sets env |
| Profile reloading | `POST /reload-profile` endpoint (optional) | Not required for Step #1 |

### SQLite — Multi-Process Safety

| Scenario | Safety | Mechanism |
| -------- | ------ | --------- |
| Express reads + MCP reads simultaneously | Safe | WAL mode — multiple readers OK |
| Express writes + MCP reads simultaneously | Safe | WAL mode — readers don't block writer |
| Express writes + MCP writes simultaneously | Unsafe (avoid) | MCP write tools should call Express endpoint instead of writing DB directly |
| Scheduler writes + Express reads | Safe | WAL mode |

**Recommendation:** MCP write tools (`trigger_scan`, `lint_file`, `fix_file`) should POST to `http://localhost:9000/<endpoint>` rather than accessing SQLite directly. This ensures Express is the single writer process and removes WAL contention risk for write operations.

## Anti-Patterns

### Anti-Pattern 1: Embedding MCP in the Express Process

**What people do:** Add MCP server initialization inside `daemon/server.mjs`, alongside `app.listen()`.

**Why it's wrong:** The MCP stdio transport claims `process.stdout` for JSON-RPC messages. Any existing `console.log` in `server.mjs` or its imported modules (there are many — scheduler logs, processor logs) will corrupt the protocol stream and break all tool calls silently.

**Do this instead:** `daemon/mcp-server.mjs` is a separate file with its own `import` graph. It imports only modules that have no `console.log` side effects (or that have been refactored to use `console.error`). PM2 registers it as a second process alongside `documind-http`.

### Anti-Pattern 2: Duplicating Scan Logic in Scheduler, HTTP Endpoint, and MCP Tool

**What people do:** Copy-paste the scan pipeline into the scheduler cron callback, the `/scan` POST handler, and the MCP `trigger_scan` tool.

**Why it's wrong:** The existing `scheduler.mjs` already shows this tendency — each cron job would independently import processors, manage scan_history, and handle errors. Any logic change requires three updates. Bugs diverge between entry points.

**Do this instead:** `orchestrator.mjs` is the single definition of each operation. All three entry points call `orchestrator.runFullScan(db, ctx)`. The orchestrator owns scan_history writes, error handling, and processor sequencing.

### Anti-Pattern 3: Hard-Coding Repo Paths in Processors

**What people do:** Import `REPO_ROOTS` from a constants file and reference `/Users/Shared/htdocs/github/DVWDesign/` directly in processor logic.

**Why it's wrong:** Makes DocuMind non-portable. Step #3 (commercial product) requires processors to work against any set of paths defined by the context profile.

**Do this instead:** All processors accept a `config` parameter (from `ctx.config`) that provides scan roots and repo list. The DVWDesign-specific paths live only in `context/profiles/dvwdesign.json`.

### Anti-Pattern 4: Nested Sets for Classification Tree

**What people do:** Implement classification as a nested set model because it avoids recursive queries for subtree traversal.

**Why it's wrong:** The classification tree changes when context profiles change. Nested sets require re-numbering all left/right values on any insert or delete — expensive for a tree that updates at startup or when profiles change.

**Do this instead:** Materialized path (`api/authentication/jwt`) in a `TEXT` column. Subtree queries use `LIKE 'api/%'` — fast with an index, trivially correct, and inserts/deletes touch only the affected row.

## Scaling Considerations

This is an internal single-user tool for Step #1 and #2. Step #3 (commercial) is a separate architecture decision.

| Scale | Architecture Adjustments |
| ----- | ------------------------ |
| Solo use (current) | SQLite is correct. PM2 daemon + stdio MCP is correct. No changes needed. |
| Team use (5-20 people) | SQLite handles concurrent reads fine. Add auth to Express endpoints. Consider Turso (SQLite over HTTP) if users are distributed. |
| SaaS (Step #3) | SQLite-per-tenant via Turso or migrate to Postgres. Context profiles become tenant config. Docker packaging replaces PM2. MCP server becomes Streamable HTTP transport instead of stdio. |

**First bottleneck at scale:** SQLite write lock contention if multiple users trigger scans simultaneously. Fix: queue scan requests; one writer at a time. For Step #1 (solo), this is not a concern.

## Sources

- MCP official docs, transport architecture: <https://modelcontextprotocol.io/specification/2025-11-25/basic/transports> (HIGH confidence)
- MCP TypeScript SDK: <https://github.com/modelcontextprotocol/typescript-sdk> (HIGH confidence)
- MCP build server guide: <https://modelcontextprotocol.io/docs/develop/build-server> (HIGH confidence)
- MCP + Express integration pattern: <https://dzone.com/articles/transform-nodejs-rest-api-to-mcp-server> (MEDIUM confidence — verified against SDK docs)
- Dual-transport MCP pattern (stdio + HTTP same codebase): <https://medium.com/@kumaran.isk/dual-transport-mcp-servers-stdio-vs-http-explained-bd8865671e1f> (MEDIUM confidence)
- SQLite hierarchical patterns — materialized path vs nested sets: <https://teddysmith.io/sql-trees/> (MEDIUM confidence — multiple sources agree)
- Externalized configuration pattern: <https://en.paradigmadigital.com/dev/architecture-patterns-in-microservices-externalized-configuration/> (MEDIUM confidence)
- Codebase analysis: existing `daemon/scheduler.mjs`, `daemon/server.mjs`, `graph/relations.mjs` (HIGH confidence — direct inspection)

---

*Architecture research for: DocuMind v3.0 — MCP + Classification + Context Profiles + Orchestration*
*Researched: 2026-03-15*
