# Requirements: DocuMind v3.3

**Defined:** 2026-04-08
**Core Value:** When you look at a document, you instantly see what it's connected to — what links to it, what duplicates it, and whether it's stale.

## v3.3 Requirements

### Graph DB Foundation (GRAPH)

- [ ] **GRAPH-01**: Kuzu DB initializes with document relationship schema on daemon startup
- [ ] **GRAPH-02**: Kuzu database path is configurable via `DOCUMIND_KUZU_DIR` env var
- [ ] **GRAPH-03**: Docker image builds successfully with Kuzu native addon (Debian bookworm base)

### Sync Bridge (SYNC)

- [ ] **SYNC-01**: After each relationship rebuild, doc_relationships sync automatically from SQLite → Kuzu
- [ ] **SYNC-02**: Operator can trigger full Kuzu graph rebuild via `npm run graph:rebuild`
- [ ] **SYNC-03**: `/health` endpoint reports Kuzu edge count and sync status vs SQLite

### Query Layer (QUERY)

- [ ] **QUERY-01**: `GET /graph` supports `direction=forward|reverse|both` parameter (Kuzu backend)
- [ ] **QUERY-02**: `get_related` MCP tool uses Kuzu Cypher traversal (same response contract, reverse traversal enabled)

### Graph Algorithms (ALGO)

- [ ] **ALGO-01**: `graph_rank` MCP tool returns documents ranked by PageRank
- [ ] **ALGO-02**: `graph_cycles` MCP tool returns circular dependency chains (SCC)
- [ ] **ALGO-03**: `graph_orphans` MCP tool returns isolated documents (WCC)

### Text-to-Cypher (CYPHER)

- [ ] **CYPHER-01**: `graph_query` MCP tool accepts natural language, returns graph query results
- [ ] **CYPHER-02**: `DOCUMIND_LLM_PROVIDER` env var selects LLM (default: `anthropic`)
- [ ] **CYPHER-03**: Generated Cypher sanitized to block write operations (DELETE/MERGE/DROP)
- [ ] **CYPHER-04**: `graph_query` degrades gracefully when no API key is configured

### Visualization (VIZ)

- [ ] **VIZ-01**: `dashboard/` is a minimal Vite React app consuming `@design-dvw/ui`, builds to static files served by Express
- [ ] **VIZ-02**: `graph.html` displays interactive Cytoscape.js document graph with `@design-dvw/ui` shell (Card, Badge, Button)
- [ ] **VIZ-03**: Graph page supports filtering by repo, relationship type, and traversal depth
- [ ] **VIZ-04**: Kuzu Explorer runs as optional PM2 service (`documind-kuzu-explorer`) for developer access
- [ ] **VIZ-05**: `GET /graph/export` provides graph data in JSON format for external visualization tools

## Future Requirements (v3.4+)

### Graph Intelligence

- Louvain community detection (document cluster discovery)
- GraphRAG / vector search integration
- Migrate diagrams.html to React + @design-dvw/ui

### Graph DB

- Fork evaluation: Bighorn or Ladybug as Kuzu replacement once npm packages are stable
- LangChain JS official Kuzu adapter (when/if published)

## Out of Scope

| Feature | Reason |
| --- | --- |
| Replace SQLite FTS5 with Kuzu | FTS5 has no Kuzu equivalent; Kuzu handles graph, SQLite handles search |
| Kuzu as server process | Must stay in-process (embedded); server mode breaks single-writer constraint |
| Multi-tenant Kuzu | Single-user embedded architecture; SaaS layer is a separate milestone |
| Real-time graph updates | Batch sync after scan is sufficient; streaming adds complexity with no clear benefit |
| Migrate diagrams.html to React | Separate dashboard refactor milestone; diagrams.html stays plain HTML in v3.3 |

## Traceability

| Requirement | Phase | Status |
| --- | --- | --- |
| GRAPH-01 | Phase 16 | Pending |
| GRAPH-02 | Phase 16 | Pending |
| GRAPH-03 | Phase 16 | Pending |
| SYNC-01 | Phase 17 | Pending |
| SYNC-02 | Phase 17 | Pending |
| SYNC-03 | Phase 17 | Pending |
| QUERY-01 | Phase 18 | Pending |
| QUERY-02 | Phase 18 | Pending |
| ALGO-01 | Phase 19 | Pending |
| ALGO-02 | Phase 19 | Pending |
| ALGO-03 | Phase 19 | Pending |
| CYPHER-01 | Phase 20 | Pending |
| CYPHER-02 | Phase 20 | Pending |
| CYPHER-03 | Phase 20 | Pending |
| CYPHER-04 | Phase 20 | Pending |
| VIZ-01 | Phase 21 | Pending |
| VIZ-02 | Phase 21 | Pending |
| VIZ-03 | Phase 21 | Pending |
| VIZ-04 | Phase 21 | Pending |
| VIZ-05 | Phase 21 | Pending |

**Coverage:**
- v3.3 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---

*Requirements defined: 2026-04-08*
*Last updated: 2026-04-08 after initial definition*
