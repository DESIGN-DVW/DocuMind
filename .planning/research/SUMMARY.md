# Project Research Summary

**Project:** DocuMind v3.0 — Documentation Intelligence Platform
**Domain:** Developer-facing documentation intelligence daemon with MCP server, classification, and context profiles
**Researched:** 2026-03-15
**Confidence:** HIGH (stack + architecture + pitfalls verified against codebase and official docs), MEDIUM (features)

## Executive Summary

DocuMind v3.0 is a documentation intelligence engine that evolves an already-functional v2.0 daemon into an AI-agent-callable system. The core v2.0 infrastructure — Express on port 9000, SQLite FTS5, PM2, node-cron, chokidar, and all processor modules — is production-ready. The v3.0 work is primarily wiring, schema evolution, and one new subsystem: a Model Context Protocol (MCP) server that exposes DocuMind's capabilities as tools callable by Claude Code agents. The recommended approach is to add one new npm package (`@modelcontextprotocol/sdk@^1.27.1`), bump `zod` to `^3.25.0`, and layer three abstractions on top of the existing stack: an `orchestrator.mjs` that consolidates processor wiring, a `context/loader.mjs` that externalizes configuration into portable JSON profiles, and a `daemon/mcp-server.mjs` that exposes read and write tools over stdio transport.

The strategic differentiation over all competitors (Obsidian, Glean, Context7) is the combination of a typed 8-relationship document graph queryable by AI agents via MCP, write-capable MCP tools that allow autonomous document maintenance, and cross-repo multi-format coverage. None of these competitors offer all three. The context profile portability (swappable classification trees, lint rules, and keyword taxonomies per deployment) is the commercial differentiator for Step #3. The most important single unlock is wiring the scheduler: `buildRelationships()`, keyword extraction, and deviation detection all exist in code but are never called — scheduling them in production is what activates the graph, the keyword cloud, and staleness detection simultaneously.

The two highest-risk areas are schema migration safety and MCP stdout pollution. The live database already contains 8K+ indexed documents, making any unversioned schema change destructive. A `schema_migrations` table with numbered SQL files must be the first deliverable. MCP stdio transport uses stdout as a JSON-RPC wire protocol; any `console.log` call in an imported module will silently corrupt it. Both risks have clear mitigations documented in PITFALLS.md and must be addressed before any other feature work begins.

## Key Findings

### Recommended Stack

The v3.0 stack requires exactly one new dependency and one version bump against the v2.0 baseline. `@modelcontextprotocol/sdk@^1.27.1` is the official Anthropic SDK for building MCP servers — the only spec-compliant, actively maintained implementation with 33K+ npm dependents. `zod` must be bumped from `^3.22.4` to `^3.25.0` because the SDK internally uses `zod/v4` compatibility and sets 3.25 as its peer dependency floor. Everything else (Express 5, better-sqlite3, natural, node-cron, chokidar, fast-glob, gray-matter) stays at current versions with schema and wiring additions only. No TypeScript migration is warranted — the SDK works with plain `.mjs`.

**Core technologies:**

- `@modelcontextprotocol/sdk@^1.27.1`: MCP server transport layer — the only compliant way to expose DocuMind as an MCP server; provides `McpServer`, `StdioServerTransport`, `StreamableHTTPServerTransport`
- `better-sqlite3@^12.6.2`: SQLite with FTS5 and WAL mode — stays; needs schema additions for classifications, tags, summary, context_profiles, and schema_migrations tables
- `express@^5.2.1`: REST API on port 9000 — stays unchanged; MCP HTTP transport mounts on `POST /mcp` alongside existing routes
- `natural@^8.1.1`: TF-IDF keyword extraction — stays; keyword-processor.mjs exists but is never called by the scheduler
- `node-cron@^3.0.3`: Scheduled tasks — stays; cron jobs have TODO stubs that must be replaced with orchestrator calls
- `zod@^3.25.0`: Schema validation + MCP tool schemas — version bump only; already used throughout codebase

**What not to add:**

