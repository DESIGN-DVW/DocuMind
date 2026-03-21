# Pitfalls Research

**Domain:** Documentation intelligence platform (Node.js daemon + SQLite FTS5 + MCP server)
**Researched:** 2026-03-15
**Confidence:** HIGH (codebase analysis) / MEDIUM (MCP patterns) / HIGH (SQLite migration patterns)

---

## Critical Pitfalls

### Pitfall 1: Non-Idempotent Schema Migration Destroys Live Data

**What goes wrong:**
`init-database.mjs` runs `db.exec(schema)` which executes `CREATE TABLE IF NOT EXISTS` statements. This is safe for table creation, but the migration doesn't version-gate changes. When new columns are added (classifications, tags, summary), re-running `db:init` won't add them to existing tables — `IF NOT EXISTS` skips table creation silently, leaving the schema stale. The current code hardcodes `db_version = '1.0.0'` and never increments it, so there is no mechanism to detect "this DB needs column X added."

**Why it happens:**
Init scripts written for greenfield use don't need idempotency. When you first wired this, there was no live data. Now there are 8K+ indexed documents — a `db:reset` (drop + recreate) destroys all of it. The temptation is to add columns by hand in the SQLite shell, which leaves schema.sql out of sync with the real database.

**How to avoid:**
Implement a `schema_migrations` table before touching any schema column additions. Each migration is a numbered SQL file (`001_add_classifications.sql`, `002_add_tags.sql`, `003_add_summary.sql`). On daemon startup, check which migrations have run, apply only new ones in order. SQLite `ALTER TABLE ... ADD COLUMN` is safe for adding nullable/defaulted columns — use it for the three new fields instead of the 12-step table-rebuild procedure. Only use the 12-step rebuild if you need to add a NOT NULL constraint with no default or change a column type.

**Warning signs:**

- `npm run db:init` completes successfully but `/stats` still shows old column count
- Code references `classifications` or `tags` columns, queries return "no such column" errors
- `schema.sql` and the live database are out of sync (verify with `PRAGMA table_info(documents)`)
- Developer manually ran `ALTER TABLE` in SQLite shell without updating `schema.sql`

**Phase to address:**
Schema migration phase — must be the first deliverable before any processor wiring, because classifications and tags are referenced by keyword-processor and graph population logic.

---

### Pitfall 2: FTS5 Virtual Table Goes Out of Sync After Schema Changes

**What goes wrong:**
`documents_fts` is an FTS5 virtual table with `content='documents'`. When you modify the `documents` table (add columns, backfill data, or run bulk updates outside normal INSERT/UPDATE paths), the FTS index can diverge from the content table. FTS5 with external content does not auto-update when you modify the base table directly via `UPDATE documents SET ...` — it requires explicit `INSERT INTO documents_fts(documents_fts) VALUES('rebuild')` or equivalent triggers to stay current.

**Why it happens:**
Bulk operations like graph population, keyword backfill, and classification tagging will UPDATE thousands of rows in `documents` directly. Developers forget that FTS5 content tables require manual sync — the `IF NOT EXISTS` trigger pattern only covers single-row inserts, not bulk updates.

**How to avoid:**
After any bulk `UPDATE documents` operation, run `INSERT INTO documents_fts(documents_fts) VALUES('rebuild')`. This is safe on 8K documents (completes in seconds). Add this as a mandatory step in the migration runbook and in any bulk-update script. Alternatively, configure update triggers on the `documents` table for the columns indexed by FTS5, but triggers add write overhead.

**Warning signs:**

- `/search?q=term` returns no results for content you can see via `SELECT * FROM documents WHERE content LIKE '%term%'`
- `INSERT INTO documents_fts(documents_fts) VALUES('integrity-check')` reports errors
- Search result counts drop after a bulk data operation

**Phase to address:**
Schema migration phase (set up the rebuild step as part of migration tooling) and graph/keyword population phase (add rebuild call at end of bulk operations).

---

### Pitfall 3: Graph Population Is O(n²) for Same-Folder Siblings

**What goes wrong:**
`buildRelationships()` in `graph/relations.mjs` (lines 111–128) generates `related_to` edges for every document pair that shares a folder. With 8K documents, a flat repo like `RootDispatcher/dispatches/` could have hundreds of files in one directory, creating thousands of weak sibling edges. The entire 8K document corpus is loaded into memory as `docs`, then nested iteration occurs. At 8K documents, worst-case is ~32M comparisons. The resulting `doc_relationships` table could contain millions of low-value `related_to` edges that slow every graph query.

