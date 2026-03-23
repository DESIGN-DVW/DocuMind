# Requirements: DocuMind v3.2 Dockerize

**Defined:** 2026-03-23
**Core Value:** When you look at a document, you instantly see what it's connected to — what links to it, what duplicates it, and whether it's stale.

## v3.2 Requirements

Requirements for Docker containerization milestone. Each maps to roadmap phases.

### Foundation

- [x] **FNDTN-01**: All hardcoded macOS paths replaced with configurable env vars
- [x] **FNDTN-02**: Repository paths resolved from DOCUMIND_REPOS_DIR env var
- [x] **FNDTN-03**: Port, DB path, and cron schedules configurable via env vars
- [x] **FNDTN-04**: .env file with documented defaults for local development

### Docker Image

- [ ] **DOCK-01**: Multi-stage Dockerfile using node:22-bookworm-slim base
- [ ] **DOCK-02**: .dockerignore excludes node_modules, .git, data/, .planning/
- [ ] **DOCK-03**: Container runs as non-root user
- [ ] **DOCK-04**: SIGTERM/SIGINT triggers graceful shutdown (close DB, drain requests)
- [ ] **DOCK-05**: /health endpoint returns container status for Docker HEALTHCHECK
- [ ] **DOCK-06**: Named volume for SQLite DB persists across container restarts
- [ ] **DOCK-07**: docker-compose.yml starts daemon with volume-mount mode

### Ingestion

- [ ] **INGEST-01**: Volume mount mode scans mounted repo directories
- [ ] **INGEST-02**: Git-clone mode clones configured repos on container start
- [ ] **INGEST-03**: Git-clone mode pulls repos on cron schedule
- [ ] **INGEST-04**: REPO_MODE env var switches between mount and clone modes
- [ ] **INGEST-05**: Git credentials accepted via env vars (not baked into image)

### MCP Transport

- [ ] **MCPT-01**: MCP HTTP endpoint on POST /mcp using StreamableHTTPServerTransport
- [ ] **MCPT-02**: Bearer token auth protects MCP HTTP endpoint
- [ ] **MCPT-03**: MCP stdio mode continues to work for local Claude Code
- [ ] **MCPT-04**: MCP mode (stdio/http) selectable via env var

### CI & Distribution

- [ ] **CICD-01**: Documentation for manual docker build and push to GHCR
- [ ] **CICD-02**: GitHub Actions workflow builds and pushes image on release
- [ ] **CICD-03**: Multi-arch image supports amd64 and arm64
- [ ] **CICD-04**: Image tagged with version and latest

## Future Requirements

### SaaS Layer

- **SAAS-01**: Multi-tenant auth (OAuth / API keys)
- **SAAS-02**: Per-tenant SQLite databases (Turso)
- **SAAS-03**: Usage metering and billing integration

### Rule Packs

- **RULE-01**: Pluggable rule pack system for domain-specific linting
- **RULE-02**: Rule pack marketplace / registry

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Kubernetes deployment | Docker Compose sufficient for v3.2; K8s is SaaS-tier complexity |
| OAuth / multi-tenant auth | Single-user; bearer token sufficient for v3.2 |
| Semantic/embedding search | FTS5 + TF-IDF sufficient for current scale |
| Docker Swarm / orchestration | Not needed until multi-instance scaling |
| SSE MCP transport | Deprecated by MCP spec 2025-03-26; use Streamable HTTP only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
| ----------- | ----- | ------ |
| FNDTN-01 | Phase 11 | Complete |
| FNDTN-02 | Phase 11 | Complete |
| FNDTN-03 | Phase 11 | Complete |
| FNDTN-04 | Phase 11 | Complete |
| DOCK-01 | Phase 12 | Pending |
| DOCK-02 | Phase 12 | Pending |
| DOCK-03 | Phase 12 | Pending |
| DOCK-04 | Phase 12 | Pending |
| DOCK-05 | Phase 12 | Pending |
| DOCK-06 | Phase 12 | Pending |
| DOCK-07 | Phase 12 | Pending |
| INGEST-01 | Phase 13 | Pending |
| INGEST-02 | Phase 13 | Pending |
| INGEST-03 | Phase 13 | Pending |
| INGEST-04 | Phase 13 | Pending |
| INGEST-05 | Phase 13 | Pending |
| MCPT-01 | Phase 14 | Pending |
| MCPT-02 | Phase 14 | Pending |
| MCPT-03 | Phase 14 | Pending |
| MCPT-04 | Phase 14 | Pending |
| CICD-01 | Phase 15 | Pending |
| CICD-02 | Phase 15 | Pending |
| CICD-03 | Phase 15 | Pending |
| CICD-04 | Phase 15 | Pending |

**Coverage:**

- v3.2 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---

*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after initial definition*
