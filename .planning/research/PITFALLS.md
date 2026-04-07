# Pitfalls Research

**Domain:** Adding Kuzu embedded graph DB + LangChain KuzuGraph to an existing Node.js production service (DocuMind v3.3)
**Researched:** 2026-04-07
**Confidence:** HIGH (project abandonment, native module behavior, LangChain gap) / MEDIUM (sync patterns, schema migration, performance) / LOW (specific Docker multi-arch Kuzu build details — require empirical verification)

---

## Critical Pitfalls

### Pitfall 1: KuzuDB Was Archived in October 2025 — The Project Is Abandoned

**What goes wrong:**

KuzuDB was archived by its corporate sponsor Kùzu Inc. on October 10, 2025. The GitHub repository is now read-only. The team announced they are "working on something new" but did not specify what. Active development, bug fixes, security patches, and new releases have stopped from the original team. Choosing the upstream `kuzu` npm package ties DocuMind to an abandoned dependency with no guaranteed path forward.

**Why it happens:**

The abandonment was announced with minimal warning. Most integrations being written now (Q1-Q2 2026) treat Kuzu as if it is still actively maintained, because blog posts and tutorials from 2024-early 2025 show it as active. Developers do not check project health before starting integration.

**How to avoid:**

Evaluate community forks before committing. As of October 2025 there are two active forks:

- **Bighorn** (Kineviz) — community-maintained fork of Kuzu, API-compatible, available at `bighorndb` on GitHub
- **Ladybug** — separately announced by Arun Sharma (ex-Facebook, ex-Google), independently funded, aims to be a full Kuzu replacement

For v3.3: pin to the last stable upstream release (`kuzu` 0.11.x) and document this decision explicitly. Set a milestone review to evaluate whether to migrate to Bighorn or Ladybug before v3.4. Do not use `latest` in package.json. The file format changed to single-file in 0.11.0 (July 2025) — verify your version supports the format you create.

**Warning signs:**

- `npm install kuzu` resolves to a version released after October 2025 — this is from a fork, not the original team
- Release notes for `kuzu` on npm reference a new organization name or team
- GitHub issues/PRs are still open with no responses after November 2025

**Phase to address:**

Phase 0 (Dependency Evaluation) — before writing any integration code. Pin the version, document the fork landscape, and choose a path.

---

### Pitfall 2: LangChain KuzuGraph Is Python-Only — No Node.js Equivalent Exists

**What goes wrong:**

The feature goal "LangChain KuzuGraph integration: text-to-Cypher natural language graph queries" assumes a LangChain.js equivalent of Python's `KuzuGraph` + `KuzuQAChain` exists. It does not. The `langchain-kuzu` package is published only to PyPI (`pip install langchain-kuzu`). LangChain.js (`langchain` npm package) has `GraphCypherQAChain` for Neo4j but no Kuzu graph wrapper. As of research date there is no `@langchain/kuzu` npm package and no open PR/issue in langchainjs to add one.

**Why it happens:**

The feature was specified based on the Python LangChain ecosystem. LangChain Python and LangChain.js have a significant capability gap — many Python integrations exist only in Python. Developers assume the ecosystems are symmetric.

**How to avoid:**

Implement the text-to-Cypher bridge in Node.js directly without the `KuzuGraph` abstraction. The pattern `KuzuGraph` implements is:

1. Load the graph schema from the DB (node tables + relationship tables)
2. Format the schema as a string for the LLM prompt context
3. Ask the LLM (via `GraphCypherQAChain`-style prompt) to generate a Cypher query
4. Execute the Cypher query against Kuzu using the native Node.js API
5. Pass results back to the LLM for answer synthesis

Steps 1, 2, 4 use the Kuzu Node.js API directly. Steps 3 and 5 use LangChain.js's `ChatOpenAI` / `ChatAnthropic` with a custom prompt. `GraphCypherQAChain` from LangChain.js can be used for the LLM pipeline, but you must supply it a custom graph object that adapts Kuzu's schema and query API to the expected interface.