- No sqlite-vec or vector embeddings (semantic search is out of scope; FTS5 + TF-IDF is sufficient for 8K docs in a controlled vocabulary)
- No separate MCP daemon process (mount stdio and HTTP transports from shared modules; WAL mode handles concurrent DB reads safely)
- No Nested Set Model for classification (materialized path strings with `LIKE 'api/%'` queries are faster for shallow, read-heavy trees)

### Expected Features

**Must have (table stakes for v3.0 launch):**

- Schema evolution: summary column, classification column, tags column, context_profiles table, schema_migrations table — everything downstream depends on this
- Scheduler wired to all processors: cron jobs must actually call markdown-processor, keyword-processor, `buildRelationships()` — currently all TODO stubs
- Document relationship graph populated: `buildRelationships()` executing on schedule; graph edges visible via `/graph` — the stated day-one success metric
- Keyword TF-IDF running on schedule: keywords table populated; `/keywords` returns real data
- Staleness detection: freshness score computed per scan; stale docs surfaced in search and stats
- MCP server with read tools: search, graph, keywords, tree, diagrams — the primary agent interface
- MCP server with write tools: index, lint, fix, convert, relink — agents can maintain docs autonomously
- Context profile (minimal): JSON config externalizing repo paths, classification tree, lint rules — without this Step #3 is a rewrite

**Should have (competitive differentiators, add after v3.0 core):**

- Deviation detection wired to daily cron — script exists, not scheduled
- MCP tool: `find_stale` — surfaces docs below freshness threshold
- MCP tool: `find_duplicates` — surfaces similar document pairs
- Document summary auto-generation (extractive TF-IDF, top-sentence approach) — summary column exists, population logic needed
- Classification confidence scoring — detect uncertainty in auto-assignment

**Defer to v2+ / Step #3:**

- Context profiles per vertical (code docs, marketing, ops) — require Step #1/2 validation first
- Docker packaging — required for self-hosted commercial; not before product-market fit
- SQLite-per-tenant via Turso — required for SaaS path; premature now
- Web dashboard — deferred per PROJECT.md; build only if CLI proves insufficient for demos
- Semantic / embedding-based search — FTS5 is sufficient; massive complexity for marginal gain

### Architecture Approach

DocuMind v3.0 adds four new structural elements to the existing daemon without restructuring it: `orchestrator.mjs` (single wiring point for all processor calls, importable by scheduler, Express `/scan` endpoint, and MCP write tools alike), `context/loader.mjs` (loads and Zod-validates JSON profiles at startup, passes `ctx` object through all subsystems), `daemon/mcp-server.mjs` (separate stdio entry point — required because stdout is a JSON-RPC wire; cannot be embedded in server.mjs), and the `context/profiles/` directory for profile JSON files. The Express server and the MCP stdio process share the same SQLite database safely via WAL mode (multiple concurrent readers, single writer). MCP write tools should POST to `localhost:9000` endpoints rather than writing to SQLite directly, keeping Express as the sole writer process.

**Major components:**

1. `daemon/mcp-server.mjs` (NEW) — stdio MCP entry point; thin tool wrappers calling shared service modules; no `console.log` in scope
2. `orchestrator.mjs` (NEW) — exports `runIncrementalScan`, `runFullScan`, `runKeywordRefresh`, `runGraphRebuild`; eliminates logic duplication across scheduler, HTTP `/scan`, and MCP write tools
3. `context/loader.mjs` (NEW) — reads profile JSON, validates with Zod, returns typed `ctx` object; crash-fast on invalid profile at startup
4. `daemon/scheduler.mjs` (EXISTING — TODO stubs replaced) — cron callbacks now call `orchestrator.*` functions with `ctx` in closure
5. `graph/relations.mjs` (EXISTING — never called) — `buildRelationships()` wired into orchestrator's full-scan pipeline
6. `processors/keyword-processor.mjs` (EXISTING — never called) — wired into orchestrator's weekly keyword refresh
7. `scripts/db/schema.sql` + `schema_migrations` table (EXTENDED) — authoritative schema with versioned migrations

### Critical Pitfalls