**Why it happens:**
Same-folder siblings as `related_to` relationships makes intuitive sense for small corpora. It wasn't designed with flat dispatch directories in mind. The `buildRelationships` function has never been called in production, so the scaling behavior is untested against real data.

**How to avoid:**
Remove same-folder sibling edges from the bulk build. They add noise more than signal (graph queries are already limited to `LIMIT 500`). If sibling relationships are needed, compute them lazily at query time using a JOIN rather than storing millions of edges. For the link-based (`imports`) and dispatch relationships, the O(n) loop per document is fine. Cap sibling edges per folder at 10 max, or skip the relationship type entirely for directories with more than 20 documents.

**Warning signs:**

- `buildRelationships()` runs for more than 60 seconds against the real DB
- `doc_relationships` table has >500K rows after first population
- Graph query at `/graph?docId=X&hops=2` times out or returns 500
- Recursive CTE query plan shows full table scan on `doc_relationships`

**Phase to address:**
Graph population phase — cap or remove sibling edges before running `buildRelationships` against the live 8K document corpus.

### Pitfall 4: MCP stdout Pollution Kills the Protocol

**What goes wrong:**
MCP stdio transport uses stdout as the JSON-RPC message channel. Any `console.log()` call that writes to stdout will be interpreted as a malformed MCP message by the client, causing protocol errors. DocuMind's existing codebase uses `console.log()` extensively throughout all processors, the scheduler, and server.mjs. If the MCP server is wired as a stdio transport without redirecting these logs to stderr, every tool call will produce garbage output.

**Why it happens:**
The existing codebase was built as a daemon (stdout is a terminal) and as an HTTP server (stdout is a log). MCP stdio transport is a third execution mode where stdout is a wire protocol. The distinction is easy to miss when sharing code between daemon and MCP server contexts.

**How to avoid:**
From the first line of the MCP server entry point, replace `console.log` with a stderr-only logger: `console.log = (...args) => process.stderr.write(args.join(' ') + '\n')`. Alternatively, use the MCP SDK's built-in logging mechanism (`server.sendLoggingMessage`) which routes through the protocol correctly. All imported processor modules that use `console.log` must be audited before wiring into MCP tool handlers.

**Warning signs:**

- Claude reports "invalid JSON" or "unexpected token" when calling a tool
- MCP client disconnects immediately after tool invocation
- Tool invocation succeeds in HTTP mode but fails in stdio mode
- Adding a `console.log` to a processor causes MCP tool calls to break

**Phase to address:**
MCP server phase — audit and redirect all console.log in processor modules before exposing them as MCP tools. This is a prerequisite, not an afterthought.

### Pitfall 5: Context Profile Schema Couples Product to DVWDesign Internals

**What goes wrong:**
DocuMind's classification tree, lint rules, repository paths, relationship types, and keyword taxonomies are currently hardcoded as constants in processor files and config JSONs that reference DVWDesign-specific paths (`/Users/Shared/htdocs/github/DVWDesign/`). When context profiles are introduced to make DocuMind portable, a design trap is to model the profile as "DVWDesign config but with fields swapped." This produces a profile schema that encodes DVW assumptions — field names like `dvwRepoRoot`, categories like `dispatch` and `claude-instructions`, and relationship types like `dispatched_to` — that mean nothing to a marketing team or external user.

**Why it happens:**
It's faster to extract current behavior into a config file than to design a generic abstraction. The result is a config that can only configure DocuMind for DVWDesign-like setups, not the code/marketing/ops verticals mentioned in the strategic plan.

**How to avoid:**
Design the profile schema from the consumer's perspective first: what would a documentation engineer at a SaaS company need to configure? Then map DVWDesign's setup onto that schema as a reference profile. Required generic fields: `repoRoots[]`, `classificationTree{}`, `lintRules{}`, `relationshipTypes[]`, `keywordTaxonomies[]`, `ignorePatterns[]`. DVWDesign-specific categories like `dispatch` and `claude-instructions` should be expressible as named entries in `classificationTree`, not hardcoded enum values in the schema CHECK constraint.

**Warning signs:**

- Profile schema contains field names with "dvw", "dispatched", or "claude" in property keys
- `CHECK` constraints in schema.sql enumerate DVWDesign-specific category names as literals
- Profile validation rejects a hypothetical marketing-team config for no technical reason
- Adding a new relationship type requires changing both the profile schema AND `schema.sql`