This is 100–150 lines of Node.js adapter code — not a blocker, but it must be scoped explicitly. Do not plan this feature as "just install langchain-kuzu."

**Warning signs:**

- `npm install langchain-kuzu` succeeds — this is a scam package or incorrect install (PyPI only)
- Planning docs reference `KuzuGraph` from npm without a source URL
- The LangChain.js changelog does not list a Kuzu integration

**Phase to address:**

Phase 1 (Kuzu integration scaffold) — define the custom adapter interface before building the LLM pipeline.

---

### Pitfall 3: Kuzu Is an Embedded Single-Writer DB — PM2 + Daemon + External Tool = Write Conflict

**What goes wrong:**

Kuzu enforces single-writer semantics at the file level. Only one `READ_WRITE` Database object can open the Kuzu DB at a time. If two processes try to open the same Kuzu database in write mode simultaneously — e.g., the PM2 daemon and a separate CLI script run manually — the second process either throws an error or silently fails to acquire the write lock. On Docker, there is a known issue where file-level locking flags set by one process are not visible to another process in a different container or filesystem namespace.

For DocuMind specifically: the Express daemon already holds the Kuzu database open. Running `npm run scan` in a separate terminal while the daemon is running will conflict if both attempt write access.

**Why it happens:**

Developers carry the mental model from SQLite's WAL mode (which allows concurrent writers in the same process, and multiple readers across processes) onto Kuzu. Kuzu is fundamentally different: one Database object owns the file exclusively.

**How to avoid:**

Establish one clear rule: the daemon owns the Kuzu database. All writes go through the daemon's API (REST endpoint or internal function). No CLI script or external tool opens Kuzu's database in write mode while the daemon is running.

For maintenance tasks that need exclusive Kuzu access (migration, schema creation, initial import), require the daemon to be stopped first. Document this in `CLAUDE.md` and in the database init scripts.

In code: open Kuzu with `bufferPoolSize` configured at startup in the daemon and never re-open it. Share the single `Database` instance across all Express route handlers and the MCP server.

**Warning signs:**

- "Failed to open the database file" error when a second process tries to open Kuzu
- Kuzu lock file (`.lock`) present in the DB directory that does not clear after the daemon restarts
- Docker Kuzu Explorer running alongside the daemon — Explorer opens a second database connection from a different container

**Phase to address:**

Phase 1 (Kuzu scaffold) — the database opening strategy must be established on day one. Centralize access in the daemon.

---

### Pitfall 4: Kuzu's Strict Schema Cannot Be Altered After Creation — No ALTER TABLE for Property Types

**What goes wrong:**

Kuzu uses a typed, declared schema. Node tables and relationship tables are defined with `CREATE NODE TABLE` / `CREATE REL TABLE` DDL statements. Once a property is added to a table with a specific type (e.g., `strength FLOAT`), you cannot change that type with an `ALTER TABLE` statement. Adding new properties is possible via `ALTER TABLE ADD`, but dropping properties or changing types requires EXPORT DATABASE → recreate schema → IMPORT DATABASE.

The DocuMind SQLite `doc_relationships` table has 8 relationship types stored as a single `type` string column. Migrating this to Kuzu requires a design decision: one relationship table with a `type` property (flat model), or eight separate typed relationship tables (semantic model). Choosing the flat model first and realizing the semantic model is needed later requires the full EXPORT/IMPORT migration cycle, which is destructive if IMPORT fails.

The IMPORT DATABASE command has a known issue: if it fails mid-way, automatic rollback is not supported. You must delete the partially-imported database and start over.

**Why it happens:**

Developers prototype with a flat schema that mirrors the existing SQLite structure (easiest initial migration), then discover they need typed edges for graph algorithms that can be filtered by relationship type. Changing this after data is loaded requires the export/import cycle.