1. **Non-idempotent schema migration destroys live data** — The current `init-database.mjs` uses `CREATE TABLE IF NOT EXISTS` with a hardcoded `db_version = '1.0.0'` and no migration tracking. Adding new columns (classifications, tags, summary) by re-running `db:init` silently skips table creation; the live 8K-document database is never updated. Fix: implement `schema_migrations` table before touching any schema; use numbered SQL files; use `ALTER TABLE ... ADD COLUMN` for nullable additions.

2. **MCP stdout pollution silently kills the protocol** — Every `console.log` in any module imported by `mcp-server.mjs` writes to stdout, which is the JSON-RPC wire. The existing codebase uses `console.log` throughout all processors. Fix: at the first line of `mcp-server.mjs`, redirect `console.log` to stderr; audit all imported modules before wiring as MCP tool handlers.

3. **Graph population is O(n²) for same-folder sibling edges** — `buildRelationships()` creates `related_to` edges for every document pair in the same folder. With 8K docs and flat dispatch directories, this produces millions of low-value edges that bloat the `doc_relationships` table and slow all graph queries. Fix: remove or hard-cap sibling edges per folder (max 10, or skip entirely for directories with >20 docs); compute siblings lazily at query time if needed.

4. **FTS5 virtual table goes out of sync after bulk writes** — Bulk UPDATE operations on `documents` (during graph population, keyword backfill, classification tagging) do not auto-update the `documents_fts` FTS5 content table. Fix: always call `INSERT INTO documents_fts(documents_fts) VALUES('rebuild')` after any bulk update operation.

5. **Context profile schema couples product to DVWDesign internals** — Designing the profile as "DVWDesign config with fields swapped" produces a schema that encodes DVW-specific assumptions, blocking portability for Step #3. Fix: design profile schema from a generic user's perspective first (generic `repoRoots[]`, `classificationTree{}`, `relationshipTypes[]`); map DVWDesign's setup onto it as the reference profile instance.

## Implications for Roadmap

Based on the dependency graph in FEATURES.md and the build order in ARCHITECTURE.md, the correct phase sequence is driven by hard technical dependencies: nothing works until the schema exists; nothing is portable until the profile loader exists; nothing is scheduled until the orchestrator exists; MCP comes last because it depends on all service functions being available and correctly logging to stderr.

### Phase 1: Schema Migration Foundation

**Rationale:** Every other phase reads or writes the new columns (classification, tags, summary, context_profiles). This is the blocking dependency — nothing downstream can proceed without it. The live database has 8K+ documents; destructive db:reset is not an option. A proper migration system protects the existing data while enabling all future schema evolution.

**Delivers:** `schema_migrations` table + migration runner; `ALTER TABLE documents ADD COLUMN` for classification, summary, tags; new tables: `classifications`, `tags`, `document_tags`, `context_profiles`; updated `schema.sql` as authoritative definition; FTS5 rebuild step built into migration tooling.

**Addresses:** Schema evolution table stakes; prerequisite for all downstream features.

**Avoids:** Pitfall 1 (non-idempotent migration), Pitfall 2 (FTS5 sync).

**Research flag:** Standard patterns — skip phase research. SQLite `ALTER TABLE` and numbered migration files are well-documented.

### Phase 2: Context Profile Loader

**Rationale:** The context profile is the configuration contract for all other modules. `orchestrator.mjs` needs it to know which repos to scan. Processors need it to know scan roots. MCP server needs it for tool descriptions. Designing this before the orchestrator forces the correct generic schema (not DVW-coupled) and ensures the `ctx` object shape is stable before anything imports it.

**Delivers:** `context/` directory; `context/loader.mjs` with Zod validation and crash-fast startup behavior; `context/profiles/dvwdesign.json` as the reference profile; `DOCUMIND_PROFILE` env var support in `ecosystem.config.cjs`; profile persistence in `context_profiles` SQLite table.

**Addresses:** Portability table stake; gates Step #3; classification tree definition.

**Avoids:** Pitfall 5 (DVW-coupled profile schema).

**Research flag:** Standard patterns — skip phase research. Externalized configuration with Zod validation is well-documented.

### Phase 3: Orchestrator + Scheduler Wiring

