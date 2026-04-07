# Feature Research

**Domain:** Kuzu Graph DB + LangChain text-to-Cypher for a documentation intelligence system
**Researched:** 2026-04-07
**Confidence:** HIGH (Kuzu algo extension from docs.kuzudb.com); HIGH (LangChain KuzuGraph from PyPI + official
langchain docs); MEDIUM (text-to-Cypher NL query patterns from community sources + ACL 2025 paper);
MEDIUM (documentation-domain graph algorithm applicability — synthesized from domain knowledge)

---

## Context Note

This research covers ONLY what v3.3 adds on top of DocuMind v3.1. Already built and NOT re-researched:

- 8-type document relationship graph (imports, parent_of, variant_of, supersedes, depends_on,
  related_to, generated_from, dispatched_to) stored in SQLite `doc_relationships` table
- Forward-only CTE traversal up to 3 hops via `/graph` REST endpoint
- `get_related` MCP tool
- FTS5 full-text search, TF-IDF keyword extraction, similarity/deviation detection

The question is: what does replacing the SQLite graph layer with Kuzu + adding LangChain text-to-Cypher
actually unlock? Answer: bidirectional traversal, graph algorithms native to graph DBs, variable-length
patterns without CTE complexity, and natural language queries from agents without writing Cypher.

---

## What Cypher Enables That SQL CTEs Cannot

This is the foundational justification for the migration. Not "Cypher is nicer" — concrete capabilities:

| Capability | SQL CTE Approach | Cypher Approach | Why It Matters |
| ---------- | ---------------- | --------------- | -------------- |
| Reverse traversal | Requires `UNION` of forward + flipped join, re-written per query | `MATCH (a)<-[r]-(b)` — direction reversal is a syntax character | "What documents reference this CLAUDE.md?" currently requires a separate query variant |
| Bidirectional traversal | Two CTEs unioned, O(n^2) on large hop counts | `MATCH (a)-[r]-(b)` (undirected) — single pass | "What is connected to this doc, regardless of direction?" |
| Variable-length any-depth | Forward CTE with explicit max-hop guard; 3-hop cap is a workaround for performance | `MATCH (a)-[*1..5]->(b)` — built-in kleene star with termination guarantee | Unlimited traversal depth without query rewrites |
| Shortest path between docs | Not expressible in SQLite without graph-specific extension | `MATCH (a)-[r* SHORTEST 1..10]->(b)` — native shortest path keyword | "What is the connection chain between CLAUDE.md and a dispatch?" |
| All shortest paths | Not supported | `MATCH (a)-[r* ALL SHORTEST 1..10]->(b)` — returns all minimal paths | Dependency chain analysis |
| Pattern matching on cycles | Requires explicit visited-set anti-join; expensive | SCC algo extension detects mutual reachability natively | Circular dependency detection in doc graph |
| Multi-hop with relationship type filtering | CTE must carry rel_type through each recursion step | `MATCH (a)-[:supersedes|depends_on*1..3]->(b)` — inline type filter | "Find all superseded chains of length > 2" |
| Ranked graph results | No native ordering by graph position; requires post-processing | PageRank scores returned as node property — `ORDER BY pagerank DESC` | "Which docs are most referenced? Which are orphans?" |

**Confidence:** HIGH — Cypher vs SQL CTE comparison corroborated by multiple sources including
academic benchmarks (LDBC-SF100, 280M nodes / 1.7B edges) and Kuzu documentation.

---

## Feature Landscape

### Table Stakes (Users/Agents Expect These)

"Users" here means Claude Code agents calling DocuMind MCP tools, and Dave querying via REST.
Missing any of these makes the Kuzu migration feel like a lateral move with no benefit.