**How to avoid:**

Design the final Kuzu schema before loading any data. For DocuMind's 8 relationship types (`imports`, `parent_of`, `variant_of`, `supersedes`, `depends_on`, `related_to`, `generated_from`, `dispatched_to`): use separate relationship tables from the start.

```cypher
CREATE REL TABLE imports(FROM Document TO Document, strength FLOAT)
CREATE REL TABLE parent_of(FROM Document TO Document)
CREATE REL TABLE variant_of(FROM Document TO Document, similarity_score FLOAT)
-- etc.
```

This enables Kuzu's graph algorithms to be applied per-relationship-type and avoids schema migration later.

Before initial data load, create the schema in a test database and verify all 8 relationship types survive a round-trip EXPORT/IMPORT.

**Warning signs:**

- Schema design starts with `CREATE REL TABLE doc_relationship(FROM Document TO Document, type STRING)` — this is the flat model that forecloses typed-edge optimizations
- No schema design phase before initial data load
- First Cypher query returns wrong results because edges are filtered by a string property match rather than type

**Phase to address:**

Phase 1 (Kuzu scaffold) — schema is the first artifact. Freeze it before writing any import code.

---

### Pitfall 5: Kuzu's Prebuilt Binaries Do Not Support Alpine Linux (musl libc)

**What goes wrong:**

The `kuzu` npm package ships prebuilt binaries compiled against glibc (`manylinux_2_28` standard for Linux). Alpine Linux uses musl libc, not glibc. On an Alpine-based Docker image, npm will attempt to build Kuzu from source, which requires CMake >= 3.15, Python 3, and a C++20-compatible compiler — none of which are in `node:alpine` by default. The source build takes 5–15 minutes (Kuzu is a large C++ codebase) and may fail with C++20 standard errors on older Alpine gcc versions.

DocuMind's existing Docker image already uses `node:22-bookworm-slim` (Debian) because of `better-sqlite3`. This constraint is compounded, not new, but must be explicitly verified for Kuzu as well.

**Why it happens:**

Docker image maintainers sometimes experiment with Alpine to reduce image size after initial Dockerization is complete. Adding Kuzu to an Alpine image triggers the source-build failure.

**How to avoid:**

Keep `node:22-bookworm-slim` as the base image. With two native addons (`better-sqlite3` + `kuzu`), the cost of switching to Alpine doubles. The Debian slim image is the correct choice and must not be changed without testing both addons.

If image size optimization is needed later, use a multi-stage build where the builder stage (Debian) compiles native modules and the final stage copies `node_modules/` into a minimal runtime.

**Warning signs:**

- Docker build shows "No prebuilt binaries found for kuzu — building from source"
- Build stage fails with `cmake: command not found` or C++20 compiler errors
- Image size suddenly increases by 500MB+ (build tools installed in Alpine to compile Kuzu)

**Phase to address:**

Phase 1 (Kuzu scaffold) — verify npm install succeeds in the existing Docker image before writing any Kuzu application code.

---

### Pitfall 6: Dual-DB Sync Between SQLite and Kuzu Has No Guaranteed Consistency Boundary

**What goes wrong:**

The plan keeps SQLite as the FTS5 index and source of truth for document metadata, while Kuzu becomes the graph store. Every time a relationship is written to SQLite's `doc_relationships` table, it must also be written to Kuzu's relationship tables. These are two separate database writes with no cross-DB transaction. If the Kuzu write fails (connection error, write conflict, schema mismatch), the SQLite record exists but Kuzu does not have the corresponding edge. The two databases drift out of sync silently.

The reverse is also true: if a Kuzu write succeeds but the SQLite write fails, Kuzu has an edge for documents that SQLite does not recognize.

**Why it happens:**

Developers treat dual-DB writes as "fire and forget" — write to primary (SQLite), then write to secondary (Kuzu) and log any error. This approach creates a growing divergence that is expensive to detect and repair.