**Rationale:** The orchestrator is the single place that sequences processor calls correctly. Once it exists, the three scheduler TODO stubs, the `/scan` HTTP endpoint, and all future MCP write tools call the same functions. Without this, scan logic duplicates across every entry point. The scheduler wiring (replacing TODO stubs) is a direct consequence of the orchestrator existing and is included in this phase.

**Delivers:** `orchestrator.mjs` with `runIncrementalScan`, `runFullScan`, `runKeywordRefresh`, `runGraphRebuild`; `daemon/scheduler.mjs` TODO stubs replaced with `orchestrator.*` calls; `/scan` endpoint in `server.mjs` updated to call `orchestrator.runFullScan()`; all processors (markdown-processor, keyword-processor, graph/relations) running on their correct schedules for the first time.

**Addresses:** Scheduler wired to processors (P1 table stake); keyword TF-IDF running; staleness detection (freshness score computed during scan); duplicate/similarity detection running on daily cron; deviation detection wired.

**Avoids:** Pitfall 3 (graph O(n²) — cap sibling edges in `buildRelationships` before running against live corpus).

**Research flag:** Standard patterns — skip phase research. Orchestrator/coordinator pattern is well-documented in Node.js.

### Phase 4: MCP Server — Read Tools

**Rationale:** Read tools have no side effects and are independently verifiable. They must come before write tools because (a) the tool descriptions and Zod schemas established here define the tool surface, and (b) stdout pollution must be resolved before any tools work — making read tools the safe environment to catch and fix the stdout problem. The MCP Inspector dev tool enables interactive testing before Claude Code integration.

**Delivers:** `daemon/mcp-server.mjs` entry point with stderr-only logging; `@modelcontextprotocol/sdk` installed; `zod` bumped to `^3.25.0`; read tools: `search_docs`, `get_graph`, `get_keywords`, `get_tree`, `get_diagrams`, `get_stats`; PM2 registration in `ecosystem.config.cjs`; Claude Code MCP config snippet in project docs; `mcp:inspect` npm script.

**Addresses:** MCP server read tools (P1 table stake); primary agent interface.

**Avoids:** Pitfall 4 (stdout pollution — addressed as first step in this phase).

**Research flag:** Needs phase research. MCP transport configuration, Claude Code project-level MCP settings, and the exact `server.tool()` API surface for descriptions that effectively guide model behavior are worth a targeted research pass before implementation.

### Phase 5: MCP Server — Write Tools

**Rationale:** Write tools depend on read tools being stable (same transport) and on the orchestrator existing (write tools call `orchestrator.*` functions or POST to Express endpoints — not inline logic). This phase activates the autonomous maintenance capability that is DocuMind's primary differentiator over read-only MCP servers in the ecosystem.

**Delivers:** Write tools: `trigger_scan`, `lint_file`, `fix_file`, `index_file`, `convert_file`, `relink_diagrams`; rate limiting (per-tool call count per minute); path validation against `ctx.repoRoots` for all file path parameters; input validation via Zod enums for categorical parameters.

**Addresses:** MCP write tools (P1 table stake); autonomous doc maintenance differentiator.

**Avoids:** Security mistakes (path traversal, prompt injection, runaway agent loops) from PITFALLS.md security section.

**Research flag:** Standard patterns — skip phase research. Write tools are wrappers around existing CLI scripts; the pattern is established in Phase 4.

### Phase Ordering Rationale

- Schema first because columns must exist before any processor or tool can write to them
- Profile loader second because the `ctx` object shape must be stable before orchestrator or MCP server import it
- Orchestrator third because all three scheduler stubs, the HTTP endpoint, and all MCP write tools need it; building it once prevents logic duplication across five entry points
- MCP read tools fourth because they depend on service functions being available and correctly logging; read-only tools are safer to debug than write tools
- MCP write tools last because they depend on the read transport being stable and on the orchestrator being available for delegation

The dependency chain from FEATURES.md confirms this ordering: graph population requires scheduler; scheduler requires orchestrator; orchestrator requires profile loader; profile loader requires schema.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 4 (MCP Read Tools):** MCP tool description quality directly determines how well Claude Code invokes them; the exact API for `server.tool()` description fields, resource URIs, and response content block formats warrants a targeted research pass. Claude Code project-level MCP registration (vs. global `claude_desktop_config.json`) also needs verification.

