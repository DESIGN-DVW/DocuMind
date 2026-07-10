# Roadmap: DocuMind

## Milestones

- ✅ **v3.0 Documentation Intelligence Platform** — Phases 1-5 (shipped 2026-03-22)

- ✅ **v3.1 Polish & Propagation** — Phases 6-10 (shipped 2026-03-23)

- ✅ **v3.2 Dockerize** — Phases 11-15 (shipped 2026-03-28)

- ✅ **v3.3 Kuzu Graph Intelligence** — Phases 16-18, 22 (shipped 2026-04-20; phases 19-21 cancelled — Graphify covers graph algorithms/text-to-Cypher/visualization natively)

- 🚧 **v3.4 Presentation Pipeline** — Phases 23-29 (in progress)

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

<details>
<summary>✅ v3.3 Kuzu Graph Intelligence (Phases 16-18, 22) — SHIPPED 2026-04-20</summary>

**Milestone Goal:** Replace DocuMind's SQLite-backed graph layer with Kuzu (embedded in-process graph DB), add graph algorithms (PageRank, centrality, cycle detection), integrate LangChain text-to-Cypher for natural language graph queries, and ship an interactive visualization dashboard.

- [x] Phase 16: Kuzu Foundation (3/3 plans) — completed 2026-04-08

- [x] Phase 17: Sync Bridge (3/3 plans) — completed 2026-04-12

- [x] Phase 18: Query Layer (3/3 plans) — completed 2026-04-13

- [x] Phase 22: Obsolete Docs Dashboard (3/3 plans) — completed 2026-04-20

- [ ] ~~Phase 19: Graph Algorithms~~ — CANCELLED — Graphify covers graph algorithms natively

- [ ] ~~Phase 20: Text-to-Cypher~~ — CANCELLED — Graphify covers natural-language graph queries natively

- [ ] ~~Phase 21: Visualization Dashboard~~ — CANCELLED — Graphify covers graph visualization natively

Kuzu itself was later retired per ADR-001 (2026-07) — SQLite recursive CTEs replaced it for graph traversal.

Full requirements record: `.planning/milestones/v3.3-REQUIREMENTS.md`

</details>

### 🚧 v3.4 Presentation Pipeline (In Progress)

**Milestone Goal:** Automated slides publishing pipeline — EN Marp decks as single source of truth, DeepL French translation, HTML/PDF/PPTX rendering, FTP deploy, and Figma Slides push, orchestrated by the DocuMind daemon with agent-driven content updates.

- [ ] **Phase 23: Foundation & Hygiene** — Ledger migration, env var scaffolding, gitignore/dockerignore hygiene for the pipeline

- [ ] **Phase 24: Render Stage** — EN deck → HTML/PDF/PPTX via marp-cli, proven under the PM2 daemon environment

- [ ] **Phase 25: Translation Stage** — EN → FR via DeepL with placeholder-protected Marp syntax/tables and a lint gate

- [ ] **Phase 26: Ledger Wiring** — Every render/translate run recorded and queryable before the watcher goes live

- [ ] **Phase 27: Watcher Integration & Loop Protection** — Saving an EN deck auto-triggers the pipeline exactly once, loop-free

- [ ] **Phase 28: Deploy Stage** — FTP publish with dry-run default and atomic stage-then-rename

- [ ] **Phase 29: Ecosystem Surface & Notification** — REST/MCP triggers, AgentHub discovery, drift cron, Figma Slides runbook

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

### Phase 19: Graph Algorithms — CANCELLED

**Status**: Cancelled 2026-04-20 — Graphify covers graph algorithms natively; not rebuilt on Kuzu
**Goal (as originally scoped)**: Three new MCP tools expose Kuzu's built-in graph algorithms — PageRank-ranked documents, circular dependency chains, and isolated document clusters — callable from any MCP client
**Requirements**: ALGO-01, ALGO-02, ALGO-03 (moved to Out of Scope in PROJECT.md)
**Plans**: Cancelled — none written

### Phase 20: Text-to-Cypher — CANCELLED

**Status**: Cancelled 2026-04-20 — Graphify covers natural-language graph queries natively
**Goal (as originally scoped)**: A custom KuzuGraphAdapter wires LangChain's text-to-Cypher chain to DocuMind's Kuzu instance; the graph_query MCP tool accepts natural language, generates safe read-only Cypher, executes it, and returns structured results — degrading gracefully when no LLM key is configured
**Requirements**: CYPHER-01, CYPHER-02, CYPHER-03, CYPHER-04 (moved to Out of Scope in PROJECT.md)
**Plans**: Cancelled — none written

### Phase 21: Visualization Dashboard — CANCELLED