**How to avoid:**

Establish a canonical source and a sync strategy from day one:

- **SQLite is the system of record for relationships.** The `doc_relationships` table in SQLite is authoritative. Kuzu is a derived, read-optimized index of that data.
- **Kuzu is always rebuildable from SQLite.** Provide a `npm run graph:rebuild` command that clears Kuzu and re-imports all relationships from SQLite in a single batch.
- **Writes go to SQLite first.** On success, enqueue or directly execute the Kuzu write. On Kuzu write failure, log the failure with the SQLite record ID, do not roll back SQLite, and rely on the rebuild command to repair the divergence.
- **Health check endpoint reports sync status.** `GET /health` includes a `graph_sync: ok/diverged` field comparing `doc_relationships` count in SQLite vs. edge count in Kuzu.

This is not ACID-distributed-transaction consistency — it is "eventually consistent with a fast repair path," which is correct for this use case.

**Warning signs:**

- Graph query returns fewer results than expected from a search query
- `SELECT COUNT(*) FROM doc_relationships` differs from `MATCH ()-[r]->() RETURN count(r)`
- No `graph:rebuild` command exists
- Kuzu write errors are silently swallowed in processor code

**Phase to address:**

Phase 2 (SQLite → Kuzu migration and sync) — the sync strategy must be the first decision, before writing any relationship processor code.

---

### Pitfall 7: Kuzu's Graph Algorithm Extension Requires INSTALL/LOAD — Cannot Assume It Is Pre-Loaded

**What goes wrong:**

PageRank, weakly connected components, and centrality algorithms are in Kuzu's `algo` extension, not built into the core engine. In Kuzu 0.11.3, the extension is pre-installed and pre-loaded, but in earlier versions it must be explicitly installed with `INSTALL algo` and loaded with `LOAD EXTENSION algo` before any graph algorithm can be called. If you are not on 0.11.3, calling `CALL algo.pagerank(...)` without loading the extension throws a "function not found" error that looks like a syntax error.

The extension installation downloads binaries from Kuzu's extension server. In a Docker environment with no external network access, this download fails silently or errors out.

**Why it happens:**

Tutorials and blog posts assume version 0.11.x behavior (pre-loaded extensions). Developers who pin to an earlier version for stability hit missing extension errors they did not expect. The error message ("function not found") does not mention the extension system.

**How to avoid:**

Pin to Kuzu 0.11.3 or later (which bundles the algo extension). At daemon startup, verify the extension is available by running a no-op algorithm query and catching any error:

```javascript
try {
  await conn.query('CALL algo.pagerank("Document", "related_to") RETURN *');
} catch (e) {
  // attempt LOAD EXTENSION algo
  await conn.query('LOAD EXTENSION algo');
}
```

For Docker: verify at image build time that the extension is present by running a test query as a Dockerfile `RUN` step. Do not rely on runtime extension downloading in production containers.

**Warning signs:**

- "Function not found: algo.pagerank" error — extension not loaded
- Extension loads in dev but not in Docker (network-restricted environment)
- Algorithm query works in Kuzu CLI (which auto-loads extensions) but not in Node.js API

**Phase to address:**