| Feature | Why Expected | Complexity | Notes |
| ------- | ------------ | ---------- | ----- |
| Kuzu installed alongside SQLite (not replacing it) | SQLite FTS5 and the existing keyword/similarity tables stay; Kuzu owns only graph data. Mixed-storage is the correct architecture — Kuzu excels at graph traversal, SQLite at text search | LOW | `npm install kuzu`. Kuzu is an embedded in-process DB like SQLite — no server to spin up. Stores data in a directory (configurable via `KUZU_DB_PATH` env var). Dependency: `better-sqlite3` stays for FTS5, keyword, similarity, scan_runs tables. |
| `doc_relationships` migrated from SQLite to Kuzu | If doc_relationships stays in SQLite, all graph queries still use CTE — Kuzu adds zero value | MEDIUM | Migration script reads all rows from SQLite `doc_relationships`, creates Kuzu node table (Document) and relationship tables (one per rel_type for typed edges). The 8 rel_types become 8 Kuzu edge tables, enabling per-type traversal filtering. Keep SQLite `doc_relationships` as read-only archive until v3.3 stabilizes. |
| Reverse traversal query (`<-` direction in Cypher) | The most immediately valuable capability missing from the current forward-only CTE | LOW | `MATCH (a:Document)<-[r:IMPORTS]-(b:Document) WHERE a.path = $path RETURN b` — trivial in Cypher, currently requires a second REST call with source/target flipped in SQLite. Wire to existing `/graph` endpoint as `direction=reverse` query param. |
| `/graph` REST endpoint queries Kuzu | If the REST API still hits SQLite, the migration is invisible to consumers | MEDIUM | Refactor `graph/queries.mjs` to emit Cypher instead of recursive CTEs. `db.query(cypher, params)` via Kuzu Node.js SDK. Response shape stays identical — path-breaking API changes deferred. |
| `get_related` MCP tool queries Kuzu | Same as above — tool behavior unchanged, implementation backend swapped | LOW | Change the SQL query inside `get_related` handler to a Kuzu Cypher query. Same input/output contract. |
| Bidirectional graph queries in `/graph` | "Show everything connected to this doc" is the natural query; forward-only is an artificial limitation of the SQLite backend | LOW | `direction=both` param on `/graph` endpoint. Cypher: `MATCH (a:Document)-[r]-(b:Document) WHERE a.id = $id` |

**Confidence:** HIGH — Kuzu Node.js SDK confirmed at docs.kuzudb.com; embedded no-server architecture
confirmed from official Kuzu docs and multiple 2025 blog posts. Migration approach from Kuzu's own
graph construction documentation.

---

### Differentiators (New Capabilities Kuzu Unlocks)

These are what make v3.3 a meaningful step beyond "SQLite with a migration." Each is grounded in the
documentation domain — not generic graph theory.

| Feature | Value Proposition | Complexity | Notes |
| ------- | ----------------- | ---------- | ----- |
| PageRank over doc graph | Identifies the most-referenced documents in the ecosystem — candidates for canonicalization, most likely to be stale with high blast radius, most important to keep accurate | MEDIUM | Kuzu `algo` extension (pre-installed in v0.11.3+). `CALL algo.pagerank(...)` returns `(node, rank)`. Expose as `/graph/rank` REST endpoint and `graph_rank` MCP tool. Practical output: "CLAUDE.md has PageRank 0.34 — it's the hub. This undocumented file has PageRank 0.001 — orphan candidate." |
| Betweenness centrality | Identifies bridge documents — docs that connect otherwise disconnected clusters. A bridge doc going stale can isolate entire sub-graphs of documentation | MEDIUM | Same algo extension. `CALL algo.betweenness_centrality(...)`. Most useful for multi-repo graphs where one shared doc connects two repos. Surface in `/graph/centrality` endpoint. |
| Strongly Connected Components (SCC) / cycle detection | Detects circular dependency chains — e.g., doc A `supersedes` doc B which `supersedes` doc A. In a forward-only CTE world this query either loops infinitely or requires an anti-cycle guard that makes it expensive | MEDIUM | `CALL algo.scc(...)` returns component IDs. Nodes sharing a component ID form a cycle. New `graph_cycles` MCP tool returns cycle members + rel_types. Critical for `supersedes` and `depends_on` relationship types where cycles are logic errors. |
| Weakly Connected Components (WCC) / orphan detection | Detects completely disconnected documents — docs with no relationships at all. At 8K+ documents, orphan detection is non-trivial without a graph DB | LOW | `CALL algo.wcc(...)`. Nodes in singleton components (component size = 1) are orphans. Expose as `/graph/orphans` endpoint. This is immediately actionable — orphans are candidates for deletion or manual linking. |
| Louvain community detection | Groups documents into topical clusters based on relationship density — surfaces implicit documentation "modules" that may not align with repo structure | HIGH | `CALL algo.louvain(...)`. Useful but niche for DocuMind's current scale. Deferred to post-MVP. Operates on undirected version of graph (Kuzu limitation — directed edges treated as undirected for Louvain). |
| K-Core decomposition | Identifies cohesive subgraphs where each node has at least k connections — surfaces the "core" of the doc ecosystem vs peripheral docs | MEDIUM | `CALL algo.kcore(...)`. Useful for understanding documentation density. Lower priority than PageRank and SCC for immediate value. |
| Shortest path between two named docs | "What is the connection chain between ARCHITECTURE.md and this CLAUDE.md?" — an agent can now answer architecture provenance questions | MEDIUM | `MATCH (a:Document {path: $from})-[r* SHORTEST 1..10]->(b:Document {path: $to}) RETURN r`. New `graph_path` MCP tool with `from_path` and `to_path` params. |
| LangChain KuzuQAChain text-to-Cypher | Agents (and humans via CLI) can ask natural language questions about the doc graph without writing Cypher. The LLM generates and executes the Cypher query, returns a natural language answer. | HIGH | `langchain-kuzu` Python package (PyPI, January 2025). **Important caveat:** this is a Python package — DocuMind is Node.js. Integration requires either: (a) a Python sidecar process called via spawn, or (b) reimplementing the text-to-Cypher bridge in the LangChain JS ecosystem. See dependency notes. |
| Natural language graph queries via new MCP tool | "Which docs in the LibraryAssetManager repo depend on the most other documents?" answered without Cypher | HIGH | Wraps the text-to-Cypher bridge. New `graph_query` MCP tool accepts `question: string`, returns `{ cypher: string, result: any[], answer: string }`. The `cypher` field is returned for auditability — agents can see what query was generated. |

