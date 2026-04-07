# Architecture Research

**Domain:** Documentation Intelligence Platform — Kuzu Graph DB + LangChain Text-to-Cypher Integration
**Researched:** 2026-04-07
**Confidence:** HIGH (codebase inspected directly; Kuzu Node.js API confirmed via official docs and npm; LangChain.js GraphCypherQAChain confirmed; algo extension limitations confirmed from official docs)

---

## Context: What This Milestone Adds

DocuMind v3.3 adds a second embedded database alongside the existing SQLite. SQLite keeps FTS5 full-text search, metadata, linting, keywords, and all non-graph tables. Kuzu takes over graph operations: typed edge storage, Cypher queries, graph algorithms (PageRank, centrality, cycle detection), and natural-language graph queries via LangChain.

### Critical design constraint

Kuzu enforces a single-writer ownership rule: only one `Database` object pointing to a given path may be open at a time across the entire process (and across all processes). A READ_WRITE instance blocks all other READ_WRITE or READ_ONLY instances on the same path. This means the single `server.mjs` process owns the Kuzu `Database` object for its lifetime, and all other callers (MCP tools, REST endpoints) share connections from that same object — they do not create their own `Database` instances.

---

## Standard Architecture

### System Overview: Dual-DB Architecture (v3.3 Target)

```text
┌─────────────────────────────────────────────────────────────────────┐
│                   DocuMind Process (PM2 / Docker)                    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  daemon/server.mjs  — Express :9000                          │   │
│  │                                                              │   │
│  │  db (better-sqlite3)    kuzuDb (kuzu.Database)               │   │
│  │       ↓                        ↓                            │   │
│  │  FTS5 search            Graph operations                     │   │
│  │  Metadata               Cypher queries                       │   │
│  │  Keywords               PageRank / centrality                │   │
│  │  Linting issues         Cycle detection                      │   │
│  │  Diagrams               Natural language queries             │   │
│  └───────────┬─────────────────────┬────────────────────────────┘   │
│              │                     │                                 │
│  ┌───────────▼──────┐  ┌───────────▼───────────────────────────┐   │
│  │ data/documind.db │  │ data/documind.kuzu/  (directory)       │   │
│  │ (SQLite WAL)     │  │ (Kuzu on-disk store)                   │   │
│  └──────────────────┘  └───────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Sync Bridge  graph/kuzu-sync.mjs                            │   │
│  │  Reads doc_relationships from SQLite                         │   │
│  │  Upserts Document nodes + typed edges into Kuzu              │   │
│  │  Called at: startup, after buildRelationships(), on demand   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  graph/kuzu-queries.mjs  — all Cypher operations             │   │
│  │  Wraps kuzu.Connection, returns plain JS objects             │   │
│  │  Used by: REST /graph, MCP tools, LangChain bridge           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  graph/langchain-bridge.mjs  — text-to-Cypher                │   │
│  │  GraphCypherQAChain (LangChain.js) + KuzuGraphAdapter        │   │
│  │  Runs in-process (no subprocess)                             │   │
│  │  Requires OPENAI_API_KEY (or other LLM provider)             │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Status | Responsibility | Communicates With |
| --- | --- | --- | --- |
| `daemon/server.mjs` | MODIFIED | Initializes both `db` (SQLite) and `kuzuDb` (Kuzu); passes both to routes/scheduler; updated `/graph` endpoint | SQLite, Kuzu, scheduler, processors |
| `daemon/mcp-server.mjs` | MODIFIED | Receives `kuzuDb` alongside `db`; new tools: `graph_query`, `graph_rank`, `graph_cycles` | kuzu-queries.mjs, langchain-bridge.mjs |
| `daemon/scheduler.mjs` | MODIFIED | After `buildRelationships()` in daily/weekly crons, calls `syncRelationshipsToKuzu()` | kuzu-sync.mjs |
| `graph/relations.mjs` | UNCHANGED | Still writes to SQLite `doc_relationships`. Remains the source of truth for edge writes. | SQLite only |
| `graph/kuzu-sync.mjs` | NEW | Reads `doc_relationships` from SQLite; upserts into Kuzu. Idempotent. Handles schema creation on first run. | SQLite (read), Kuzu (write) |
| `graph/kuzu-queries.mjs` | NEW | All Cypher read queries: traversal, reverse traversal, PageRank, centrality, cycle detection | Kuzu (read), kuzu-sync.mjs |
| `graph/langchain-bridge.mjs` | NEW | `GraphCypherQAChain` wired to KuzuGraphAdapter. Accepts natural language, returns structured result | kuzu-queries.mjs, LLM API |
| `config/env.mjs` | MODIFIED | Add `KUZU_DB_PATH`, `KUZU_SYNC_ON_STARTUP`, `OPENAI_API_KEY` (or `LANGCHAIN_LLM_PROVIDER`) | All consumers |
| `data/documind.kuzu/` | NEW (data dir) | Kuzu on-disk store directory (not a single file like SQLite) | Kuzu Database object only |

---

## Recommended Project Structure Changes

```text
DocuMind/
├── daemon/
│   ├── server.mjs          MODIFIED — init kuzuDb alongside db; pass to all routes
│   ├── mcp-server.mjs      MODIFIED — add 3 new graph intelligence tools
│   └── scheduler.mjs       MODIFIED — call syncRelationshipsToKuzu after buildRelationships
│
├── graph/
│   ├── relations.mjs       UNCHANGED — SQLite edge writer (source of truth)
│   ├── kuzu-sync.mjs       NEW — SQLite → Kuzu bridge (sync/upsert)
│   ├── kuzu-queries.mjs    NEW — all Cypher queries (traversal, algorithms, cycle)
│   └── langchain-bridge.mjs NEW — text-to-Cypher via GraphCypherQAChain
│
├── config/
│   └── env.mjs             MODIFIED — KUZU_DB_PATH, KUZU_SYNC_ON_STARTUP, LLM config
│
└── data/
    ├── documind.db          UNCHANGED — SQLite (FTS5, metadata, keywords, etc.)
    └── documind.kuzu/       NEW — Kuzu on-disk store (directory, not a file)
