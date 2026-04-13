# Roadmap: DocuMind

## Milestones

- ✅ **v3.0 Documentation Intelligence Platform** — Phases 1-5 (shipped 2026-03-22)

- ✅ **v3.1 Polish & Propagation** — Phases 6-10 (shipped 2026-03-23)

- ✅ **v3.2 Dockerize** — Phases 11-15 (shipped 2026-03-28)

- 🚧 **v3.3 Kuzu Graph Intelligence** — Phases 16-21 (in progress)

## Phases

<details>
<summary>✅ v3.0 Documentation Intelligence Platform (Phases 1-5) — SHIPPED 2026-03-22</summary>

- [x] Phase 1: Schema Migration Foundation (3/3 plans) — completed 2026-03-17

- [x] Phase 2: Context Profile Loader (2/2 plans) — completed 2026-03-17

- [x] Phase 3: Orchestrator and Scheduler Wiring (4/4 plans) — completed 2026-03-17

- [x] Phase 4: MCP Server — Read Tools (2/2 plans) — completed 2026-03-17

- [x] Phase 5: MCP Server — Write Tools (3/3 plans) — completed 2026-03-22

Full details: `.planning/milestones/v3.0-ROADMAP.md`

</details>

<details>
<summary>✅ v3.1 Polish & Propagation (Phases 6-10) — SHIPPED 2026-03-23</summary>

- [x] Phase 6: MCP Intelligence Tools (1/1 plan) — completed 2026-03-22

- [x] Phase 7: Diagram Registry Completion (1/1 plan) — completed 2026-03-22

- [x] Phase 8: Slash Command Updates (2/2 plans) — completed 2026-03-22

- [x] Phase 9: Markdown Tooling Propagation (1/1 plan) — completed 2026-03-22

- [x] Phase 10: Documentation Fixes (2/2 plans) — completed 2026-03-22

Full details: `.planning/milestones/v3.1-ROADMAP.md`

</details>

<details>
<summary>✅ v3.2 Dockerize (Phases 11-15) — SHIPPED 2026-03-28</summary>

- [x] Phase 11: Foundation (3/3 plans) — completed 2026-03-23

- [x] Phase 12: Dockerfile + Docker Compose (2/2 plans) — completed 2026-03-26

- [x] Phase 13: Git-Clone Ingestion + Dual Mode (2/2 plans) — completed 2026-03-26

- [x] Phase 14: MCP HTTP Transport (2/2 plans) — completed 2026-03-28

- [x] Phase 15: CI & Distribution (2/2 plans) — completed 2026-03-28

Full details: `.planning/milestones/v3.2-ROADMAP.md`

</details>

### 🚧 v3.3 Kuzu Graph Intelligence (In Progress)

**Milestone Goal:** Replace DocuMind's SQLite-backed graph layer with Kuzu (embedded in-process graph DB), add graph algorithms (PageRank, centrality, cycle detection), integrate LangChain text-to-Cypher for natural language graph queries, and ship an interactive visualization dashboard.

- [x] **Phase 16: Kuzu Foundation** — Verify ESM import + Docker build; freeze schema; initialize Kuzu DB on daemon startup (completed 2026-04-08)

- [x] **Phase 17: Sync Bridge** — Migrate doc_relationships from SQLite → Kuzu; auto-sync after each rebuild; health reporting (completed 2026-04-12)

- [ ] **Phase 18: Query Layer** — Upgrade /graph REST API and get_related MCP tool to use Kuzu Cypher traversal

- [ ] **Phase 19: Graph Algorithms** — Add graph_rank, graph_cycles, graph_orphans MCP tools (PageRank, SCC, WCC)

- [ ] **Phase 20: Text-to-Cypher** — LangChain KuzuGraphAdapter; graph_query MCP tool for natural language → Cypher

- [ ] **Phase 21: Visualization Dashboard** — Vite React app in dashboard/ with interactive Cytoscape.js graph explorer

## Phase Details

### Phase 11: Foundation

**Goal**: Codebase is free of hardcoded macOS paths and all runtime behavior is configurable via environment variables
**Depends on**: Nothing (first v3.2 phase)
**Requirements**: FNDTN-01, FNDTN-02, FNDTN-03, FNDTN-04
**Success Criteria** (what must be TRUE):

1. Running `grep -r '/Users/Shared' daemon/ processors/ scripts/` returns no results except the single intentional fallback in `config/constants.mjs`

2. Starting the daemon with `DOCUMIND_REPOS_DIR=/some/path` causes all repo scans to resolve against that path