**Confidence:** MEDIUM for LangChain KuzuGraph text-to-Cypher — the Python package is real and documented,
but the Node.js/JS bridge is not directly supported by `langchain-kuzu`. The text-to-Cypher pattern works
in the LangChain JS ecosystem via `GraphCypherQAChain` (confirmed in LangChain JS docs), but requires
wiring to Kuzu's Node.js SDK directly rather than using the Python package. HIGH confidence for all
algo extension features — documented at docs.kuzudb.com/extensions/algo/.

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
| ------- | ------------- | --------------- | ----------- |
| Replacing SQLite entirely with Kuzu | "One DB is cleaner than two" | Kuzu does not have FTS5. Full-text search across 8K+ markdown files is DocuMind's most-used feature. Migrating FTS5 to Kuzu would require either custom trigram matching or a vector search approach — both are v4+ work. Kuzu's vector search extension exists but is not a drop-in for FTS5 keyword matching. | Keep SQLite for FTS5, keywords, similarity, scan_runs. Kuzu owns only doc_relationships and graph query results. Two embedded DBs, no servers. |
| Running Kuzu as a separate server process | "Neo4j runs as a server, so Kuzu should too" | Kuzu is explicitly designed as an embedded in-process DB (like SQLite, DuckDB). Running it as a server adds network latency, auth complexity, and a crash surface for zero architectural gain at DocuMind's scale. | `const db = new kuzu.Database(path)` — in-process, same Node.js process as the Express daemon. |
| Louvain community detection in MVP | "It sounds like the most interesting algorithm" | Louvain operates on an undirected projection of the graph, losing edge direction information that is semantically meaningful in DocuMind (e.g., `supersedes` is directional). At 8K docs with sparse relationships, communities will be poorly defined. The algorithm requires significant parameter tuning. | Defer to post-MVP. Ship PageRank + SCC first — those have clear, immediately actionable outputs for the documentation domain. |
| Semantic/vector graph queries via Kuzu vector extension | "Replace FTS5 with graph-aware vector search" | Kuzu has a vector search extension (confirmed 2025), but combining semantic similarity with graph traversal (GraphRAG) is a significant research-grade feature. It would require embedding generation for all 8K+ documents, an embedding model, and a hybrid retrieval pipeline. Out of scope for v3.3. | Explicitly deferred in PROJECT.md. FTS5 + TF-IDF is sufficient for current scale. |
| Text-to-Cypher without auditability | "Just return the answer, hide the Cypher" | Generated Cypher queries can be wrong. LLMs hallucinate Cypher clauses, use wrong property names, or generate queries that scan the whole graph. Without returning the generated Cypher to the caller, there is no way to detect or debug failures. | `graph_query` MCP tool always returns `{ cypher, result, answer }`. The `cypher` field lets agents and Dave inspect what was actually run. |
| Storing graph algorithm results persistently in DB | "Cache PageRank scores so queries are fast" | Algorithm scores go stale whenever relationships change. Cached scores create a consistency problem — a document's PageRank after a new `depends_on` edge is added is wrong until the cache is invalidated. At DocuMind's scale (~8K docs, sparse edges), PageRank runs in milliseconds — no caching needed. | Run algorithms on-demand per REST/MCP call. Accept sub-second latency. Cache only if profiling proves a bottleneck. |
| Replacing the existing `get_related` MCP tool interface | "Kuzu enables richer output — change the response schema" | The existing `get_related` tool is registered across 16 DVWDesign repos' Claude Code configs. Changing the response schema breaks all of them silently — agents get unexpected shapes. | Keep `get_related` interface identical (same inputs, same outputs). Add new tools (`graph_rank`, `graph_cycles`, `graph_query`, `graph_path`) for new capabilities. Never modify existing tool contracts without coordinating across all 16 repos. |