```

### Why Kuzu gets its own directory (not a .db file)

Kuzu stores its data as a directory containing multiple column files, WAL, and catalog files — not as a single `.db` file like SQLite. The path passed to `new kuzu.Database(path)` must point to a directory. This directory must be listed in `.dockerignore` and `.gitignore` alongside `data/documind.db`.

---

## Kuzu Node.js API — Confirmed Patterns

Confidence: HIGH (official docs, npm package confirmed, ES module support confirmed)

### Installation

```bash
npm install kuzu
```

The `kuzu` npm package ships pre-built native binaries. No node-gyp rebuild required (unlike better-sqlite3). Supports ES module imports in Node.js.

### Initialization (ES module, async API)

```javascript
import { Database, Connection } from 'kuzu';

// In server.mjs startup
const kuzuDb = new Database(KUZU_DB_PATH);          // opens/creates directory
const kuzuConn = new Connection(kuzuDb);             // single shared connection for standard queries
await kuzuConn.query(`...`);                         // async, returns QueryResult
const rows = await result.getAll();                  // Array of plain objects
```

### Sync API (for graph algorithm projected graphs)

Kuzu provides both async and sync APIs. The async API uses a connection pool internally. The **critical limitation**: projected graphs (required for PageRank and other algo extension algorithms) are bound to a specific connection instance. The async API's connection pool may route queries to different connections, making the projected graph unavailable.

**Workaround:** For algorithm queries, use the sync `Connection` API or a dedicated single `Connection` object held for the duration of the algorithm run. The algo extension (PageRank, Connected Components, Louvain) is pre-installed in Kuzu >= 0.11.3.

```javascript
// Projected graph + PageRank (use dedicated connection, not pool)
const algoConn = new Connection(kuzuDb);  // dedicated connection for algorithm runs
await algoConn.query(`CALL PROJECT_GRAPH('DocGraph', ['Document'], ['RELATES_TO', 'IMPORTS', 'SUPERSEDES'])`);
const result = await algoConn.query(`CALL page_rank('DocGraph') RETURN node.path, rank ORDER BY rank DESC LIMIT 20`);
```

### Kuzu schema for DocuMind documents

```text
Node table:  Document { id: INT64, path: STRING, repository: STRING, filename: STRING, category: STRING }
Edge tables: IMPORTS    (Document → Document) { weight: DOUBLE, link_text: STRING }
             DISPATCHED_TO (Document → Document) { target_repo: STRING }
             SUPERSEDES (Document → Document) { confidence: DOUBLE }
             RELATED_TO (Document → Document) { reason: STRING, weight: DOUBLE }
             PARENT_OF  (Document → Document)
             VARIANT_OF (Document → Document)
             DEPENDS_ON (Document → Document)
             GENERATED_FROM (Document → Document)