Phase 3 (Graph algorithms) — verify extension availability as the first step of this phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
| -------- | ----------------- | -------------- | --------------- |
| Flat `doc_relationship` node with `type` property instead of typed edge tables | Quick initial migration from SQLite schema | Cannot use per-type graph algorithms; full EXPORT/IMPORT required to change; performance worse | Never — design typed edge tables from day one |
| Writing to SQLite and Kuzu in the same `try/catch` block without divergence tracking | Simple code | Silent divergence; no repair path when Kuzu write fails | Only for prototyping; never in production merge |
| Using `kuzu@latest` | Gets newest features | Tracks the abandoned upstream OR an unverified fork; version may change file format | Never — pin to a specific version, document fork status |
| Calling LangChain Python via `child_process.exec()` sidecar | Gets `KuzuGraph` without reimplementing | Adds Python runtime dependency to a Node.js service; fragile IPC; breaks Docker image | Unacceptable for production — implement the Node.js adapter directly |
| Skipping the schema freeze step and iterating the Kuzu schema during development | Fast iteration | Each schema change requires EXPORT/IMPORT with no rollback; corrupts data in partial failure | Only acceptable in the first day of development before any real data is loaded |
| Rebuilding Kuzu from SQLite on every daemon startup | Ensures sync on restart | Rebuild of 8K+ relationships takes measurable seconds; blocks daemon startup | Only acceptable if rebuild time < 1 second; measure before shipping |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
| ----------- | -------------- | ---------------- |
| kuzu npm + ESM (.mjs) | `import kuzu from 'kuzu'` fails with "package subpath not exported" | Check Kuzu's package.json exports field; use `createRequire` from `module` as fallback if ESM import fails; report to the fork maintainers |
| kuzu + Docker | Using Alpine base image | Keep `node:22-bookworm-slim`; Kuzu prebuilts are glibc-only, same as better-sqlite3 |
| kuzu + better-sqlite3 | Assuming both native addons build for the same Node.js ABI | Both must be compiled against the same Node.js version; verify with `node -e "require('kuzu'); require('better-sqlite3')"` |
| LangChain KuzuGraph | `npm install langchain-kuzu` | Does not exist; implement custom Node.js adapter using Kuzu's Node.js API + LangChain.js's ChatModel |
| Kuzu concurrency | Opening a second `Database(path, {readOnly: false})` instance | Kuzu throws or silently fails; share one `Database` instance across all connections in the daemon |
| Kuzu + Kuzu Explorer (Docker) | Running Explorer container alongside daemon container pointing at same DB file | File lock flags not propagated across Docker containers; Explorer will fail to open or corrupt the lock state; run Explorer only with daemon stopped |
| Kuzu graph algorithms | Calling `algo.pagerank()` on Kuzu < 0.11.3 without LOAD EXTENSION | "Function not found" error; verify extension is loaded at startup |
| SQLite → Kuzu initial import | Migrating `doc_relationships` rows one-by-one via the Node.js API | Extremely slow for 8K+ rows; use Kuzu's `COPY FROM` with a CSV or Parquet file generated from SQLite for bulk import |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
| ---- | -------- | ---------- | -------------- |
| One Kuzu write per document during scan (8K+ sequential writes) | Scan takes 10x longer than before Kuzu was added | Batch all relationship writes per scan run; use a single transaction wrapping all `CREATE` statements | Any corpus > 1K documents |
| Kuzu PageRank on the full graph every time `/graph` is called | API response latency > 1 second | Cache PageRank scores; recompute on daily cron, not on request | Corpus > 5K edges |
| Running SQLite → Kuzu sync inline in the request path | MCP tool calls become slow when Kuzu write is slow | Kuzu writes are async and non-blocking; if they fail, log for batch repair; never block the SQLite commit on the Kuzu write |  Any load > 10 requests/min |
| Kuzu buffer pool default size in a memory-constrained Docker container | OOM kill or container restart | Set `bufferPoolSize` explicitly in the `Database` constructor; start with 256MB for DocuMind's corpus size | Container memory limit < 512MB |
| Returning entire Cypher query result set from `/graph` endpoint | Response payload grows unboundedly with corpus | Add `LIMIT` clauses to all graph traversal queries; paginate or stream results | Corpus > 10K edges |

## Security Mistakes