**Phase to address:**
Context profiles phase — design the schema from a generic user's perspective before implementing the DVWDesign profile as the first instance.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
| -------- | ----------------- | -------------- | --------------- |
| `CREATE TABLE IF NOT EXISTS` in init script | Simple, no migration logic | Can't evolve schema; forces `db:reset` to apply changes | Never for a DB with live data |
| Per-function `db.open()`/`db.close()` in query-utils | Works fine in CLI scripts | High file descriptor churn in daemon; slows concurrent requests | Only in one-shot CLI scripts, never in daemon context |
| Hardcoded `LIMIT 500` on graph endpoint | Prevents OOM on large graphs | Silently truncates relationships; graph consumers don't know data is incomplete | Acceptable short-term; add a `hasMore` flag to the response |
| `INSERT OR IGNORE` for relationship edges | Prevents duplicate key errors | Masks logic bugs where duplicate detection should be explicit | Acceptable for idempotent builders only |
| `batch()` transaction wrapping entire graph build | Correct atomic semantics | Holds write lock for duration of build; blocks all other writes for minutes | Acceptable if graph build runs during a maintenance window or off-peak cron |
| `console.log` for all daemon output | Fast to write | Breaks MCP stdio transport; no log levels; can't silence in production | Never in MCP server context |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
| ----------- | -------------- | ---------------- |
| MCP stdio transport | Importing processor modules that call `console.log` to stdout | Redirect all console output to stderr at MCP server startup before any imports |
| MCP tool schema | Exposing one tool per API endpoint (14+ tools) | Group by workflow: `search`, `graph`, `write` clusters; keep total tool count under 20 |
| MCP tool schema | Using `string` type for all parameters | Use `enum` for categorical inputs (relationship types, categories), `integer` for limits — models make fewer errors |
| SQLite in daemon | Closing DB connection after each query (current pattern in query-utils) | Use a single shared Database instance opened at daemon start, closed only on SIGTERM |
| FTS5 + bulk writes | Running bulk INSERT/UPDATE without FTS rebuild | Call `documents_fts` rebuild after any batch operation that affects indexed content |
| better-sqlite3 WAL | Copying `documind.db` with `fs.copyFile()` for backup | Use `db.backup()` method or `VACUUM INTO 'backup.db'` — raw file copy in WAL mode can produce a corrupt backup |
| Chokidar on macOS | Relying solely on watcher for freshness | Run hourly scan as authoritative source; treat watcher events as acceleration, not the source of truth |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
| ---- | -------- | ---------- | -------------- |
| Loading all 8K document contents into Node.js memory for graph build | Node process OOM during `buildRelationships()` | Stream documents in batches of 500; process one batch at a time | ~5K+ documents with long content |
| Recursive CTE with no depth limit on graph queries | `/graph?docId=X&hops=5` never returns | Enforce `maxDepth <= 3` in the API; add a `LIMIT 1000` to the recursive CTE | Any graph with cycles or high-degree hub nodes |
| Same-folder sibling edges in `doc_relationships` | `doc_relationships` table grows to millions of rows; index scans slow | Remove or cap sibling edges; filter by `weight > 0.5` in default queries | Repos with flat directory structures (>50 docs per folder) |
| Keyword extraction on full document corpus without batching | Keyword processor runs for >10 minutes, blocking the event loop | Run keyword extraction in batches; commit per batch; use `setImmediate` yields | ~3K+ documents in a single run |
| No index on `(source_doc_id, relationship_type)` in `doc_relationships` | Graph queries degrade as edge count grows | Add compound index before populating graph; the schema includes `idx_rel_source` but verify it covers relationship_type too | >100K edges |

## Security Mistakes

| Mistake | Risk | Prevention |
| ------- | ---- | ---------- |
| MCP tool handlers trust all input parameters | Prompt injection: a document containing `"; DROP TABLE documents; --"` becomes a tool parameter | Validate all string parameters against allowlists or length limits before using in DB queries |
| File path parameters in MCP write tools (lint, fix, convert) not validated against repo roots | Path traversal: MCP client sends `/etc/passwd` as file path | Validate all paths against `context.repoRoots` before any file operation |
| `documind.db` at default Unix 644 permissions | Any local process can read all indexed document content | Set `umask(0o077)` before DB creation; `chmod 600` on existing DB file |
| No rate limiting on MCP write tools | A runaway agent loop calls `lint:fix` on all repos continuously | Add a per-minute call count per tool in the MCP server; return error after threshold |

## "Looks Done But Isn't" Checklist