```

This mirrors the 8 relationship types in SQLite's `doc_relationships` table.

---

## Data Flow: SQLite → Kuzu Sync

The sync is unidirectional. SQLite remains the write source. Kuzu is a read-optimized graph projection of the same data.

### Sync trigger points

```text
1. Startup sync (conditional):
   server.mjs starts
       ↓
   if (KUZU_SYNC_ON_STARTUP) syncRelationshipsToKuzu(db, kuzuDb)
       ↓ (reads all doc_relationships from SQLite, upserts to Kuzu)
   Express server starts accepting requests

2. Post-relationship-build sync (daily + weekly crons):
   scheduler.mjs: CRON_DAILY fires
       ↓
   runScan(db, ctx, { mode: 'full' })
       ↓  (existing path — builds all relationships in SQLite)
   buildRelationships(db)   [graph/relations.mjs — UNCHANGED]
       ↓
   syncRelationshipsToKuzu(db, kuzuDb)   [NEW — graph/kuzu-sync.mjs]
       ↓
   Kuzu graph reflects current SQLite edge state

3. On-demand sync (via REST or MCP):
   POST /graph/sync
       ↓
   syncRelationshipsToKuzu(db, kuzuDb)
   → useful during development or after manual edge manipulation
```

### What kuzu-sync.mjs does

```text
1. Ensure Kuzu schema exists (CREATE NODE TABLE IF NOT EXISTS, etc.)
2. DELETE all existing Document nodes (CASCADE deletes edges)
   - Simpler than incremental upsert; graph is rebuilt from SQLite
   - Full rebuild takes < 1 second for 8K documents / ~50K edges (benchmark estimate)
3. Batch-insert all documents as Kuzu nodes
4. Batch-insert all doc_relationships rows as typed Kuzu edges
   - Maps relationship_type string → correct Kuzu edge table
5. Return { nodes: N, edges: M, durationMs: X }
```

Full rebuild is preferred over incremental upsert because:

- Kuzu does not support MERGE/upsert with the same ergonomics as SQLite's INSERT OR IGNORE
- The graph is rebuilt from SQLite after every full scan anyway (idempotent by design)
- At 8K nodes / 50K edges, a full Kuzu rebuild completes in well under one second

---

## LangChain Text-to-Cypher: Architecture Decision

### The gap: LangChain.js has no Kuzu adapter

The Python `langchain-kuzu` package provides `KuzuQAChain` but no equivalent exists in LangChain.js. LangChain.js has `GraphCypherQAChain` which works with Neo4j via the `Neo4jGraph` class. `GraphCypherQAChain` accepts any graph object that implements `getSchema()` and `query()`.

**Decision:** Implement a minimal `KuzuGraphAdapter` class that satisfies the `GraphCypherQAChain` interface. This is ~50 lines of code and avoids a Python subprocess dependency.

Confidence: MEDIUM (GraphCypherQAChain interface confirmed in LangChain.js docs; custom adapter pattern inferred from interface contract — not an officially documented pattern but structurally sound)

### KuzuGraphAdapter interface

```javascript
// graph/langchain-bridge.mjs

class KuzuGraphAdapter {
  constructor(conn, schemaString) {
    this.conn = conn;
    this.schema = schemaString;  // static — generated at startup from Kuzu schema
  }