| Mistake | Risk | Prevention |
| ------- | ---- | ---------- |
| Passing raw user input directly into Cypher query string (text-to-Cypher MCP tool) | Cypher injection — malicious queries delete nodes, enumerate all data, or run expensive algorithms (DoS) | Always use parameterized queries for properties; validate LLM-generated Cypher against an allowlist of operations (MATCH/RETURN allowed; DELETE/MERGE/CREATE from LLM output blocked) |
| Logging raw Cypher queries that include document path strings | Log exposure of internal file paths to any log aggregator | Sanitize Cypher queries in log output; hash or truncate node IDs in logs |
| No rate limiting on graph_query MCP tool | LLM agent loops calling graph_query in a tight loop; exhausts Kuzu connection and memory | Rate-limit MCP tool calls per session in the MCP server layer |

## "Looks Done But Isn't" Checklist

- [ ] **Kuzu version pinned:** `package.json` shows a specific version, not `"latest"` or `"*"` — verify with `cat package.json | jq '.dependencies.kuzu'`
- [ ] **ESM import works:** `node --input-type=module <<< 'import kuzu from "kuzu"; console.log("ok")'` exits 0 in the project's Node.js version
- [ ] **Schema frozen before data load:** Kuzu DDL statements exist in a versioned file (`scripts/db/kuzu-schema.cypher`); no schema changes after first relationship row loaded
- [ ] **algo extension available:** `CALL algo.pagerank("Document", "related_to") RETURN node, rank LIMIT 1` returns a result (not "function not found")
- [ ] **Sync divergence detectable:** `GET /health` reports count comparison between SQLite `doc_relationships` and Kuzu edge count
- [ ] **graph:rebuild command exists:** `npm run graph:rebuild` drops and re-imports all Kuzu relationships from SQLite in a single run; completes without error
- [ ] **LLM-generated Cypher sanitized:** The text-to-Cypher pipeline rejects any Cypher containing `DELETE`, `DETACH DELETE`, `MERGE`, or `DROP TABLE` before execution
- [ ] **Kuzu DB not opened twice:** `grep -r "new kuzu.Database" daemon/ processors/` returns exactly one occurrence
- [ ] **Docker build succeeds:** `docker build` completes without "build from source" messages for kuzu; both `require('kuzu')` and `require('better-sqlite3')` exit 0 in the container

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
| ------- | ------------- | -------------- |
| Kuzu DB corrupted or out of sync | LOW | Stop daemon; delete Kuzu DB directory; run `npm run graph:rebuild` to re-import all relationships from SQLite; restart daemon |
| Wrong Kuzu schema (flat type instead of typed edges) | HIGH | EXPORT DATABASE to CSV; drop Kuzu DB; define new schema with typed edge tables; IMPORT DATABASE from CSVs; verify edge counts |
| LangChain Python adapter approach chosen, then abandoned | MEDIUM | Remove Python sidecar; implement Node.js adapter (~100-150 lines); update MCP tool to call adapter directly |
| Kuzu upstream abandoned, need to migrate to fork | MEDIUM | Update `package.json` to fork package name (Bighorn or Ladybug); run full test suite; verify Kuzu file format is compatible or EXPORT/IMPORT to new format |
| algo extension not loading in Docker | LOW | Pin to kuzu 0.11.3+ (pre-bundled extensions); rebuild Docker image; verify with test query in container |
| SQLite → Kuzu divergence detected | LOW | Run `npm run graph:rebuild`; compare counts again; if still diverged, check for failed writes in daemon logs |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
| ------- | ---------------- | ------------ |
| KuzuDB abandoned — fork decision | Phase 0: Dependency evaluation | `package.json` pins specific version; DECISIONS.md documents fork landscape |
| LangChain KuzuGraph Python-only | Phase 1: Kuzu scaffold | Node.js adapter file exists; no Python runtime in package.json dependencies |
| Single-writer conflict (daemon + CLI) | Phase 1: Kuzu scaffold | One `new kuzu.Database` call in codebase; docs state daemon must be stopped for maintenance |
| Schema cannot be altered after creation | Phase 1: Kuzu scaffold (schema freeze) | `kuzu-schema.cypher` committed before any data load; typed edge tables used |
| Alpine / Kuzu prebuilt failure | Phase 1: Kuzu scaffold | `docker build` succeeds; `require('kuzu')` exits 0 in container |
| Dual-DB sync divergence | Phase 2: SQLite → Kuzu sync | `graph:rebuild` command exists; `/health` reports sync status |
| algo extension not loaded | Phase 3: Graph algorithms | Test query succeeds at daemon startup; fails loudly if extension missing |
| Cypher injection via LLM output | Phase 4: LangChain text-to-Cypher | Cypher sanitizer blocks DELETE/MERGE/DROP; unit test with adversarial inputs |