3. PORT, DB path, and cron schedules can each be changed via env var without touching source files

4. A `.env` file with documented defaults exists and the daemon loads it at startup

**Plans**: 3 plans

Plans:

- [x] 11-01-PLAN.md — Create centralized config/env.mjs + .env.example

- [x] 11-02-PLAN.md — Refactor daemon/processor modules to use config/env.mjs

- [x] 11-03-PLAN.md — Replace hardcoded paths in scripts/ + update CLAUDE.md

### Phase 12: Dockerfile + Docker Compose

**Goal**: `docker compose up` starts the DocuMind daemon with SQLite on a named volume; the image is production-quality (non-root, graceful shutdown, healthcheck)
**Depends on**: Phase 11
**Requirements**: DOCK-01, DOCK-02, DOCK-03, DOCK-04, DOCK-05, DOCK-06, DOCK-07
**Success Criteria** (what must be TRUE):

1. `docker compose up` starts the daemon and `/health` returns `200 OK` within 30 seconds

2. `docker stop` completes in under 5 seconds with exit code 0 (SQLite WAL closed cleanly)

3. Container restarts via `docker compose restart` do not lose indexed data (named volume persists)

4. `docker build` produces an image under 600MB and the build context is under 10MB

5. `docker run --rm <image> whoami` outputs a non-root user

**Plans**: 2 plans

Plans:

- [x] 12-01-PLAN.md — Add graceful shutdown, DB health probe, and chokidar polling support

- [x] 12-02-PLAN.md — Create Dockerfile, .dockerignore, docker-compose.yml and verify image

### Phase 13: Git-Clone Ingestion + Dual Mode

**Goal**: The container can ingest repositories either by scanning mounted directories (volume mode) or by cloning/pulling them at runtime (clone mode), selected via a single env var
**Depends on**: Phase 12
**Requirements**: INGEST-01, INGEST-02, INGEST-03, INGEST-04, INGEST-05
**Success Criteria** (what must be TRUE):

1. With `REPO_MODE=mount` and repos bind-mounted, the daemon scans and indexes documents from those directories

2. With `REPO_MODE=clone` and `DOCUMIND_REPOS` set, the container clones the configured repos on startup and the daemon indexes them

3. In clone mode, repos are re-pulled on the configured cron schedule without container restart

4. Git credentials are provided via env var at runtime and are not visible in `docker history --no-trunc` output

**Plans**: 2 plans

Plans:

- [x] 13-01-PLAN.md — Create ingestion module + REPO_MODE env var + wire into server and scheduler

- [x] 13-02-PLAN.md — Update Dockerfile (git + /app/repos), docker-compose.yml dual mode, .env.example

### Phase 14: MCP HTTP Transport

**Goal**: MCP tools are accessible over HTTP from remote consumers, protected by bearer auth, while stdio mode continues to work for local Claude Code
**Depends on**: Phase 12
**Requirements**: MCPT-01, MCPT-02, MCPT-03, MCPT-04
**Success Criteria** (what must be TRUE):

1. `POST /mcp` with a valid `Authorization: Bearer <token>` header executes MCP tools and returns results

2. `POST /mcp` with no token or wrong token returns `401 Unauthorized`

3. Local Claude Code with stdio MCP config continues to invoke all 14 tools without modification

4. MCP mode switches between stdio and http via env var; the other mode does not start

**Plans**: 2 plans

Plans:

- [x] 14-01-PLAN.md — Add MCP env vars + HTTP transport mode with bearer auth to mcp-server.mjs

- [x] 14-02-PLAN.md — Update /health endpoint, docker-compose.yml, .env.example, CLAUDE.md

### Phase 15: CI & Distribution

**Goal**: The DocuMind image is published to GHCR on every release, supports both amd64 and arm64, and is tagged with semantic version labels
**Depends on**: Phases 12, 13, 14
**Requirements**: CICD-01, CICD-02, CICD-03, CICD-04
**Success Criteria** (what must be TRUE):

1. Running the documented `docker build` + `docker push` commands manually publishes a working image to GHCR

2. Pushing a version tag (e.g., `v3.2.0`) to GitHub triggers the Actions workflow and a new image appears in GHCR

3. The published image runs on both Apple Silicon (arm64) and Linux CI runners (amd64)

4. The image is tagged with both the specific version (`v3.2.0`) and `latest`

**Plans**: 2 plans

Plans:

- [x] 15-01-PLAN.md — Dockerfile platform pin + GitHub Actions publish workflow

- [x] 15-02-PLAN.md — Manual GHCR publish documentation in DOCKER-USAGE.md