  getSchema() {
    return this.schema;
  }

  async query(cypherQuery) {
    const result = await this.conn.query(cypherQuery);
    return result.getAll();  // returns Array<plain object>
  }
}
```

### GraphCypherQAChain wiring

```javascript
import { GraphCypherQAChain } from 'langchain/chains/graph_qa/cypher';
import { ChatOpenAI } from '@langchain/openai';  // or anthropic, etc.

const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini' });
const adapter = new KuzuGraphAdapter(kuzuConn, buildSchemaString());
const chain = GraphCypherQAChain.fromLLM({ llm, graph: adapter });

// Usage:
const result = await chain.invoke({ query: 'Which documents are most referenced?' });
```

### In-process vs subprocess

LangChain.js runs in-process in the same Node.js process as the daemon. No Python subprocess is spawned. The LLM calls are outbound HTTP to the LLM API (OpenAI, Anthropic, etc.).

**Why in-process:** The LLM call is already the bottleneck (network latency). Running LangChain.js in-process avoids IPC serialization overhead and keeps the architecture simple.

**Dependency:** LangChain text-to-Cypher requires an LLM API key. The `graph_query` MCP tool must return a graceful error (not crash) when no LLM key is configured. Standard queries that don't require LLM (direct Cypher via `graph_rank`, `graph_cycles`) must work without any LLM key.

---

## New Components: File-by-File

### graph/kuzu-sync.mjs (NEW)

```text
Exports:
  syncRelationshipsToKuzu(db, kuzuDb) → Promise<{ nodes, edges, durationMs }>
  initKuzuSchema(kuzuDb) → Promise<void>  (called once at startup)

Reads from:  SQLite — documents + doc_relationships
Writes to:   Kuzu — Document nodes, all 8 edge tables
Pattern:     Full rebuild (DELETE all → batch insert)
```

### graph/kuzu-queries.mjs (NEW)

```text
Exports:
  traverseFrom(conn, docId, hops)     → replaces findRelated() for graph ops
  reverseTraversal(conn, docId, hops) → who links TO this doc (not possible with SQLite CTE easily)
  pageRankTop(conn, limit)            → top N docs by PageRank score
  centralityTop(conn, limit)          → top N by betweenness centrality
  detectCycles(conn)                  → returns cycle paths in the graph
  runCypherQuery(conn, cypher)        → raw Cypher passthrough (for LangChain bridge)

Each function:
  - accepts a kuzu.Connection (caller manages lifecycle)
  - returns plain JS arrays/objects (no Kuzu-specific types leaked)
  - handles async properly (Kuzu Node.js async API)
```

### graph/langchain-bridge.mjs (NEW)

```text
Exports:
  createGraphQAChain(kuzuDb) → GraphCypherQAChain (or null if no LLM key)
  queryGraph(chain, naturalLanguageQuery) → Promise<string>

Internals:
  KuzuGraphAdapter class (implements getSchema + query)
  buildSchemaString(kuzuDb) → generates schema description from Kuzu catalog
```

---

## Modified Components: What Changes

### daemon/server.mjs

```text
Changes:
1. Import Database from 'kuzu'
2. const kuzuDb = new kuzu.Database(KUZU_DB_PATH) after SQLite init
3. Pass kuzuDb to: initScheduler(), route handlers for /graph
4. On startup: await initKuzuSchema(kuzuDb), optionally syncRelationshipsToKuzu()
5. Update GET /graph endpoint to query Kuzu instead of SQLite document_graph view
6. Add POST /graph/sync endpoint (on-demand sync trigger)
7. On SIGTERM: close kuzuDb connection before process.exit (Kuzu flushes WAL on close)
```

### daemon/mcp-server.mjs

```text
Changes:
1. Accept kuzuDb parameter (or import shared kuzuDb singleton)
2. New tool: graph_query — text-to-Cypher via langchain-bridge.mjs
3. New tool: graph_rank  — PageRank top-N, returns ranked document list
4. New tool: graph_cycles — returns detected cycles (for editorial review)
5. Existing tool: get_related — keep as-is (still works from SQLite via findRelated)
   OR: migrate get_related to kuzu-queries.traverseFrom() for consistency