Phases with standard patterns (skip research-phase):

- **Phase 1 (Schema Migration):** SQLite `ALTER TABLE`, numbered migration files, FTS5 `rebuild` — well-documented, no ambiguity
- **Phase 2 (Context Profile):** Externalized config + Zod validation — standard Node.js pattern
- **Phase 3 (Orchestrator):** Coordinator/facade pattern over existing processors — no novel technology
- **Phase 5 (MCP Write Tools):** Wrappers over existing CLI scripts using the same transport established in Phase 4

## Confidence Assessment

| Area | Confidence | Notes |
| ------ | ------------ | ------- |
| Stack | HIGH | Official MCP SDK docs + GitHub verified; zod peer dep floor confirmed via issue tracker; all other deps already in production use |
| Features | MEDIUM | Table stakes drawn from DMS market research and official MCP spec (verified); differentiators from DocuMind-specific context and absence of write-capable doc MCP servers in ecosystem |
| Architecture | HIGH | Existing codebase directly analyzed; MCP transport architecture from official spec; WAL mode concurrency from SQLite documentation |
| Pitfalls | HIGH | Three pitfalls identified from direct codebase inspection (scheduler TODOs, never-called buildRelationships, hardcoded migration version); two from official MCP documentation |

**Overall confidence:** HIGH

### Gaps to Address

- **MCP tool description quality:** The research confirms the API shape (`server.tool(name, description, schema, handler)`) but does not validate what description text reliably guides model behavior. This should be tested with MCP Inspector before finalizing tool definitions.
- **`buildRelationships()` scaling against 8K docs:** The O(n²) sibling edge concern is identified but the actual row count is untested against the live corpus. Run with sibling edges capped before the first production execution; monitor `SELECT COUNT(*) FROM doc_relationships` as a go/no-go gate.
- **Classification auto-assignment accuracy:** The classification tree from the context profile defines categories, but the inference logic (which keywords trigger which classification path) is not yet specified. MEDIUM confidence on classification accuracy — may need tuning after first full scan.
- **FTS5 rebuild timing:** Research confirms `VALUES('rebuild')` is safe and fast (< 30s on 8K docs), but the exact trigger points (after bulk classification update, after graph population backfill) need to be enumerated during Phase 1 implementation.

## Sources

### Primary (HIGH confidence)

- MCP TypeScript SDK GitHub releases — v1.27.1 confirmed current stable
- MCP official docs (modelcontextprotocol.io/specification/2025-11-25) — transport architecture, stdio constraints, tool schema API
- MCP Build Server docs (modelcontextprotocol.io/docs/develop/build-server) — import paths, tool registration pattern
- SQLite official docs (sqlite.org/lang_altertable.html) — ALTER TABLE constraints, 12-step rebuild procedure
- DocuMind codebase direct inspection — scheduler.mjs TODO lines 44/68/75, init-database.mjs hardcoded version line 97, relations.mjs sibling loop lines 111–128

### Secondary (MEDIUM confidence)

- MCP SDK zod compat issue #925 (GitHub) — zod 3.25 minimum peer dep floor confirmed
- Integrating MCP into Express (dev.to) — `POST /mcp` mount pattern
- SQLite hierarchical data strategies (moldstud.com, teddysmith.io) — materialized path vs. nested sets vs. closure tables
- MCP and Context Overload (eclipsesource.com, 2026) — keep tool count under 40; description quality affects model behavior
- MCP Tips and Pitfalls (nearform.com) — stdout pollution pattern confirmed
- RAG freshness scoring patterns (ragaboutit.com) — staleness detection as table stakes for agent-facing systems
- Codebase Context Spec (github.com/Agentic-Insights) — portable JSON config pattern for developer tools

### Tertiary (LOW confidence)

- Codebase context spec as portability pattern precedent — single source; validate the DVWDesign profile design against a hypothetical second profile before committing the schema

---
*Research completed: 2026-03-15*
*Ready for roadmap: yes*