---

## Feature Dependencies

```text
[Kuzu installed in-process]
    └── is prerequisite for ──> [doc_relationships migration to Kuzu]
    └── is prerequisite for ──> [all graph algorithm calls]
    └── is prerequisite for ──> [Cypher query backend for /graph endpoint]

[doc_relationships migration to Kuzu]
    └── is prerequisite for ──> [reverse traversal]
    └── is prerequisite for ──> [bidirectional traversal]
    └── is prerequisite for ──> [PageRank — needs edges in Kuzu to score nodes]
    └── is prerequisite for ──> [SCC / cycle detection — needs all edge types in Kuzu]
    └── is prerequisite for ──> [WCC / orphan detection]
    └── is prerequisite for ──> [shortest path queries]

[/graph REST endpoint → Kuzu backend]
    └── requires ──> [doc_relationships migration to Kuzu]
    └── requires ──> [graph/queries.mjs refactored to Cypher]
    └── enhances ──> [get_related MCP tool] (same backend, different interface)

[graph_rank MCP tool (PageRank)]
    └── requires ──> [Kuzu algo extension loaded]
    └── requires ──> [doc_relationships in Kuzu]

[graph_cycles MCP tool (SCC)]
    └── requires ──> [Kuzu algo extension loaded]
    └── requires ──> [doc_relationships in Kuzu]
    └── most valuable for ──> [supersedes + depends_on relationship types]

[graph_path MCP tool (shortest path)]
    └── requires ──> [doc_relationships in Kuzu]
    └── requires ──> [document nodes addressable by path, not just internal ID]

[graph_query MCP tool (text-to-Cypher)]
    └── requires ──> [Kuzu Node.js SDK]
    └── requires ──> [LangChain JS GraphCypherQAChain OR Python sidecar]
    └── requires ──> [LLM API key configured (OPENAI_API_KEY or equivalent)]
    └── requires ──> [Kuzu schema exported for LLM context injection]
    └── is independent of ──> [doc_relationships migration timing] (can be wired to any Kuzu schema)

[WCC orphan detection]
    └── requires ──> [doc_relationships in Kuzu]
    └── enhances ──> [existing stale document detection in SQLite] (orphan = no graph edges)

[Louvain community detection]
    └── requires ──> [doc_relationships in Kuzu]
    └── requires ──> [sufficient edge density — sparse graphs produce meaningless communities]
    └── lower priority than ──> [PageRank + SCC]
```

### Dependency Notes

- **LangChain KuzuGraph is Python-only as of 2026-04-07.** The `langchain-kuzu` package on PyPI is the official integration. LangChain JS has `GraphCypherQAChain` which is the equivalent pattern, but requires manually wiring Kuzu's Node.js SDK as the graph backend. This is the highest-complexity feature in v3.3 and should be built last, after all other graph features are working. Confidence MEDIUM — no official LangChain JS + Kuzu Node.js integration example found; requires custom bridging.