### Phase 16: Kuzu Foundation

**Goal**: Kuzu is verified to load in the DocuMind runtime (ESM import confirmed, Docker image builds clean), the graph schema is frozen with 8 typed edge tables, and the Kuzu DB initializes automatically on daemon startup
**Depends on**: Phase 15
**Requirements**: GRAPH-01, GRAPH-02, GRAPH-03
**Success Criteria** (what must be TRUE):

1. `import kuzu from 'kuzu'` succeeds in a Node.js ESM script without any dynamic require workarounds — verified in a throw-away smoke test before writing app code

2. `docker build` completes without error using the Debian bookworm base and the resulting image can execute a Kuzu DB open/close operation

3. `DOCUMIND_KUZU_DIR` env var redirects the Kuzu database directory; daemon startup log confirms the active path

4. Daemon startup log reports "Kuzu graph initialized" with the 8 typed edge tables confirmed present

**Plans**: 3 plans

Plans:

- [ ] 16-01-PLAN.md — Install kuzu@0.11.3, write smoke test, verify Docker build + runtime

- [ ] 16-02-PLAN.md — Add KUZU_DIR to config/env.mjs; create graph/kuzu-init.mjs with frozen 8-table schema

- [ ] 16-03-PLAN.md — Wire kuzu.Database into server.mjs startup, /health, and shutdown

### Phase 17: Sync Bridge

**Goal**: doc_relationships from SQLite are continuously mirrored into Kuzu after each relationship rebuild, with a manual rebuild command and health reporting that shows sync parity
**Depends on**: Phase 16
**Requirements**: SYNC-01, SYNC-02, SYNC-03
**Success Criteria** (what must be TRUE):

1. After the daily scan completes, the Kuzu edge count matches the SQLite doc_relationships row count with no manual intervention

2. Running `npm run graph:rebuild` drops and repopulates all Kuzu graph data from the current SQLite state and exits 0

3. `GET /health` response includes a `kuzu` block showing edge count and sync status (in-sync / drift detected)

4. A fresh daemon start with an empty Kuzu dir triggers automatic backfill from SQLite before serving requests

**Plans**: 3 plans

Plans:

- [ ] 17-01-PLAN.md — Create graph/kuzu-sync.mjs (syncToKuzu + rebuildKuzuGraph)

- [ ] 17-02-PLAN.md — Wire sync into orchestrator + scheduler + server.mjs (backfill + health)

- [ ] 17-03-PLAN.md — Standalone graph:rebuild script + package.json entry

### Phase 18: Query Layer

**Goal**: All graph traversal queries use Kuzu as the backend; /graph REST API gains directional traversal support and get_related MCP tool gains reverse traversal while keeping its existing response contract
**Depends on**: Phase 17
**Requirements**: QUERY-01, QUERY-02
**Success Criteria** (what must be TRUE):

1. `GET /graph?docId=42&direction=reverse` returns documents that point TO document 42 (not supported by the SQLite backend)

2. `GET /graph?docId=42&direction=both` returns the union of forward and reverse relationships in a single response

3. Calling `get_related` from an MCP client returns the same document IDs as before migration (backward-compatible response contract)

4. Removing a document from SQLite and triggering a sync causes that document to disappear from subsequent Kuzu graph queries

**Plans**: 3 plans

Plans:

- [ ] 18-01-PLAN.md — Create graph/kuzu-queries.mjs + validate label(r[0]) smoke test

- [ ] 18-02-PLAN.md — Wire kuzuTraverseGraph into /graph REST handler (direction param)

- [ ] 18-03-PLAN.md — Wire kuzuFindRelated into get_related MCP tool (direction param)

### Phase 19: Graph Algorithms

**Goal**: Three new MCP tools expose Kuzu's built-in graph algorithms — PageRank-ranked documents, circular dependency chains, and isolated document clusters — callable from any MCP client
**Depends on**: Phase 17
**Requirements**: ALGO-01, ALGO-02, ALGO-03
**Success Criteria** (what must be TRUE):

1. Calling `graph_rank` returns a list of documents sorted by PageRank score; documents with more incoming relationships score higher than isolated ones

2. Calling `graph_cycles` returns at least one result when a known circular dependency exists in the graph (verified by seeding test data)

3. Calling `graph_orphans` returns documents that have no incoming or outgoing relationships — confirmed correct against a document known to be unlinked

4. All three tools are registered in the MCP server tool manifest and appear in `list_tools` response

**Plans**: TBD

### Phase 20: Text-to-Cypher