```

The decision on `get_related` migration: keep it on SQLite for v3.3. The new Kuzu tools are additive. Migrating `get_related` is a follow-on cleanup.

### daemon/scheduler.mjs

```text
Changes:
1. Accept kuzuDb parameter
2. In CRON_DAILY handler: after runScan() completes, call syncRelationshipsToKuzu(db, kuzuDb)
3. In CRON_WEEKLY handler: same — sync after deep scan
4. Hourly cron does NOT sync (too frequent; relationships only rebuild on full/deep scans)
```

### config/env.mjs

```text
New exports:
  KUZU_DB_PATH       — path.resolve(ROOT, process.env.DOCUMIND_KUZU_DB ?? 'data/documind.kuzu')
  KUZU_SYNC_ON_STARTUP — process.env.KUZU_SYNC_ON_STARTUP !== 'false'  (default: true)
  LLM_API_KEY        — process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? null
  LLM_MODEL          — process.env.DOCUMIND_LLM_MODEL ?? 'gpt-4o-mini'
```

---

## Suggested Build Order

Dependencies drive this order. Each phase is independently testable before the next begins.

```text
Phase 1: Install + schema bootstrap
  - npm install kuzu
  - Write graph/kuzu-sync.mjs (initKuzuSchema only — no sync yet)
  - Add KUZU_DB_PATH to config/env.mjs
  - Modify server.mjs: open kuzuDb, call initKuzuSchema on startup
  - Verify: server starts, data/documind.kuzu/ directory created, /health still returns 200
  - Why first: Every other phase requires a live Kuzu database with schema

Phase 2: SQLite → Kuzu sync bridge
  - Complete graph/kuzu-sync.mjs (syncRelationshipsToKuzu full rebuild logic)
  - Add POST /graph/sync endpoint to server.mjs
  - Wire KUZU_SYNC_ON_STARTUP in server.mjs startup sequence
  - Verify: curl -X POST localhost:9000/graph/sync returns { nodes: N, edges: M }
  - Check: data/documind.kuzu/ grows in size; Kuzu explorer confirms nodes/edges
  - Why second: All graph queries depend on data being in Kuzu

Phase 3: Cypher query layer + updated /graph endpoint
  - Write graph/kuzu-queries.mjs (traverseFrom, reverseTraversal, pageRankTop, centralityTop, detectCycles)
  - Note: pageRankTop and centralityTop require dedicated Connection (projected graph limitation)
  - Update GET /graph in server.mjs to use kuzu-queries instead of document_graph SQLite view
  - Verify: GET /graph returns same shape as before (backwards compatible response)
  - Verify: GET /graph?algo=pagerank returns ranked docs
  - Why third: Validates the sync data is queryable before wiring into MCP

Phase 4: Scheduler integration
  - Modify scheduler.mjs: pass kuzuDb, call syncRelationshipsToKuzu after daily/weekly scans
  - Verify: trigger a manual scan, confirm Kuzu edge count increases to match new relationships
  - Why fourth: Sync is already proven (Phase 2); scheduler just adds the automated trigger

Phase 5: New MCP tools (graph_rank + graph_cycles)
  - Modify mcp-server.mjs: add graph_rank and graph_cycles tools
  - Tools call kuzu-queries.pageRankTop() and kuzu-queries.detectCycles()
  - Verify: call tools from Claude Code, confirm structured output
  - Why fifth: Tools depend on kuzu-queries being stable (Phase 3)

Phase 6: LangChain text-to-Cypher (graph_query MCP tool)
  - npm install langchain @langchain/openai (or @langchain/anthropic)
  - Write graph/langchain-bridge.mjs (KuzuGraphAdapter + GraphCypherQAChain wiring)
  - Add graph_query MCP tool to mcp-server.mjs
  - Requires: LLM_API_KEY in environment
  - Graceful degradation: if no LLM key, graph_query returns instructive error
  - Verify: natural language query returns plausible Cypher + results
  - Why last: Highest complexity, external dependency (LLM API). All graph infrastructure
    must be stable before adding the LLM layer.