- **Schema injection is required for accurate Cypher generation.** The LLM must receive the Kuzu node/edge schema (table names, property names, relationship types) as context for every text-to-Cypher call. Without it, the LLM invents property names. DocuMind's schema is simple (Document nodes with path/repo/title properties, 8 edge types with weight/context properties) — schema injection is low-overhead.

- **Kuzu algo extension is pre-installed in v0.11.3+.** No manual `INSTALL algo` step needed. Confirmed from Kuzu release notes for v0.11.3.

- **Document nodes must use `path` as the natural key**, not internal Kuzu node IDs, so that MCP tools can accept human-readable paths as query parameters and return them in results without a secondary lookup.

---

## MVP Definition

v3.3 MVP = Kuzu installed, doc_relationships migrated, `/graph` queries Cypher, reverse traversal works,
PageRank and SCC exposed via new MCP tools. Text-to-Cypher is stretch goal, not MVP gate.

### Launch With (v3.3 core)

- [ ] Kuzu installed (`npm install kuzu`), database initialized at startup alongside SQLite — foundation
- [ ] Migration script: reads SQLite `doc_relationships`, creates Kuzu node + edge tables, inserts all rows — data layer
- [ ] `graph/queries.mjs` refactored to emit Cypher via Kuzu Node.js SDK — backend swap
- [ ] `/graph` endpoint: `direction=forward|reverse|both` param, all three using Kuzu — unblocks reverse traversal
- [ ] `get_related` MCP tool: backend swapped to Kuzu, interface unchanged — transparent upgrade
- [ ] `graph_rank` MCP tool: runs PageRank via algo extension, returns `(path, rank)` ranked list — new capability
- [ ] `graph_cycles` MCP tool: runs SCC, returns cycle member lists with rel_types — cycle detection
- [ ] `/graph/orphans` REST endpoint: runs WCC, returns docs with no relationships — orphan detection

### Add After Validation (v3.3.x)

- [ ] `graph_path` MCP tool: shortest path between two named docs — trigger: agents need provenance chains
- [ ] `graph_query` MCP tool: text-to-Cypher via LangChain JS GraphCypherQAChain — trigger: natural language queries validated as useful in practice
- [ ] K-Core decomposition endpoint — trigger: request for "core documentation" identification

### Future Consideration (v4+)

- [ ] Louvain community detection — needs denser graph; defer until doc count and edge count grow
- [ ] GraphRAG (semantic + graph hybrid) — requires embedding model and vector search; out of scope without SaaS path
- [ ] Kuzu vector search extension — only if FTS5 proves insufficient at larger scale

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
| ------- | ---------- | ------------------- | -------- |
| Kuzu install + initialization | HIGH (foundation for everything) | LOW | P1 |
| Migration script (SQLite → Kuzu) | HIGH (nothing else works without it) | MEDIUM | P1 |
| /graph → Cypher backend + reverse traversal | HIGH (immediately useful; forward-only is a known limitation) | MEDIUM | P1 |
| get_related MCP tool → Kuzu backend | HIGH (transparent upgrade to existing users) | LOW | P1 |
| graph_rank MCP tool (PageRank) | HIGH (doc importance ranking is immediately actionable) | MEDIUM | P1 |
| graph_cycles MCP tool (SCC) | HIGH (cycle detection in supersedes/depends_on is a correctness check) | MEDIUM | P1 |
| /graph/orphans (WCC orphan detection) | MEDIUM (useful for cleanup; not urgent) | LOW | P2 |
| graph_path MCP tool (shortest path) | MEDIUM (useful for provenance; niche) | MEDIUM | P2 |
| graph_query MCP tool (text-to-Cypher) | HIGH (natural language queries remove Cypher knowledge barrier) | HIGH (Node.js bridge required) | P2 |
| K-Core decomposition | LOW (interesting but not immediately actionable) | MEDIUM | P3 |
| Louvain community detection | LOW (needs denser graph to produce useful clusters) | HIGH | P3 |

**Priority key:**
- P1: Must have for v3.3 milestone completion
- P2: Add once Kuzu backend is proven working
- P3: Nice to have, future consideration

---

## Natural Language Query Patterns (Text-to-Cypher)

What users/agents would actually ask — grounded in the documentation domain, not generic graph examples.
These inform the schema injection context and example queries needed for accurate Cypher generation.