- [ ] **Schema migration:** `schema.sql` updated AND live DB migrated AND FTS5 rebuilt — verify with `PRAGMA table_info(documents)` and a search for newly-indexed field content
- [ ] **Scheduler wiring:** Cron logs show "Starting hourly incremental scan..." AND `/stats` document count changes after file edits — verify by editing a watched file and checking stats 1 hour later
- [ ] **Graph population:** `buildRelationships()` called AND `doc_relationships` row count > 0 — verify with `SELECT COUNT(*) FROM doc_relationships`
- [ ] **MCP server:** Tool returns structured JSON error on invalid input (not a raw thrown exception) — verify by passing malformed parameters to each tool
- [ ] **Context profiles:** DVWDesign profile loads AND a hypothetical second profile (different repo roots, different classification tree) also loads without code changes — verify by creating a `test-profile.json` with different values
- [ ] **Keyword extraction:** Keywords table populated AND `/keywords` returns results AND keywords survive a daemon restart (persisted, not in-memory)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
| ------- | ------------- | -------------- |
| Applied schema change without migration system; live DB now inconsistent | HIGH | Export data with `sqlite3 documind.db .dump`; apply correct schema fresh; reimport data with path-based deduplication; re-run scan |
| FTS5 index diverged from documents table | LOW | `INSERT INTO documents_fts(documents_fts) VALUES('rebuild')` — safe, idempotent, completes in <30s on 8K docs |
| Graph populated with millions of sibling edges; DB bloated | MEDIUM | `DELETE FROM doc_relationships WHERE relationship_type='related_to'`; re-run graph build with sibling edges removed |
| MCP server producing protocol errors due to stdout pollution | LOW | Add stderr redirect at top of MCP entry point; restart; no data loss |
| Context profile schema too DVW-specific to port | HIGH | Redesign schema generically; migrate DVWDesign config onto new schema; re-validate all processors against new profile shape |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
| ------- | ---------------- | ------------ |
| Non-idempotent schema migration | Schema migration phase (Phase 1) | `npm run db:migrate` runs twice with no errors and no data loss; `PRAGMA table_info(documents)` shows new columns |
| FTS5 out of sync after bulk writes | Schema migration + graph/keyword population | Search for a term known to exist in newly-backfilled content; count must match `SELECT count(*) WHERE content LIKE` |
| Graph O(n²) sibling edges | Graph population phase | `SELECT COUNT(*) FROM doc_relationships` < 50K after full build; `/graph` returns in < 2s |
| MCP stdout pollution | MCP server phase — prerequisite step | All processor `console.log` calls audited; MCP tool call completes without protocol error |
| Context profile coupling to DVW internals | Context profiles phase — design step before implementation | A synthetic second profile with different repoRoots and categories loads and validates without errors |
| Keyword extraction blocking event loop | Keyword processor wiring phase | Keyword extraction completes without Node.js warning about long microtask queue; daemon remains responsive to API requests during extraction |

## Sources

- Codebase analysis: `/Users/Shared/htdocs/github/DVWDesign/DocuMind/.planning/codebase/CONCERNS.md` (2026-03-15)
- Codebase analysis: `graph/relations.mjs` — same-folder sibling loop identified at lines 111–128
- Codebase analysis: `daemon/scheduler.mjs` — TODO placeholders confirmed at lines 44, 68, 75
- Codebase analysis: `scripts/db/init-database.mjs` — hardcoded version `'1.0.0'` at line 97; no migration table
- SQLite ALTER TABLE official docs: [https://www.sqlite.org/lang_altertable.html](https://www.sqlite.org/lang_altertable.html) — HIGH confidence; 12-step rebuild procedure for unsupported column changes
- SQLite migration strategies: [SQLite Versioning and Migration Strategies](https://www.sqliteforum.com/p/sqlite-versioning-and-migration-strategies) — MEDIUM confidence
- WAL corruption in backups: [SQLite Corruption with fs.copyFile()](https://scottspence.com/posts/sqlite-corruption-fs-copyfile-issue) — MEDIUM confidence
- MCP tool overload: [MCP and Context Overload](https://eclipsesource.com/blogs/2026/01/22/mcp-context-overload/) — HIGH confidence (2026 post with measured token costs)
- MCP stdout pitfall: [Implementing MCP: Tips, Tricks and Pitfalls — Nearform](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/) — HIGH confidence
- MCP transport standards: [MCP Transports spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) — HIGH confidence; stdio + Streamable HTTP are the two current standards; SSE deprecated
- MCP tool count limits: [Cursor hard limit of 40 tools](https://www.truefoundry.com/blog/mcp-servers-in-cursor-setup-configuration-and-security-guide) — MEDIUM confidence; design DocuMind MCP to stay well under this
- Config anti-patterns: [Environment variables and configuration anti-patterns — Liran Tal](https://lirantal.com/blog/environment-variables-configuration-anti-patterns-node-js-applications) — MEDIUM confidence

*Pitfalls research for: DocuMind v3.0 — documentation intelligence platform*
*Researched: 2026-03-15*
