# Stack Research

**Domain:** Documentation intelligence daemon — MCP server, classification/tagging, context profiles
**Researched:** 2026-03-15
**Confidence:** HIGH (MCP SDK), MEDIUM (classification patterns), MEDIUM (context profiles)

---

## Context

DocuMind v2.0 has a production-ready stack: Node.js 20+, Express 5, SQLite via better-sqlite3, PM2, node-cron, chokidar, natural (TF-IDF), zod. This research answers one question: **what new packages and schema patterns are needed for the three active milestone features** — MCP server, document classification/tagging, and context profiles?

The answer: one new npm package (`@modelcontextprotocol/sdk`) and one version bump (`zod` from `^3.22.4` to `^3.25.0`). Everything else is schema and code additions to the existing stack.

---

## Recommended Stack

### New Additions (Net-New to package.json)

| Library | Version | Purpose | Why Recommended |
| ------- | ------- | ------- | --------------- |
| `@modelcontextprotocol/sdk` | `^1.27.1` | MCP server + transport layer | The official Anthropic SDK. Only non-fork way to build a compliant MCP server. 33K+ npm dependents confirms it is the ecosystem standard. Provides `McpServer`, `StdioServerTransport`, `StreamableHTTPServerTransport`. |

### Version Bumps Required (Existing Dependencies)

| Library | Current | Required | Why |
| ------- | ------- | -------- | --- |
| `zod` | `^3.22.4` | `^3.25.0` | `@modelcontextprotocol/sdk` internally imports from `zod/v4` but requires zod `>=3.25.0` as a peer dependency. The current pinned range `^3.22.4` may resolve to a version below that floor, causing SDK import errors at runtime. |

**Confidence:** HIGH — verified against official MCP SDK GitHub issue tracker and npm package metadata.

### Core Technologies (Already Present — No Changes)

| Technology | Version | Purpose | Status |
| ---------- | ------- | ------- | ------ |
| `better-sqlite3` | `^12.6.2` | SQLite for graph, classification, profiles | Stays. Schema additions only. |
| `express` | `^5.2.1` | REST API + MCP HTTP transport mount point | Stays. MCP mounts on `POST /mcp`. |
| `natural` | `^8.1.1` | TF-IDF keyword extraction | Stays. Already wired to keywords table. |
| `node-cron` | `^3.0.3` | Scheduled tasks | Stays. Needs wiring to processors. |
| `zod` | bump to `^3.25.0` | Schema validation + MCP tool schemas | Bump version only. |
| `fast-glob` | `^3.3.2` | Repo scanning | Stays. |
| `gray-matter` | `^4.0.3` | Frontmatter parsing | Stays. |

---

## MCP Server Implementation Details

### Transport Strategy

DocuMind should expose two transports from the same process:

1. **Stdio** — for Claude Code integration (`claude_desktop_config.json`, Claude Code MCP settings). Claude Code launches DocuMind as a subprocess and communicates over stdin/stdout. This is the primary integration target for Step #2.

2. **StreamableHTTP mounted on Express** — for remote clients, future CI integrations, and Step #3 portability. Mount at `POST /mcp` on the existing port 9000 Express server.

Do NOT run two separate server processes. Mount both transports from `daemon/server.mjs`.

### Key Import Paths (verified)

```javascript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
```

### Express Mount Pattern

```javascript
// In daemon/server.mjs — add alongside existing routes
app.post('/mcp', express.json(), async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

`sessionIdGenerator: undefined` = stateless mode (correct for a single-tenant daemon).

### Stdio Logging Constraint

When the stdio transport is active, **never write to stdout** — it carries JSON-RPC messages. All logs must go to `stderr` or the PM2 log file. This is a hard constraint that affects `daemon/server.mjs` and all processors when called from MCP context.

### MCP Inspector (Dev Tool)

```bash
npx @modelcontextprotocol/inspector node daemon/mcp-server.mjs
```

Use this to test tools interactively before wiring into Claude Code. Add to `package.json` scripts as `mcp:inspect`.

### Zod and Tool Schema

Each MCP tool definition takes a Zod schema for parameters. All field descriptions are mandatory — Claude reads them to decide how to call the tool:

```javascript
server.tool('search', 'Full-text search across all indexed documents', {
  query: z.string().describe('The search query string'),
  repo: z.string().optional().describe('Filter results to a specific repository name'),
  limit: z.number().default(20).describe('Maximum number of results to return'),
}, async ({ query, repo, limit }) => {
  // Call existing search logic
});
```

The existing `zod` dependency in DocuMind covers this — no separate install needed after the version bump.

---

## Document Classification and Tagging — Schema Pattern

### Approach: Two-Level System in SQLite

Classification (hierarchical tree) and tagging (flat, multi-value) serve different purposes and need different schema patterns.

**Classification = where in the taxonomy a document lives** (single parent path, e.g., `architecture/decisions`). Use the **Adjacency List with recursive CTE** — SQLite supports this natively and the project already uses recursive CTEs in `graph/queries.mjs`.

**Tags = cross-cutting labels** (many per document, e.g., `api`, `draft`, `reviewed`). Use a **normalized tag table + junction table** — standard many-to-many, fast with composite indexes.

### Classification Schema (Adjacency List)

```sql
-- Already partially exists as folder_nodes. Extend documents table:
ALTER TABLE documents ADD COLUMN classification TEXT;         -- e.g. 'architecture/decisions'
ALTER TABLE documents ADD COLUMN classification_depth INTEGER DEFAULT 0;  -- 0=root, 1=second, etc.
ALTER TABLE documents ADD COLUMN summary TEXT;               -- 500-word auto-generated summary
```

Store the full path string (`architecture/decisions`) rather than a foreign key to a separate taxonomy table. Rationale: DocuMind's classification tree is defined per context profile (see below), not universally. Storing the path string means the classification is portable — the documents table doesn't need to reference a taxonomy table that varies per deployment.

### Tagging Schema (Many-to-Many)

```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT,  -- 'status' | 'type' | 'audience' | 'custom'
  color TEXT,     -- For future UI rendering
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE document_tags (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  tagged_at TEXT DEFAULT (datetime('now')),
  tagged_by TEXT DEFAULT 'system',  -- 'system' | 'user' | 'mcp'
  PRIMARY KEY (document_id, tag_id)
);