```

---

## Integration Points

### Kuzu + SQLite coexistence in the same Node.js process

No conflict. SQLite (via better-sqlite3) is synchronous and operates on `.db` files. Kuzu (via the `kuzu` npm package) is async and operates on a directory. They use separate file handles, separate memory buffers, and separate locking mechanisms. Both can be open simultaneously without interference.

The only coordination needed: the sync bridge reads from SQLite and writes to Kuzu in sequence. No transaction spanning both databases is attempted (not possible, not needed — Kuzu is a read projection of SQLite data).

### Kuzu Database object lifecycle

```text
server.mjs owns the single kuzu.Database instance.
All modules that need Kuzu receive kuzuDb (the Database object) as a parameter.
They create their own Connection objects locally as needed.
Connection objects are lightweight and can be created/destroyed per query.
Exception: algo queries (PageRank) require a Connection held for the projected graph's lifetime
  → kuzu-queries.mjs manages a dedicated algoConn for the duration of each algo call.
```

### Docker / data volume

Kuzu's data directory (`data/documind.kuzu/`) must be in the same named volume as the SQLite file. Both live under `data/`:

```text
Named volume documind_data → /app/data/
  /app/data/documind.db          (SQLite)
  /app/data/documind.kuzu/       (Kuzu directory)
```

No Dockerfile change needed — the existing `documind_data` volume already mounts `/app/data`. Add `data/documind.kuzu/` to `.gitignore`.

### better-sqlite3 native binaries + Kuzu native binaries in Alpine Docker

Kuzu ships pre-built binaries via npm (no node-gyp). In Alpine Docker, the Dockerfile's existing `npm ci --omit=dev` in the deps stage will download the correct pre-built Kuzu binary for Linux musl. This is simpler than better-sqlite3 (which does require rebuild). No Dockerfile changes required for Kuzu.

---

## Anti-Patterns

### Anti-Pattern 1: Creating multiple kuzu.Database instances

**What people do:** Each module that needs Kuzu creates `new kuzu.Database(path)` independently (mirroring the SQLite pattern in express routes).

**Why it's wrong:** Kuzu enforces a single READ_WRITE Database object per path. A second `new Database(path)` while the first is open will either throw or corrupt. The error happens silently in some configurations.

**Do this instead:** Create one `kuzuDb` instance in `server.mjs` at startup. Pass it as a parameter to all consumers. Never instantiate `Database` in any module other than `server.mjs`.

### Anti-Pattern 2: Running projected graph queries through the async connection pool

**What people do:** Use the standard async `Connection` for PageRank/centrality queries (same as traversal queries).

**Why it's wrong:** Projected graphs are bound to a specific connection. The async API uses a connection pool. The pool may route subsequent queries to a different connection, making the projected graph "not found."

**Do this instead:** In `kuzu-queries.mjs`, create a dedicated `Connection` object for algorithm queries. Run `PROJECT_GRAPH` and the algorithm query on the same connection object. Destroy the connection after the algorithm completes.

### Anti-Pattern 3: Writing graph edges directly to Kuzu (bypassing SQLite)

**What people do:** Modify `relations.mjs` to write edges to Kuzu instead of (or in addition to) SQLite.

**Why it's wrong:** SQLite `doc_relationships` is the source of truth for all downstream processors (deviation analysis, linting, etc.). Splitting the write path creates two sources of truth. The sync model is unidirectional for a reason.

**Do this instead:** Keep all writes in `relations.mjs` → SQLite. Sync to Kuzu is always a read projection via `kuzu-sync.mjs`. If real-time Kuzu writes become necessary later, implement a change-event queue between the two.

### Anti-Pattern 4: Calling `syncRelationshipsToKuzu` on every incremental scan

**What people do:** Wire the sync into the hourly incremental scan cron.

**Why it's wrong:** Incremental scans update documents and keywords, but they do NOT call `buildRelationships()`. Kuzu would re-sync the same relationship data every hour with no benefit. A full rebuild for 50K edges takes < 1 second — the waste is in the unnecessary scheduling overhead and log noise.

**Do this instead:** Sync only after `buildRelationships()` is called — which is daily and weekly scans only. The hourly cron skips relationship building and therefore skips Kuzu sync.

### Anti-Pattern 5: Making graph_query (LangChain) a blocking MCP tool

**What people do:** Implement `graph_query` as a synchronous-style MCP tool that awaits the LLM call before returning.

**Why it's wrong:** LLM API calls can take 5-30 seconds. MCP tools timeout. The Express event loop stalls for other requests during the await.

**Do this instead:** LangChain.js is already async (`await chain.invoke()`). The MCP tool handler is `async` by convention — the event loop is not blocked. Confirm the MCP SDK tool handler accepts async functions (it does in `@modelcontextprotocol/sdk` >= 1.0). Add a timeout: `Promise.race([chain.invoke(q), timeout(30_000)])`.

---

## Scaling Considerations

This milestone targets the same solo-user, single-process deployment as all prior v3.x work.

| Scale                  | Architecture                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Solo / PM2 (current)   | Both DBs in same process. No changes needed.                                                                                                                                                                       |
| Docker (volume mount)  | data/documind.kuzu/ in named volume alongside documind.db. Works as-is.                                                                                                                                            |
| Docker (git-clone)     | Same as volume mount — /app/data holds both DB stores.                                                                                                                                                             |
| Multi-process (future) | Kuzu's single-writer constraint means the Express process must own the Database object. If a second process needs graph queries, proxy them through the REST /graph endpoint — do not open a second kuzu.Database. |

**First bottleneck for Kuzu:** Graph algorithm queries (PageRank) are CPU-bound and block the event loop for the duration of the algorithm. At 8K nodes / 50K edges this is fast (< 500ms estimated). If node count grows to 100K+, algorithm queries should move to a Worker Thread to avoid blocking Express request handling.

---

## Sources

- Direct codebase inspection: `graph/relations.mjs`, `daemon/server.mjs`, `daemon/mcp-server.mjs`, `daemon/scheduler.mjs`, `config/env.mjs` (HIGH confidence)
- Kuzu Node.js API: [docs.kuzudb.com/client-apis/nodejs](https://docs.kuzudb.com/client-apis/nodejs/) — async/sync API, ESM support, Database/Connection classes (HIGH confidence)
- Kuzu concurrency model: [kuzudb.github.io/docs/concurrency](https://kuzudb.github.io/docs/concurrency/) — single READ_WRITE Database constraint confirmed (HIGH confidence)
- Kuzu algo extension: [docs.kuzudb.com/extensions/algo](https://docs.kuzudb.com/extensions/algo/) and [docs.kuzudb.com/extensions/algo/pagerank](https://docs.kuzudb.com/extensions/algo/pagerank/) — PROJECT_GRAPH, PageRank, pre-installed in >= 0.11.3 (HIGH confidence)
- Kuzu projected graph + async pool limitation: [docs.kuzudb.com/get-started/graph-algorithms](https://docs.kuzudb.com/get-started/graph-algorithms/) — "projected graphs are bound to a specific Connection instance" confirmed (HIGH confidence)
- LangChain.js GraphCypherQAChain: [v03.api.js.langchain.com GraphCypherQAChain](https://v03.api.js.langchain.com/classes/langchain.chains_graph_qa_cypher.GraphCypherQAChain.html) — accepts custom graph adapter with getSchema() + query() (MEDIUM confidence — interface contract inferred, not explicit custom adapter docs)
- langchain-kuzu Python package: [pypi.org/project/langchain-kuzu](https://pypi.org/project/langchain-kuzu/) — Python KuzuQAChain confirmed; JavaScript equivalent not officially available (HIGH confidence on Python; MEDIUM on JS adapter pattern)
- Kuzu npm package: [npmjs.com/package/kuzu](https://www.npmjs.com/package/kuzu) — pre-built binaries, no node-gyp (HIGH confidence)

---

*Architecture research for: DocuMind v3.3 — Kuzu Graph Intelligence + LangChain Text-to-Cypher*
*Researched: 2026-04-07*