## Sources

- KuzuDB abandonment: [The Register — KuzuDB abandoned, community mulls options](https://www.theregister.com/2025/10/14/kuzudb_abandoned/) — HIGH confidence; news report October 2025
- KuzuDB abandonment: [Hacker News — We will no longer be actively supporting KuzuDB](https://news.ycombinator.com/item?id=45560036) — HIGH confidence; primary source discussion
- KuzuDB forks (Bighorn, Ladybug): [The Weekly Edge — Kuzu Forks, DuckDB Goes Graph, Cypher 25](https://gdotv.com/blog/weekly-edge-kuzu-forks-duckdb-graph-cypher-24-october-2025/) — MEDIUM confidence; community report
- LangChain KuzuGraph Python-only: [langchain-kuzu PyPI](https://pypi.org/project/langchain-kuzu/) — HIGH confidence; PyPI listing confirms Python only
- LangChain.js graph QA: [GraphCypherQAChain LangChain.js](https://v03.api.js.langchain.com/classes/langchain.chains_graph_qa_cypher.GraphCypherQAChain.html) — HIGH confidence; official LangChain.js docs; no Kuzu equivalent listed
- Kuzu concurrency (single writer): [Kuzu Connections & Concurrency docs](https://docs.kuzudb.com/concurrency/) — HIGH confidence; official documentation
- Kuzu schema strict typing: [Transforming your data to graphs — Kuzu blog](https://blog.kuzudb.com/post/transforming-your-data-to-graphs-1/) — HIGH confidence; official blog
- Kuzu ALTER TABLE gap: [GitHub Discussion #1715 — ALTER TABLE equivalent](https://github.com/kuzudb/kuzu/discussions/1715) — HIGH confidence; official GitHub
- Kuzu migration (EXPORT/IMPORT): [Kuzu migrate docs](https://docs.kuzudb.com/migrate/) — HIGH confidence; official docs; no rollback on failed IMPORT confirmed
- Kuzu IMPORT failure no rollback: [GitHub Issue #5727 — Import does not support parallel=false](https://github.com/kuzudb/kuzu/issues/5727) — MEDIUM confidence; GitHub issue confirms fragility
- Kuzu prebuilt binaries (manylinux_2_28): WebSearch result from docs.kuzudb.com/system-requirements/ — MEDIUM confidence (page returned 403 on direct fetch; confirmed via search snippet)
- Kuzu algo extension pre-bundled in 0.11.3: [Kuzu 0.10.0 release blog](https://blog.kuzudb.com/post/kuzu-0.10.0-release/) + search result snippet — MEDIUM confidence
- Kuzu ESM issue (kuzu-wasm): [GitHub Issue #5517 — ECMAScript Module Syntax not supported](https://github.com/kuzudb/kuzu/issues/5517) — HIGH confidence; active bug report on the Kuzu repo
- Kuzu Node.js API (prebuilt binaries bundled): [GitHub kuzudb/kuzu nodejs_api/README.md](https://github.com/kuzudb/kuzu/blob/master/tools/nodejs_api/README.md) — HIGH confidence; official source states "All prebuilt binaries are shipped inside the package"

---

*Pitfalls research for: DocuMind v3.3 — Kuzu embedded graph DB + LangChain text-to-Cypher integration into existing Node.js production service*
*Researched: 2026-04-07*
