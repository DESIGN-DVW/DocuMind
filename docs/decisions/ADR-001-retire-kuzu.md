---
date: "2026-05-29"
status: "accepted"
deciders: ["David Viard", "Claude @ DocuMind"]
---

# ADR-001: Retire Kuzu Graph Database

## Context

DocuMind v2.0 introduced Kuzu (a Cypher-compatible embedded graph DB) as a graph layer
alongside its primary SQLite store. The intent was to enable expressive multi-hop traversal
and graph-native queries over the 184,000+ document relationship edges stored in
`doc_relationships`.

After months of operation, two structural problems emerged:

**1. Persistent drift.** Kuzu consistently reported 0 edges while SQLite held 184,928.
Root causes:

- Startup backfill checked `COUNT(Document)` nodes, not edge count — empty graphs
  passed the check even with all nodes but no edges.
- The sync (`syncToKuzu`) issued one Cypher MERGE query per edge — 184,928 sequential
  round-trips timed out every time, leaving the graph perpetually empty.

**2. Ecosystem redundancy.** Two systems in the DVW stack already cover Kuzu's intended role:

- **Graphify** — code + docs knowledge graph with community detection and traversal.
  Handles the "graph of relationships" use case natively.
- **Obsidian Vaults** — personal knowledge and memory store, orthogonal to DocuMind.

## Decision

Retire Kuzu from DocuMind. All graph traversal now uses SQLite CTEs directly against
`doc_relationships` (the authoritative edge store). Graphify covers graph visualization,
community detection, and multi-repo relationship analysis.

## Consequences

### What changes

| Component                           | Before                                 | After                                  |
| ----------------------------------- | -------------------------------------- | -------------------------------------- |
| `/graph?docId=` REST endpoint       | `kuzuTraverseGraph()` (Kuzu Cypher)    | `traverseGraph()` (SQLite JOIN)        |
| `get_related` MCP tool              | `kuzuFindRelated()` (Kuzu recursive)   | `findRelated()` (SQLite recursive CTE) |
| `/health` endpoint                  | Reports Kuzu edge count + drift status | Reports SQLite edge count only         |
| Obsolescence detector `link` signal | Kuzu inbound edge count                | SQLite `COUNT(target_doc_id)`          |
| Deep scan (`runDeepScan`)           | Calls `syncToKuzu` after graph rebuild | Graph rebuild only (SQLite)            |

### Files deleted

- `graph/kuzu-init.mjs`
- `graph/kuzu-sync.mjs`
- `graph/kuzu-queries.mjs`
- `scripts/rebuild-kuzu-graph.mjs`
- `scripts/smoke-test-kuzu-queries.mjs`
- `scripts/kuzu-smoke-test.mjs`
- `data/documind.kuzu/` (database directory)

### New file

- `graph/sqlite-traversal.mjs` — `traverseGraph()` (single-hop) + `findRelated()`
  (recursive CTE, up to N hops) — same response contract as the Kuzu functions they replace.

### What does NOT change

- `doc_relationships` table — the 184,928 edges remain; SQLite was always the source of truth.
- `graph/relations.mjs` — relationship builder is unaffected.
- All other DocuMind features (FTS5, keyword extraction, diagram registry, linting, etc.).

### Ecosystem role going forward

| System       | Responsibility                                                         |
| ------------ | ---------------------------------------------------------------------- |
| **DocuMind** | MD linting, diagram curation, doc indexing, FTS, staleness detection   |
| **Graphify** | Code + docs knowledge graph, community detection, cross-repo traversal |
| **Obsidian** | Personal knowledge store and memory input                              |