| Natural Language Query | Generated Cypher Pattern | Practical Value |
| ---------------------- | ------------------------ | --------------- |
| "Which docs reference CLAUDE.md?" | `MATCH (a)-[:IMPORTS\|RELATED_TO]->(b {path:'...CLAUDE.md'}) RETURN a.path` | Reverse traversal — currently impossible |
| "What are the most important docs in LibraryAssetManager?" | PageRank filtered by `repo = 'LibraryAssetManager'` | Doc triage, canonicalization candidates |
| "Are there any circular dependencies in the dispatch chain?" | SCC on `DISPATCHED_TO` edge type | Correctness check for RootDispatcher |
| "What is the shortest connection between ARCHITECTURE.md and REQUIREMENTS.md?" | Shortest path query | Provenance / traceability |
| "Which docs have no relationships?" | WCC singleton filter | Orphan cleanup |
| "What docs does this CLAUDE.md depend on, up to 4 hops?" | Variable-length traversal `[*1..4]` on `DEPENDS_ON` | Deep dependency analysis |
| "Which docs are superseded by something but still referenced?" | Pattern: superseded AND has incoming `IMPORTS` edge | Stale reference detection |

---

## Sources

- Kuzu graph algorithms extension (official, HIGH confidence): [docs.kuzudb.com/extensions/algo/](https://docs.kuzudb.com/extensions/algo/)
- Kuzu PageRank (official, HIGH confidence): [docs.kuzudb.com/extensions/algo/pagerank/](https://docs.kuzudb.com/extensions/algo/pagerank/)
- Kuzu SCC (official, HIGH confidence): [docs.kuzudb.com/extensions/algo/scc/](https://docs.kuzudb.com/extensions/algo/scc/)
- Kuzu WCC (official, HIGH confidence): [docs.kuzudb.com/extensions/algo/wcc/](https://docs.kuzudb.com/extensions/algo/wcc/)
- Kuzu K-Core Decomposition (official, HIGH confidence): [kuzudb.github.io/docs/extensions/algo/kcore/](https://kuzudb.github.io/docs/extensions/algo/kcore/)
- Kuzu Louvain (official, HIGH confidence): [kuzudb.github.io/docs/extensions/algo/louvain/](https://kuzudb.github.io/docs/extensions/algo/louvain/)
- Kuzu variable-length patterns + shortest path (official, HIGH confidence): [docs.kuzudb.com/cypher/](https://docs.kuzudb.com/cypher/)
- Kuzu differences from Neo4j (official, HIGH confidence): [docs.kuzudb.com/cypher/difference/](https://docs.kuzudb.com/cypher/difference/)
- langchain-kuzu PyPI package (official, HIGH confidence): [pypi.org/project/langchain-kuzu/](https://pypi.org/project/langchain-kuzu/)
- LangChain Kuzu integration docs (official, HIGH confidence): [docs.langchain.com/oss/python/integrations/graphs/kuzu_db](https://docs.langchain.com/oss/python/integrations/graphs/kuzu_db)
- LangChain-Kuzu integration overview, Jan 2025 (MEDIUM confidence): [analyticsvidhya.com/blog/2025/01/langchain-kuzu-integration/](https://www.analyticsvidhya.com/blog/2025/01/langchain-kuzu-integration/)
- Text2Cypher ACL 2025 paper (HIGH confidence): [aclanthology.org/2025.genaik-1.11.pdf](https://aclanthology.org/2025.genaik-1.11.pdf)
- Kuzu v0.11.3 release notes — algo pre-installed (MEDIUM confidence): [github.com/kuzudb/kuzu/releases](https://github.com/kuzudb/kuzu/releases)
- Cypher vs SQL recursive CTE comparison (MEDIUM confidence — multiple concordant sources): [transliterationapplication.readthedocs.io — cypher_vs_sql](https://transliterationapplication.readthedocs.io/en/latest/sources/articles/cypher_vs_sql.html)
- Kuzu GitHub (HIGH confidence): [github.com/kuzudb/kuzu](https://github.com/kuzudb/kuzu)

---

*Feature research for: DocuMind v3.3 — Kuzu Graph DB + LangChain text-to-Cypher integration*
*Researched: 2026-04-07*