**Status**: Cancelled 2026-04-20 — Graphify covers graph visualization natively
**Goal (as originally scoped)**: A Vite React app in dashboard/ serves an interactive Cytoscape.js document graph explorer at /graph.html, with repo/type/depth filters, Kuzu Explorer available as an optional PM2 service, and a graph export endpoint for external tools
**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05 (moved to Out of Scope in PROJECT.md)
**Plans**: Cancelled — none written

### Phase 22: Obsolete Docs Dashboard

**Goal**: A dashboard page at `/dashboard/obsolete.html` surfaces documents flagged as obsolete, redundant, stale, or needing archival — with confidence scores, flag labels, batch-select checkboxes, and action buttons (Archive, Delete, Mark Updated, Dismiss). A scheduled detection pass populates an `obsolescence_signals` table using heuristics: document age, zero inbound graph links, semantic similarity to other docs, and keyword patterns ("deprecated", "archive", "old", "TODO: delete").
**Depends on**: Phase 17 (Kuzu sync for inbound-link signal), Phase 3 (similarity scores)
**Requirements**: OBS-01, OBS-02, OBS-03, OBS-04, OBS-05
**Success Criteria** (what must be TRUE):

1. Opening `/dashboard/obsolete.html` shows a filterable, sortable table of documents with confidence score, flag label (obsolete / redundant / stale / needs-update), and age since last modification

2. Selecting multiple rows with checkboxes and clicking "Archive Selected" moves the action payload to a dismissal queue — no document is deleted without explicit user confirmation

3. Clicking "Dismiss" on a row removes it from the dashboard for 30 days (suppression stored in DB); the document is not modified

4. The daily cron pass runs the detection heuristics and upserts rows into `obsolescence_signals`; confidence scores update when the underlying document changes

5. A document with zero inbound Kuzu edges, last modified >180 days ago, and a title containing "old" / "archive" / "deprecated" receives a confidence score ≥ 0.8 and flag "obsolete"

**Plans**: 3 plans

Plans:

- [ ] 22-01-PLAN.md — DB migration (obsolescence_signals) + detection module (processors/obsolescence-detector.mjs)

- [ ] 22-02-PLAN.md — REST endpoints (GET /obsolete, POST /obsolete/:id/dismiss, POST /obsolete/batch-dismiss) + scheduler wiring

- [ ] 22-03-PLAN.md — Plain-HTML dashboard (dashboard/obsolete.html) with sortable table, batch-select, and dismiss actions

### Phase 23: Foundation & Hygiene

