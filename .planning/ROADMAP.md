# Roadmap: DocuMind

## Milestones

- ✅ **v3.0 Documentation Intelligence Platform** — Phases 1-5 (shipped 2026-03-22)

- ✅ **v3.1 Polish & Propagation** — Phases 6-10 (shipped 2026-03-23)

- 🚧 **v3.2 Dockerize** — Phases 11-15 (in progress)

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

### 🚧 v3.2 Dockerize (In Progress)

**Milestone Goal:** Containerize DocuMind as a CI-ready, published image that runs anywhere — with both volume-mount and git-clone repo access, and MCP available via stdio or HTTP.

- [x] **Phase 11: Foundation** — Eliminate all hardcoded macOS paths; externalize configuration to env vars (completed 2026-03-23)

- [x] **Phase 12: Dockerfile + Docker Compose** — Multi-stage Docker image with production hygiene; `docker compose up` starts daemon (completed 2026-03-26)

- [x] **Phase 13: Git-Clone Ingestion + Dual Mode** — Container can fetch repos itself; REPO_MODE switches between mount and clone (completed 2026-03-26)

- [x] **Phase 14: MCP HTTP Transport** — MCP tools accessible over HTTP with bearer auth for remote consumers (completed 2026-03-28)

- [x] **Phase 15: CI & Distribution** — Multi-arch image published to GHCR via GitHub Actions (completed 2026-03-28)

## Phase Details

### Phase 11: Foundation

**Goal**: Codebase is free of hardcoded macOS paths and all runtime behavior is configurable via environment variables
**Depends on**: Nothing (first v3.2 phase)
**Requirements**: FNDTN-01, FNDTN-02, FNDTN-03, FNDTN-04
**Success Criteria** (what must be TRUE):

1. Running `grep -r '/Users/Shared' daemon/ processors/ scripts/` returns no results (one permitted fallback in `config/constants.mjs`)

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

4. `docker build` produces an image under 600MB (better-sqlite3 requires Debian base) and the build context is under 10MB

5. `docker run --rm <image> whoami` outputs a non-root user

**Plans**: 2 plans

Plans:

- [ ] 12-01-PLAN.md — Add graceful shutdown, DB health probe, and chokidar polling support

- [ ] 12-02-PLAN.md — Create Dockerfile, .dockerignore, docker-compose.yml and verify image

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

- [ ] 13-01-PLAN.md — Create ingestion module + REPO_MODE env var + wire into server and scheduler

- [ ] 13-02-PLAN.md — Update Dockerfile (git + /app/repos), docker-compose.yml dual mode, .env.example

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

- [ ] 14-01-PLAN.md — Add MCP env vars + HTTP transport mode with bearer auth to mcp-server.mjs

- [ ] 14-02-PLAN.md — Update /health endpoint, docker-compose.yml, .env.example, CLAUDE.md

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

- [ ] 15-01-PLAN.md — Dockerfile platform pin + GitHub Actions publish workflow

- [ ] 15-02-PLAN.md — Manual GHCR publish documentation in DOCKER-USAGE.md

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

| 12. Dockerfile + Docker Compose      | 2/2 | Complete    | 2026-03-26 | -          |

| 13. Git-Clone Ingestion + Dual Mode  | 2/2 | Complete    | 2026-03-26 | -          |

| 14. MCP HTTP Transport               | 2/2 | Complete   | 2026-03-28 | -          |

| 15. CI & Distribution                | 2/2 | Complete    | 2026-03-28 | -          |