**Goal**: A custom KuzuGraphAdapter wires LangChain's text-to-Cypher chain to DocuMind's Kuzu instance; the graph_query MCP tool accepts natural language, generates safe read-only Cypher, executes it, and returns structured results — degrading gracefully when no LLM key is configured
**Depends on**: Phase 17
**Requirements**: CYPHER-01, CYPHER-02, CYPHER-03, CYPHER-04
**Success Criteria** (what must be TRUE):

1. Calling `graph_query` with "which documents depend on ARCHITECTURE.md?" returns a populated result set drawn from live Kuzu data

2. Setting `DOCUMIND_LLM_PROVIDER=anthropic` uses Claude (claude-sonnet-4-6); the env var is the only change needed to switch providers

3. A generated Cypher containing `DELETE`, `MERGE`, or `DROP` is rejected before execution and returns a sanitization error — the Kuzu DB is not modified

4. Calling `graph_query` with no API key configured returns a structured error message ("LLM provider not configured") rather than an uncaught exception

**Plans**: TBD

### Phase 21: Visualization Dashboard

**Goal**: A Vite React app in dashboard/ serves an interactive Cytoscape.js document graph explorer at /graph.html, with repo/type/depth filters, Kuzu Explorer available as an optional PM2 service, and a graph export endpoint for external tools
**Depends on**: Phase 18, Phase 19
**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05
**Success Criteria** (what must be TRUE):

1. `npm run dashboard:build` produces static files in `dashboard/dist/` that Express serves at `/`; opening the app in a browser shows the graph explorer without a build server running

2. The graph page renders document nodes and relationship edges from live Kuzu data; clicking a node shows its title, repo, and relationship count using @design-dvw/ui Card and Badge components

3. Applying a repo filter removes nodes from other repos from the canvas without a page reload; depth slider changes traversal depth and updates the graph

4. Running `pm2 start ecosystem.config.cjs --only documind-kuzu-explorer` starts Kuzu Explorer on its configured port; `pm2 stop` stops it without affecting the main daemon

5. `GET /graph/export` returns a JSON payload containing all nodes and edges in a format consumable by external tools (Cytoscape.js, Gephi, D3)

**Plans**: TBD

## Progress

| Phase                                | Milestone | Plans Complete | Status      | Completed  |

| ------------------------------------ | --------- | -------------- | ----------- | ---------- |

| 1. Schema Migration Foundation       | v3.0      | 3/3            | Complete    | 2026-03-17 |

| 2. Context Profile Loader            | v3.0      | 2/2            | Complete    | 2026-03-17 |

| 3. Orchestrator and Scheduler Wiring | v3.0      | 4/4            | Complete    | 2026-03-17 |

| 4. MCP Server — Read Tools           | v3.0      | 2/2            | Complete    | 2026-03-17 |

| 5. MCP Server — Write Tools          | v3.0      | 3/3            | Complete    | 2026-03-22 |

| 6. MCP Intelligence Tools            | v3.1      | 1/1            | Complete    | 2026-03-22 |

| 7. Diagram Registry Completion       | v3.1      | 1/1            | Complete    | 2026-03-22 |

| 8. Slash Command Updates             | v3.1      | 2/2            | Complete    | 2026-03-22 |

| 9. Markdown Tooling Propagation      | v3.1      | 1/1            | Complete    | 2026-03-22 |

| 10. Documentation Fixes              | v3.1      | 2/2            | Complete    | 2026-03-22 |

| 11. Foundation                       | v3.2      | 3/3            | Complete    | 2026-03-23 |

| 12. Dockerfile + Docker Compose      | v3.2      | 2/2            | Complete    | 2026-03-26 |

| 13. Git-Clone Ingestion + Dual Mode  | v3.2      | 2/2            | Complete    | 2026-03-26 |

| 14. MCP HTTP Transport               | v3.2      | 2/2            | Complete    | 2026-03-28 |

| 15. CI & Distribution                | v3.2      | 2/2            | Complete    | 2026-03-28 |

| 16. Kuzu Foundation                  | 3/3 | Complete    | 2026-04-08 | -          |

| 17. Sync Bridge                      | 3/3 | Complete    | 2026-04-12 | -          |

| 18. Query Layer                      | 1/3 | In Progress|  | -          |

| 19. Graph Algorithms                 | v3.3      | 0/TBD          | Not started | -          |

| 20. Text-to-Cypher                   | v3.3      | 0/TBD          | Not started | -          |

| 21. Visualization Dashboard          | v3.3      | 0/TBD          | Not started | -          |