**Goal**: Pipeline infrastructure — the ledger table, env var scaffolding, and git/Docker hygiene — is in place before any translate/render/deploy code is written
**Depends on**: Nothing (first v3.4 phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03
**Success Criteria** (what must be TRUE):

1. Rendered slide files (HTML/PDF/PPTX) are absent from `git ls-files` after `git rm --cached`, yet remain present on disk locally (no history rewrite)

2. `.env.example` documents `DEEPL_API_KEY`, `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD`, `FTP_REMOTE_PATH`, and `SOFFICE_PATH` with placeholder values — no real secrets committed

3. Running the versioned migration creates the `slide_pipeline_runs` table and `latest_slide_runs` view, queryable via the sqlite3 CLI

4. `.dockerignore` excludes `.env`; building the image and inspecting its layers confirms no secret values are baked in

**Plans**: 3 plans

Plans:

- [ ] 23-01-PLAN.md — Git hygiene: untrack 6 rendered slide exports (`git rm --cached`) + path-scoped gitignore rules for `docs/slides/**/*.{html,pdf,pptx}`

- [ ] 23-02-PLAN.md — Env scaffolding: `.env.example` PRESENTATION PIPELINE section, `config/env.mjs` exports for all 6 vars, CLAUDE.md env table + Docker secret-baking verification

- [ ] 23-03-PLAN.md — Ledger: migration 009 (`slide_pipeline_runs` table + indexes + `latest_slide_runs` view) applied via `npm run db:migrate`

### Phase 24: Render Stage

**Goal**: Any EN Marp deck can be rendered to HTML, PDF, and PPTX in one command, reliably, including when invoked server-side under the PM2 daemon environment
**Depends on**: Phase 23
**Requirements**: RNDR-01, RNDR-02, RNDR-03
**Success Criteria** (what must be TRUE):

1. Running `npm run slides:build` against a fixture deck produces HTML, PDF, and PPTX output files from a single command

2. When `SOFFICE_PATH` resolves, the produced PPTX is natively editable (real slide objects, not a rasterized image); when it doesn't resolve, the build logs an explicit warning rather than silently falling back to an image-only PPTX

3. Restarting the daemon via `pm2 restart documind` and invoking the render function server-side succeeds — Chrome/soffice binary resolution is verified under PM2's environment, not just an interactive shell

4. The marp-cli multi-format invocation pattern (one config-driven call vs. three per-format calls) is resolved via a short spike and the chosen pattern is documented before Phase 25 begins

**Plans**: TBD

**Research flag**: MEDIUM confidence on whether `.marprc.yml`'s per-format config produces multiple outputs from one invocation, or whether marp-cli requires one call per format — spike required (see research/SUMMARY.md).

### Phase 25: Translation Stage

**Goal**: An EN deck can be translated to French via DeepL without corrupting Marp syntax, code, tables, or brand terms, and the generated deck passes the project's own lint rules
**Depends on**: Phase 24
**Requirements**: TRNS-01, TRNS-02, TRNS-03, TRNS-04, TRNS-05, TRNS-06
**Success Criteria** (what must be TRUE):

1. Translating a fixture EN deck produces a `.fr.md` sibling with prose rendered in French while front-matter, Marp directive comments, code fences, inline code, and URLs remain byte-identical to the EN source

2. GFM tables in the generated `.fr.md` pass `markdownlint-cli2` (DVW001/DVW002) with zero violations before the run is considered successful — a violation fails the run rather than being auto-fixed and continued

3. Glossary-pinned terms (DVWDesign, Figma, Marp, MCP, DocuMind, FigJam) appear untranslated in the `.fr.md` output; front-matter and footer strings are never sent to the DeepL API

4. Re-running translation on an unchanged EN deck makes zero DeepL API calls — content-hash comparison short-circuits the call

5. The generated `.fr.md` carries a header comment warning that it is generated and manual edits will be overwritten (corrections go to the glossary instead), and the file is tracked in git

**Plans**: TBD

**Research flag**: This is the single highest-risk stage in the milestone (DeepL has no native Markdown/Marp awareness) — placeholder-protection and round-trip validation must be correct before render/watcher trust this stage's output.

### Phase 26: Ledger Wiring

**Goal**: Every render and translate execution is recorded as a queryable pipeline run, independent of and prior to the watcher going live
**Depends on**: Phase 24, Phase 25
**Requirements**: PIPE-04
**Success Criteria** (what must be TRUE):

1. Manually invoking the CLI publish script for a deck writes a row to `slide_pipeline_runs` with per-stage (translate/render) status and duration

2. Querying `latest_slide_runs` returns the most recent run per deck with an overall success/failure state

3. A deliberately failing translate stage (e.g. invalid API key) still produces a ledger row showing the translate stage as failed with a captured error message, not a silent crash or missing row

**Plans**: TBD

### Phase 27: Watcher Integration & Loop Protection

**Goal**: Saving an EN deck automatically triggers the full pipeline exactly once, with no feedback loops or overlapping runs, and dispatch-driven content edits flow through the same trigger path as manual edits
**Depends on**: Phase 26
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-05
**Success Criteria** (what must be TRUE):

1. Editing and saving a fixture EN deck under `docs/slides/` automatically triggers translate → render → deploy with no manual command

2. After a pipeline run completes, the generated `.fr.md`/HTML/PDF/PPTX writes do not themselves trigger a new pipeline run — confirmed by daemon logs showing exactly one run per source edit

3. Saving the same deck three times within a couple of seconds coalesces into exactly one pipeline run, not three, via a per-deck run lock

4. A file write applied via a RootDispatcher dispatch to an EN deck triggers the same watcher path as a manual edit, confirmed by a resulting ledger entry

**Plans**: TBD

**Research flag**: Loop-protection strategy is pre-resolved by research (glob exclusion is primary; a dedicated per-deck run-lock — not the existing `writingNow` registry lock — handles overlap; content-hash is defense-in-depth). Do not re-litigate; implement as specified in research/SUMMARY.md.

### Phase 28: Deploy Stage

**Goal**: Rendered HTML deploys to the web host safely, defaulting to dry-run until FTP credentials and protocol are confirmed
**Depends on**: Phase 27
**Requirements**: DPLY-01, DPLY-02, DPLY-03
**Success Criteria** (what must be TRUE):

1. With FTP credentials configured, the deploy stage uploads EN + FR HTML to a staging path then atomically renames into the live path — no partial/half-published state is ever observable

2. With FTP credentials absent from `.env`, the deploy stage logs its intended upload actions and uploads nothing — dry-run is the default, not an opt-in flag

3. Every deploy produces a manifest listing uploaded files with content hashes and timestamps, queryable after the run

4. The FTP vs. FTPS vs. SFTP protocol is confirmed in writing with the hosting provider before dry-run is switched off for the first live deploy

**Plans**: TBD

**Research flag**: Deploy protocol (FTP/FTPS/SFTP) is an unconfirmed external dependency, not a documentation gap — treat as a phase blocker for the "dry-run off" milestone, not a research task to resolve internally.

### Phase 29: Ecosystem Surface & Notification

**Goal**: The pipeline is triggerable and observable from outside the daemon process — REST, MCP, AgentHub — and the Figma Slides path is documented for manual agent use
**Depends on**: Phase 28
**Requirements**: SURF-01, SURF-02, SURF-03, SURF-04, FIGS-01
**Success Criteria** (what must be TRUE):

1. `POST /slides/build` with a deck name triggers that deck's pipeline; called with no body triggers all decks

2. Calling the `build_slides` MCP tool from Claude Code triggers the same pipeline and returns run status

3. A successful deploy publishes a discovery to AgentHub (`POST /api/discoveries` on port 3004), non-fatal on failure; the entry is visible via AgentHub's feed

4. The weekly drift-check cron compares deployed file hashes against current source hashes and logs any mismatch found

5. A documented runbook describes the manual steps to push a rendered deck to Figma Slides via `use_figma`

**Plans**: TBD

**Research flag**: LOW confidence on the `figma-use-slides` skill's actual input contract (rendered HTML vs. raw markdown vs. structured JSON) — stays a documented runbook, not a coded integration, until Figma MCP auth unblocks and the contract is verified.

## Progress

| Phase                                       | Milestone | Plans Complete | Status      | Completed  |
| -------------------------------------------- | --------- | --------------- | ----------- | ---------- |
| 1. Schema Migration Foundation               | v3.0      | 3/3             | Complete    | 2026-03-17 |
| 2. Context Profile Loader                    | v3.0      | 2/2             | Complete    | 2026-03-17 |
| 3. Orchestrator and Scheduler Wiring         | v3.0      | 4/4             | Complete    | 2026-03-17 |
| 4. MCP Server — Read Tools                   | v3.0      | 2/2             | Complete    | 2026-03-17 |
| 5. MCP Server — Write Tools                  | v3.0      | 3/3             | Complete    | 2026-03-22 |
| 6. MCP Intelligence Tools                    | v3.1      | 1/1             | Complete    | 2026-03-22 |
| 7. Diagram Registry Completion               | v3.1      | 1/1             | Complete    | 2026-03-22 |
| 8. Slash Command Updates                     | v3.1      | 2/2             | Complete    | 2026-03-22 |
| 9. Markdown Tooling Propagation              | v3.1      | 1/1             | Complete    | 2026-03-22 |
| 10. Documentation Fixes                      | v3.1      | 2/2             | Complete    | 2026-03-22 |
| 11. Foundation                               | v3.2      | 3/3             | Complete    | 2026-03-23 |
| 12. Dockerfile + Docker Compose              | v3.2      | 2/2             | Complete    | 2026-03-26 |
| 13. Git-Clone Ingestion + Dual Mode          | v3.2      | 2/2             | Complete    | 2026-03-26 |
| 14. MCP HTTP Transport                       | v3.2      | 2/2             | Complete    | 2026-03-28 |
| 15. CI & Distribution                        | v3.2      | 2/2             | Complete    | 2026-03-28 |
| 16. Kuzu Foundation                          | v3.3      | 3/3             | Complete    | 2026-04-08 |
| 17. Sync Bridge                              | v3.3      | 3/3             | Complete    | 2026-04-12 |
| 18. Query Layer                              | v3.3      | 3/3             | Complete    | 2026-04-13 |
| 19. Graph Algorithms                         | v3.3      | N/A             | Cancelled   | -          |
| 20. Text-to-Cypher                           | v3.3      | N/A             | Cancelled   | -          |
| 21. Visualization Dashboard                  | v3.3      | N/A             | Cancelled   | -          |
| 22. Obsolete Docs Dashboard                  | v3.3      | 3/3             | Complete    | 2026-04-20 |
| 23. Foundation & Hygiene                     | v3.4      | 0/TBD           | Not started | -          |
| 24. Render Stage                             | v3.4      | 0/TBD           | Not started | -          |
| 25. Translation Stage                        | v3.4      | 0/TBD           | Not started | -          |
| 26. Ledger Wiring                            | v3.4      | 0/TBD           | Not started | -          |
| 27. Watcher Integration & Loop Protection    | v3.4      | 0/TBD           | Not started | -          |
| 28. Deploy Stage                             | v3.4      | 0/TBD           | Not started | -          |
| 29. Ecosystem Surface & Notification         | v3.4      | 0/TBD           | Not started | -          |