CREATE INDEX idx_document_tags_doc ON document_tags(document_id);
CREATE INDEX idx_document_tags_tag ON document_tags(tag_id);
CREATE INDEX idx_tags_name ON tags(name);
```

**Confidence:** MEDIUM — standard relational pattern, verified against SQLite forum discussions and closure table research. Not novel technology.

### What NOT to Use for Classification

Do NOT use the Nested Set Model (left/right integers). Insertions and moves require recalculating all left/right values — expensive for a live-indexed system where documents are added continuously. The Adjacency List + CTE pattern that already exists in `graph/queries.mjs` is the right choice.

Do NOT use a Closure Table for classification at this scale. Closure Tables precompute every ancestor-descendant pair — valuable when you have thousands of tree traversals per second. DocuMind's classification is read occasionally; the overhead is not justified.

---

## Context Profiles — Schema and File Pattern

### What a Context Profile Is

A JSON config file that makes DocuMind's behavior portable across deployments. It defines: which repos to scan, how to classify documents, what lint rules to enforce, and what keyword taxonomies to use. Swapping the profile adapts DocuMind for a marketing team vs. an engineering team without code changes.

### Profile Schema (JSON)

```json
{
  "id": "dvwdesign-internal",
  "name": "DVWDesign Internal",
  "version": "1.0.0",
  "repositories": [
    { "name": "DocuMind", "path": "/Users/Shared/htdocs/github/DVWDesign/DocuMind", "active": true }
  ],
  "classification_tree": {
    "architecture": ["decisions", "diagrams", "patterns"],
    "operations": ["runbooks", "incidents", "deploy"],
    "product": ["specs", "roadmaps", "changelogs"]
  },
  "keyword_taxonomy": {
    "technology": ["sqlite", "node", "express", "mcp"],
    "action": ["implement", "refactor", "deprecate", "migrate"]
  },
  "lint_rules": {
    "profile": "strict",
    "custom_patterns": "config/custom-error-patterns.json"
  },
  "relationship_types": ["imports", "parent_of", "variant_of", "supersedes", "depends_on", "related_to", "generated_from", "dispatched_to"]
}
```

### Profile Storage in SQLite

```sql
CREATE TABLE context_profiles (
  id TEXT PRIMARY KEY,               -- slug, e.g. 'dvwdesign-internal'
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  config_json TEXT NOT NULL,         -- Full JSON blob
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Only one profile can be active
CREATE UNIQUE INDEX idx_active_profile ON context_profiles(is_active) WHERE is_active = 1;
```

Also write the active profile to disk at `config/context-profile.json` on activation. This enables both database-driven and file-driven profile loading — important for CLI workflows where the DB may not be running.

### Profile Loading Pattern

```javascript
// In daemon/server.mjs — load at startup, no external library needed
async function loadContextProfile() {
  const row = db.prepare('SELECT config_json FROM context_profiles WHERE is_active = 1').get();
  if (row) return JSON.parse(row.config_json);
  // Fallback: load from disk
  const file = await fs.readFile('./config/context-profile.json', 'utf8');
  return JSON.parse(file);
}
```

No external library needed — native `JSON.parse` + `fs.readFile`. Validate the loaded profile with a Zod schema to catch malformed profiles at startup.

**Confidence:** MEDIUM — pattern derived from multi-tenant Node.js SaaS conventions and MCP specification's use of JSON Schema 2020-12. No specific library exists for this pattern; it is intentionally hand-rolled.

---

## Graph Population — No New Libraries Needed

The `graph/relations.mjs` module (`buildRelationships`) exists but is never called from the scheduler. The `doc_relationships` table schema exists. No new library is needed — the gap is wiring, not technology.

The existing `fast-levenshtein` and `string-similarity` packages cover similarity scoring. The existing `natural` package covers TF-IDF for keyword extraction. The existing recursive CTE support in better-sqlite3 covers graph traversal.

Action: wire `buildRelationships()` into the hourly cron job in `daemon/scheduler.mjs`.

---

## What NOT to Use

| Avoid | Why | Use Instead |
| ----- | --- | ----------- |
| Forked or third-party MCP SDKs | The official `@modelcontextprotocol/sdk` is the only actively maintained, spec-compliant implementation. Forks risk falling behind the protocol. | `@modelcontextprotocol/sdk` |
| sqlite-vec / vector embeddings for similarity | Semantic search via embeddings is explicitly out of scope (PROJECT.md). TF-IDF + Levenshtein is sufficient for the 50K doc ceiling. | `natural` (TF-IDF) + `fast-levenshtein` |
| Nested Set Model for classification | Expensive inserts/moves, complex queries. Not suitable for a continuously-indexed system. | Adjacency List path strings + recursive CTE |
| Closure Table for classification | Overkill at DocuMind scale; precomputes every ancestor pair, adds write overhead. | Adjacency List path strings |
| Separate MCP daemon process | Running MCP as a separate PM2 process adds coordination overhead. Mount on existing Express server. | `StreamableHTTPServerTransport` on existing Express port 9000 |
| TypeScript migration for MCP | DocuMind is `.mjs` (ES modules, plain JavaScript). The SDK works with plain JS — TypeScript is optional. Migrating for MCP alone is not justified. | Plain `.mjs` with JSDoc types |

---

## Installation

```bash
# New dependency
npm install @modelcontextprotocol/sdk

# Version bump (edit package.json then install)
# Change: "zod": "^3.22.4"
# To:     "zod": "^3.25.0"
npm install
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
| ----------- | ----------- | ----------------------- |
| `@modelcontextprotocol/sdk` | `mcp-framework` (third-party) | Never for this project — framework abstracts too much, less control, diverges from spec faster |
| Stdio + StreamableHTTP dual transport | Stdio-only | If DocuMind never goes remote or commercial. For Step #3 portability, StreamableHTTP is required. |
| Adjacency List path strings for classification | Foreign key taxonomy table | If classification tree needs to be queried hierarchically at high frequency. Not the case here — profiles define the tree, not DocuMind's tables. |
| JSON file + SQLite for context profiles | Database-only profiles | The file fallback enables CLI workflows without the daemon running. Both are needed. |

---

## Version Compatibility

| Package | Compatible With | Notes |
| ------- | --------------- | ----- |
| `@modelcontextprotocol/sdk@^1.27.1` | `zod@>=3.25.0` | SDK internally uses `zod/v4` compat layer. Peer dep floor is 3.25. Current DocuMind zod `^3.22.4` must be bumped. |
| `@modelcontextprotocol/sdk@^1.27.1` | `express@5.x` | No conflict. MCP HTTP transport uses raw Node `http.IncomingMessage` / `http.ServerResponse` — compatible with Express 5 handlers. |
| `@modelcontextprotocol/sdk@^1.27.1` | `node@>=18` | SDK requires Node 18+. DocuMind already requires Node 20+. No issue. |

---

## Sources

- [@modelcontextprotocol/sdk npm page](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — version 1.27.1 confirmed current stable (MEDIUM confidence — could not fetch npm page directly, verified via search)
- [MCP TypeScript SDK GitHub releases](https://github.com/modelcontextprotocol/typescript-sdk/releases) — v1.27.1 confirmed via WebFetch (HIGH confidence)
- [MCP Build a Server docs](https://modelcontextprotocol.io/docs/develop/build-server) — Key imports, stdio/StreamableHTTP transports (HIGH confidence — official docs)
- [MCP SDK zod compat issue #925](https://github.com/modelcontextprotocol/typescript-sdk/issues/925) — Zod 3.25 minimum requirement confirmed (HIGH confidence)
- [SQLite hierarchical data strategies](https://moldstud.com/articles/p-strategies-for-managing-hierarchical-data-structures-in-sqlite) — Adjacency List vs Closure Table tradeoffs (MEDIUM confidence)
- [Closure Tables in SQL 2025](https://www.vibepanda.io/resources/guide/handling-hierarchical-data-closure-tables-sql) — Confirmed Closure Table is read-optimized, not write-optimized (MEDIUM confidence)
- [Integrating MCP into Express](https://dev.to/udarabibile/integrating-mcp-tools-into-express-with-minimal-changes-28e6) — `POST /mcp` mount pattern confirmed (MEDIUM confidence — community article, not official docs)
- [MCP 2026 security audit (43% command injection)](https://atlan.com/know/mcp-server-implementation-guide/) — Zod validation on all tool inputs is non-optional (MEDIUM confidence)

---

*Stack research for: DocuMind v3.0 — MCP server + classification + context profiles*
*Researched: 2026-03-15*
