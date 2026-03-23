# Project Research Summary

**Project:** DocuMind v3.2 — Docker Containerization + MCP HTTP Transport + GHCR Publishing
**Domain:** Node.js documentation intelligence daemon — containerization and remote deployment
**Researched:** 2026-03-23
**Confidence:** HIGH

## Executive Summary

DocuMind v3.2 is a containerization milestone for an existing, fully operational Node.js documentation daemon. The system (v3.1) already ships REST API on port 9000, MCP stdio server with 14 tools, SQLite FTS5 with graph/keywords/diagrams, PM2 daemon, cron scheduler, and context profiles. v3.2 wraps this in Docker for portability — CI pipelines, remote Linux servers, and other developers' machines — while keeping the local macOS PM2 workflow intact. The recommended approach is a Debian-based multi-stage build (`node:22-bookworm-slim`), direct `node` process execution as PID 1, named volumes for SQLite persistence, dual repo-access modes (volume-mount for local dev, git-clone for CI), and MCP over Streamable HTTP (`POST /mcp`) for remote tool access. All of this publishes via GitHub Actions to GHCR with multi-arch support (linux/amd64 + linux/arm64).

The most important technical decision — and the one most likely to waste a day if wrong — is base image selection. `better-sqlite3` is a native C++ addon with glibc-linked prebuilt binaries. Alpine Linux uses musl libc, which is fundamentally incompatible at runtime. This is not a configuration issue; it is a known architectural incompatibility with no workaround that does not introduce significant complexity. Node 24 has an equivalent blocking issue: prebuilt binaries for N-API 137 do not yet exist and compilation from source fails with deprecated V8 API errors. Use `node:22-bookworm-slim` unconditionally.

The second critical risk is existing macOS-specific absolute paths hardcoded in at least 10 files across the codebase. These paths (`/Users/Shared/htdocs/github/DVWDesign/...`) do not exist inside a Linux container. Direct codebase inspection confirms `config/constants.mjs` line 42, `processors/tree-processor.mjs` line 12, and `scripts/scan/enhanced-scanner.mjs` lines 22-31 all contain hardcoded absolute paths that bypass the context profile. This path audit must happen before any Dockerfile is written — it is a pre-Docker refactor requirement. Beyond these two risks, the remaining work is well-understood container plumbing with clear patterns from official sources.

## Key Findings

### Recommended Stack

The existing runtime stack (Node 22+, Express 5, better-sqlite3 12.6.2, MCP SDK 1.27.1, zod 3.25.0) requires no version changes for v3.2. Three net-new packages are added: `simple-git` for git-clone ingestion (7.9M weekly downloads, wraps native git CLI for faster large-repo operations), `dotenv` for environment-variable loading that naturally defers to Docker-injected env vars, and `@godaddy/terminus` for graceful shutdown (15-line integration vs. 80 lines of error-prone manual SIGTERM wiring, critical for protecting SQLite WAL on shutdown).

The MCP SDK already ships `StreamableHTTPServerTransport` at `dist/esm/server/streamableHttp.js` — confirmed present in installed node_modules. The SSE transport (`/sse` + `/messages`) is deprecated in MCP spec 2025-03-26; only Streamable HTTP (`POST /mcp`, single endpoint) should be implemented in new code.

**Core technologies:**

- `node:22-bookworm-slim` base image — glibc compatibility for better-sqlite3 prebuilt binaries; Node 22 is Active LTS through 2027; do not use Alpine (musl libc) or Node 24 (missing N-API 137 prebuilts)
- `simple-git@^3.33.0` — git clone/pull at container runtime; requires git CLI in the runtime image layer; never copy or bake at build time
- `dotenv@^16.4.7` — env-var loading; Docker `environment:` and `env_file:` overrides take precedence naturally without configuration
- `@godaddy/terminus@^4.12.1` — graceful shutdown via `createTerminus(server, { healthChecks, onSignal })`; closes SQLite connection and chokidar watcher before exit
- `StreamableHTTPServerTransport` (in existing MCP SDK 1.27.1) — remote MCP access on `POST /mcp`; no new package required
- `docker/build-push-action@v6` + `docker/metadata-action@v5` — GHCR publishing with semver tags and multi-arch (amd64 + arm64) via buildx

### Expected Features

**Must have (table stakes) — v3.2 launch:**

- Non-root user in container (`USER node`, chown `/app/data`) — GHCR and Kubernetes block root-run images; one Dockerfile line
- Graceful shutdown SIGTERM handler — Docker stop sends SIGTERM; unhandled leads to force-kill and SQLite WAL corruption
- `HEALTHCHECK` instruction in Dockerfile pointing to existing `/health` endpoint — compose and CI service containers wait for healthy before routing traffic
- `.dockerignore` excluding `node_modules/`, `.git/`, `data/`, `.env*`, `markdown.bbprojectd/` — excludes 100MB+ from build context and prevents credential leaks
- Named volume for SQLite (`documind-data:/app/data`) — data must not be destroyed on container restart; bind-mounting from macOS host corrupts WAL mode on Docker Desktop
- Environment variable configuration (`REPO_MODE`, `PORT`, `MCP_AUTH_TOKEN`, `SCAN_INTERVAL`, `FULL_SCAN_CRON`, `CHOKIDAR_USEPOLLING`) — portability across environments
- `docker-compose.yml` with volume-mount mode, env var defaults, healthcheck, restart policy — `docker compose up` is the expected local dev UX
- MCP HTTP transport (`StreamableHTTPServerTransport` on `POST /mcp`) — enables remote MCP clients; SDK already installed
- Bearer token middleware on `/mcp` route — write-capable tools (lint, fix, index, scan) must not be callable without auth on a public image
- GHCR GitHub Actions workflow — build + push on master + version tags; multi-arch

**Should have — v3.2.x after validation:**

- `docker-compose.ci.yml` for git-clone mode — enables CI without volume mounts
- Periodic git pull cron in clone mode — repos go stale without it; trigger after CI deployments confirm the stale-index problem
- SSH key auth for private repos in clone mode — HTTPS token covers most cases; SSH needed for specific cases

**Defer to v4+:**

- Kubernetes Helm chart — SQLite single-writer constraint makes horizontal scaling impossible without a database migration to Postgres or Turso
- OAuth 2.1 on MCP endpoint — appropriate for multi-tenant only; bearer token is explicitly acceptable for single-user per MCP authorization docs
- Multi-container compose with separate MCP process — adds network RPC overhead and sync complexity for zero architectural gain

### Architecture Approach

The containerized architecture replaces PM2 with Docker's own supervisor: `restart: unless-stopped` handles crash restart, Docker log driver captures stdout/stderr, and one process per container is the container idiom. `node daemon/server.mjs` runs as PID 1 (no dumb-init required when SIGTERM handlers are registered), MCP HTTP (`daemon/mcp-http.mjs`) starts conditionally when `DOCUMIND_MCP_HTTP=true`, and the stdio MCP server (`daemon/mcp-server.mjs`) remains unchanged as the transport for local macOS development. All 7 existing processors, the graph layer, and CLI scripts are unchanged — Docker just runs them.

**Major components (new and modified):**

1. `Dockerfile` (NEW) — multi-stage `node:22-bookworm-slim`; builder stage installs native modules; runtime stage copies compiled `node_modules`; non-root user; `CMD ["node", "daemon/server.mjs"]`
2. `docker-compose.yml` (NEW) — port mapping, named volume, env var defaults, healthcheck, restart policy
3. `.dockerignore` (NEW) — excludes build noise and secrets from image context
4. `daemon/server.mjs` (MODIFIED) — adds graceful shutdown via `@godaddy/terminus`; conditionally starts MCP HTTP server
5. `daemon/scheduler.mjs` (MODIFIED) — cron intervals read from `process.env` with fallback defaults
6. `daemon/mcp-http.mjs` (NEW) — Streamable HTTP transport on port 9001; same tools as stdio via shared `daemon/mcp-tools.mjs`
7. `processors/git-ingestor.mjs` (NEW) — clone/pull repos into `/repos/` using `simple-git`; runs at startup and on periodic cron
8. `docker-entrypoint.sh` (NEW) — runs git-ingestor before daemon start when `DOCUMIND_REPOS` env var is set
9. `config/profiles/docker.json` (NEW) — Docker-specific context profile with `/repos/*` path convention
10. `.github/workflows/docker-publish.yml` (NEW) — build + push to GHCR on version tag; multi-arch via buildx

### Critical Pitfalls

1. **better-sqlite3 fails on Alpine / Node 24** — Alpine's musl libc breaks glibc-linked prebuilt binaries at runtime (`fcntl64: symbol not found`); Node 24 prebuilts for N-API 137 do not exist. Use `node:22-bookworm-slim` unconditionally. This is the first Dockerfile decision and the costliest to discover late.

2. **Hardcoded macOS paths block all scanning inside the container** — `config/constants.mjs` (line 42), `processors/tree-processor.mjs` (line 12), and `scripts/scan/enhanced-scanner.mjs` (lines 22-31) contain absolute `/Users/Shared/` paths confirmed by direct codebase inspection. Must be replaced with context-profile-driven lookups before Dockerfile authoring. This is the single mandatory pre-Docker step.

3. **SQLite WAL corruption on macOS bind mounts** — Docker Desktop on macOS routes bind mounts through VirtioFS; WAL mode's shared memory locking breaks silently, producing `SQLITE_BUSY` errors or silent write loss after container restart. Use named Docker volumes (`documind-data:/app/data`), not bind mounts, for the database. Bind mounts are acceptable only with `PRAGMA journal_mode=DELETE`.

4. **`CMD ["npm", "start"]` swallows SIGTERM** — npm does not forward SIGTERM to its child Node process; Docker force-kills after 10 seconds, leaving the SQLite WAL unclosed. Use `CMD ["node", "daemon/server.mjs"]` and handle SIGTERM explicitly via `@godaddy/terminus`.

5. **Chokidar watcher is silent on Docker Desktop volume mounts** — inotify events from the macOS host do not propagate through the Linux VM. Set `CHOKIDAR_USEPOLLING=true` and `CHOKIDAR_INTERVAL=2000` as env vars; rely on hourly cron as the authoritative scan source. Not an issue in git-clone mode (all writes happen inside the container's own filesystem).

6. **Git credentials in image layers** — `ARG GITHUB_TOKEN` or `COPY .ssh` in Dockerfile embed credentials permanently into image layers visible via `docker history --no-trunc`. Pass credentials at container runtime via `environment:` in docker-compose; use BuildKit `--mount=type=ssh` only for build-time SSH access.

7. **PM2 as Docker CMD exits the container immediately** — PM2 daemonizes, then the calling process exits, stopping the container. Keep `ecosystem.config.cjs` for local macOS use unchanged; run `node` directly in the container.

## Implications for Roadmap

The build order is driven by three hard constraints: (1) path audit must precede all container work, (2) container foundation must precede feature layers, and (3) MCP HTTP and git-clone are independent of each other after the foundation is established. ARCHITECTURE.md suggests a clean 6-step sequence that maps directly to phases.

### Phase 0: Pre-Docker Path Audit and Refactor

**Rationale:** Hardcoded macOS paths are a blocking prerequisite confirmed by direct codebase inspection. No container will scan correctly until all path lookups flow through the context profile. This is the only phase that must precede all others and it has zero Docker dependencies.

**Delivers:** Codebase where all path resolution flows through `context/loader.mjs`; no `/Users/Shared/` strings in any production code path; `daemon/server.mjs` fails loudly on missing profile rather than falling back to macOS path.

**Addresses:** Pitfall 2 (hardcoded paths), PITFALLS.md pre-Docker refactor requirement.

**Tasks:** Audit and fix `config/constants.mjs`, `processors/tree-processor.mjs`, `scripts/scan/enhanced-scanner.mjs`; replace hardcoded fallbacks with context-profile lookups; define `/repos/<name>/` as the canonical container-internal path convention.

**Verification:** `grep -r '/Users/Shared' daemon/ processors/ config/constants.mjs` returns no results in production code paths.

**Research flag:** Standard patterns — no phase research needed. This is a straightforward code audit and refactor.

---

### Phase 1: Dockerfile Foundation

**Rationale:** All subsequent phases depend on a working container. Establish production hygiene baselines before adding mode-specific features. This phase validates the critical base-image and signal-handling decisions.

**Delivers:** Multi-stage `Dockerfile` with `node:22-bookworm-slim`, non-root user, graceful shutdown via `@godaddy/terminus`, `HEALTHCHECK` instruction, `.dockerignore`, named volume strategy, and `docker-compose.yml` with `restart: unless-stopped`.

**Addresses:** All P1 table-stakes Docker features (non-root, healthcheck, `.dockerignore`, named volume, graceful shutdown, multi-stage build).

**Avoids:** Pitfalls 1 (Alpine), 3 (WAL bind mount), 4 (npm CMD), 7 (PM2 CMD).

**Uses:** `node:22-bookworm-slim`, `@godaddy/terminus`, `CMD ["node", "daemon/server.mjs"]`, named Docker volumes, `CHOKIDAR_USEPOLLING` env var.

**Verification gates:** `docker run --rm <image> node -e "require('better-sqlite3')"` exits 0; `docker stop` completes in under 5 seconds with exit code 0; `docker compose up` shows healthy status; build context under 10MB.

**Research flag:** Standard patterns — official nodejs/docker-node BestPractices.md covers this exactly. Skip phase research.

---

### Phase 2: Environment Variable Configuration

**Rationale:** Must be established before any mode-specific code since both git-clone and MCP HTTP depend on env vars to configure their behavior. Externalizes all hardcoded config into `process.env` with sane defaults.

**Delivers:** All runtime behavior configurable via environment variables; `daemon/scheduler.mjs` reads cron expressions from `process.env`; chokidar polling mode controlled by `CHOKIDAR_USEPOLLING`; `context/loader.mjs` supports `DOCUMIND_REPOS_DIR` path prefix; `.env.example` file with all supported vars documented.

**Addresses:** Portability table stake; enables CI compatibility; sets up infrastructure for both Phases 3 and 4.

**Uses:** `dotenv@^16.4.7`; new env vars `REPO_MODE`, `PORT`, `MCP_AUTH_TOKEN`, `SCAN_INTERVAL`, `FULL_SCAN_CRON`, `GIT_PULL_CRON`, `DOCUMIND_MCP_HTTP`, `DOCUMIND_MCP_HTTP_PORT`, `CHOKIDAR_USEPOLLING`, `CHOKIDAR_INTERVAL`.

**Avoids:** Pitfall 5 (chokidar silent on Docker volumes — add `CHOKIDAR_USEPOLLING` here).

**Research flag:** Standard patterns — 12-factor config with dotenv is well-documented. Skip phase research.

---

### Phase 3: Git-Clone Ingestion Mode

**Rationale:** Independent of MCP HTTP after Phase 2. Enables CI deployments where repos cannot be volume-mounted. The git-clone pattern is the primary feature that differentiates a "works locally" container from a "works anywhere" container.

**Delivers:** `processors/git-ingestor.mjs` using `simple-git`; `docker-entrypoint.sh` that runs ingestor before daemon when `DOCUMIND_REPOS` is set; `config/profiles/docker.json` with `/repos/*` path convention; periodic git pull cron job in scheduler; `docker-compose.ci.yml` for CI use.

**Addresses:** Dual repo access mode differentiator; CI compatibility (P2 features from FEATURES.md).

**Uses:** `simple-git@^3.33.0`; `git` CLI installed in runtime image layer; `docker-entrypoint.sh`; `DOCUMIND_REPOS` env var (JSON array of `{ name, url, branch }`).

**Avoids:** Pitfall 6 (git credentials in image layers — runtime env var injection only; never bake credentials at build time).

**Research flag:** MEDIUM complexity — the dual-mode pattern is DocuMind-specific synthesis with no single reference confirming exactly this approach. Review kubernetes/git-sync sidecar for periodic-pull patterns before implementation. Confirm whether shallow clone (`--depth=1`) is sufficient for DVWDesign repo history sizes.

---

### Phase 4: MCP HTTP Transport

**Rationale:** Independent of git-clone mode after Phase 2. Required before GHCR publish — a write-capable MCP endpoint with no auth on a public image would be irresponsible. Builds on the graceful shutdown infrastructure from Phase 1.

**Delivers:** `daemon/mcp-http.mjs` using `StreamableHTTPServerTransport`; bearer token middleware on `/mcp` route; shared `daemon/mcp-tools.mjs` module to avoid duplicating 14 tool registrations between stdio and HTTP servers; HTTP MCP config snippet for `.claude/mcp.json`; Origin header validation per MCP spec 2025-03-26.

**Addresses:** MCP HTTP transport (P1); bearer token auth (P1, security gate before GHCR publish).

**Uses:** `StreamableHTTPServerTransport` confirmed at `dist/esm/server/streamableHttp.js` in installed SDK; stateful session mode (sessionId generator + transport Map) for multi-step tool operations; `MCP_AUTH_TOKEN` env var.

**Avoids:** Anti-pattern: exposing `POST /mcp` without Origin header validation (DNS rebinding attack vector per MCP spec); duplicating tool registrations across stdio and HTTP entry points.

**Research flag:** Standard patterns — MCP SDK confirmed installed with HTTP transport present; official MCP spec is the authoritative source. Skip phase research.

---

### Phase 5: GHCR Publishing and CI Workflow

**Rationale:** Final phase — publishes only after the image is production-quality. Image must have non-root user, healthcheck, graceful shutdown, and bearer auth before making it public. Publishing is a one-way gate: leaked credentials in GHCR image layers require token rotation and image deletion.

**Delivers:** `.github/workflows/docker-publish.yml` that builds and pushes multi-arch image to GHCR on version tag push; semantic version tags (`v3.2.0`, `v3.2`, `latest`) via `docker/metadata-action@v5`; layer caching via `cache-from/cache-to: type=gha`; `packages: write` permission configured.

**Addresses:** GHCR publishing (P1); CI GitHub Actions workflow (P1); multi-arch build (P2); semantic version tags differentiator.

**Uses:** `docker/build-push-action@v6`, `docker/metadata-action@v5`, `docker/login-action@v3`, `docker/setup-buildx-action@v3`, `docker/setup-qemu-action@v3`; `GITHUB_TOKEN` with auto-created `packages: write` scope.

**Avoids:** Pitfall 6 corollary (credential audit — run `docker history --no-trunc` and `docker scout` or `trivy` before making image public).

**Research flag:** Standard patterns — official GitHub docs confirm this workflow exactly. Skip phase research.

---

### Phase Ordering Rationale

- Phase 0 before everything: hardcoded macOS paths are a blocking dependency confirmed by codebase inspection; no container runs correctly without this fix.
- Phase 1 before Phases 3 and 4: both modes need a working container; graceful shutdown protects SQLite across both modes regardless of which mode is active.
- Phase 2 before Phases 3 and 4: both modes are env-var-driven; config infrastructure must exist before mode-specific logic reads from it.
- Phases 3 and 4 are independent of each other after Phase 2 and can be built in parallel.
- Phase 5 only after Phases 1-4: GHCR publish is a publication gate gated on security (auth on MCP HTTP) and data integrity (graceful shutdown).

### Research Flags

Phases requiring deeper research during planning:

- **Phase 3 (Git-Clone Ingestion):** The dual-mode pattern is DocuMind-specific. Review kubernetes/git-sync for periodic-pull patterns. Confirm shallow clone suitability for DVWDesign repo sizes. Decide whether periodic pull cron belongs in scheduler or a separate entry point.

Phases with standard patterns (skip `/gsd:research-phase`):

- **Phase 0 (Path Audit):** Straightforward code audit; patterns are well-understood.
- **Phase 1 (Dockerfile Foundation):** Official nodejs/docker-node BestPractices.md covers this exactly.
- **Phase 2 (Env Config):** dotenv + process.env is a well-established 12-factor pattern.
- **Phase 4 (MCP HTTP):** SDK confirmed installed; MCP spec is the authoritative source.
- **Phase 5 (GHCR CI):** Official GitHub docs confirm the workflow pattern.

## Confidence Assessment

| Area | Confidence | Notes |
| ------ | ---------- | ----- |
| Stack | HIGH | Base image choice verified via open upstream issues in better-sqlite3 repo; GHCR workflow from official GitHub docs; MCP transport from official spec 2025-03-26; all new packages confirmed available |
| Features | HIGH | Table stakes from official nodejs/docker-node BestPractices.md; MCP from official spec; GHCR from official GitHub docs; anti-features well-documented |
| Architecture | HIGH | Based on direct codebase inspection + SDK presence confirmed in node_modules; component boundaries clearly drawn with specific file names and line numbers |
| Pitfalls | HIGH | better-sqlite3 Alpine incompatibility confirmed via maintainer docs and open issues; WAL + Docker via SQLite official docs ("WAL does not work over a network filesystem"); hardcoded paths confirmed by direct file inspection with specific line numbers |

**Overall confidence:** HIGH

### Gaps to Address

- **ARCHITECTURE.md base image inconsistency:** The architecture research suggests `node:22-alpine` in its Dockerfile code blocks while simultaneously documenting why it works (compile native modules inside Alpine). STACK.md and PITFALLS.md both recommend `node:22-bookworm-slim` with higher-confidence sourcing. **Resolution for roadmap: use `node:22-bookworm-slim`.** Alpine introduces the musl/glibc risk documented in Pitfall 1; Debian slim eliminates that class of issue for a ~30MB image size increase that is not worth debating.

- **better-sqlite3 Node 24 status:** Incompatibility is confirmed as of 2026-03-23 but may resolve in a future release. Reassess when considering upgrades beyond v3.2. Flag this in implementation notes.

- **Stateful vs stateless MCP session mode:** ARCHITECTURE.md recommends stateful sessions (sessionId generator + transport Map) for multi-step tool operations; STACK.md notes stateless mode (`sessionIdGenerator: undefined`) is correct for single-tenant. These are not contradictory — stateful is correct for DocuMind's use case. Validate during Phase 4 implementation.

- **Chokidar in git-clone mode:** Research confirms chokidar still provides value in git-clone mode (picks up `git pull` file changes). In git-clone mode, git writes occur entirely inside the container's own filesystem where inotify works correctly — `CHOKIDAR_USEPOLLING` is therefore not needed in git-clone mode. Confirm this behavior during Phase 3 testing before documenting.

## Sources

### Primary (HIGH confidence)

- [WiseLibs/better-sqlite3 Issue #1384](https://github.com/WiseLibs/better-sqlite3/issues/1384) — Node 24 N-API 137 prebuilt binaries missing; open upstream issue
- [WiseLibs/better-sqlite3 Discussion #1270](https://github.com/WiseLibs/better-sqlite3/discussions/1270) — Alpine vs Debian: maintainer explicitly recommends Debian slim
- [Docker Hub node:22-bookworm-slim](https://hub.docker.com/layers/library/node/22-bookworm-slim/) — Active LTS tag confirmed
- [MCP Specification 2025-03-26 — Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — Streamable HTTP current standard, SSE deprecated; Origin header validation required
- [GitHub Publishing Docker Images docs](https://docs.github.com/en/actions/publishing-packages/publishing-docker-images) — GHCR workflow with GITHUB_TOKEN and packages: write
- [nodejs/docker-node BestPractices.md](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md) — non-root user, signal handling, healthcheck patterns
- [Express.js graceful shutdown guide](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html) — SIGTERM via npm swallows signal; direct node exec required
- [SQLite WAL official docs](https://www.sqlite.org/wal.html) — "WAL does not work over a network filesystem"
- [chokidar Issue #1051](https://github.com/paulmillr/chokidar/issues/1051) — Docker volume mount inotify issue; `usePolling=true` is the documented fix
- Codebase direct inspection — `daemon/server.mjs` line 56 (WAL confirmed), line 50 (macOS path fallback confirmed); `daemon/mcp-server.mjs` line 31 (WAL in MCP server); `config/constants.mjs` line 42 (`LOCAL_BASE_PATH` hardcoded); `processors/tree-processor.mjs` line 12 (`REPOS_ROOT` hardcoded); `scripts/scan/enhanced-scanner.mjs` lines 22-31 (14 hardcoded absolute paths); zero SIGTERM handlers across all 5 daemon files
- MCP SDK installed in project — `StreamableHTTPServerTransport` confirmed present at `dist/esm/server/streamableHttp.js`

### Secondary (MEDIUM confidence)

- [Node Best Practices — Graceful Shutdown](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/docker/graceful-shutdown.md) — terminus recommendation; SIGTERM forwarding behavior
- [godaddy/terminus GitHub](https://github.com/godaddy/terminus) — createTerminus API reference
- [kubernetes/git-sync](https://github.com/kubernetes/git-sync) — periodic git pull sidecar pattern reference for clone mode design
- [How to Run SQLite in Docker](https://oneuptime.com/blog/post/2026-02-08-how-to-run-sqlite-in-docker-when-and-how/view) — named volume strategy for WAL safety
- [MCP bearer token auth discussion #1247](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1247) — bearer token acceptable for single-user deployments per MCP authorization docs
- [simple-git npm](https://www.npmjs.com/package/simple-git) — v3.33.0 current; 7.9M weekly downloads vs 628K for isomorphic-git

### Tertiary (LOW confidence)

- [Vaultwarden SQLite corruption discussion](https://github.com/dani-garcia/vaultwarden/discussions/2965) — WAL corruption reports on Docker bind mounts; corroborates SQLite official docs but is a different project
- [MCP stdio Docker -i flag guide](https://mcpcat.io/guides/configuring-mcp-transport-protocols-docker-containers/) — `-i` required for stdin; `-t` corrupts binary JSON-RPC stream

---

*Research completed: 2026-03-23*
*Ready for roadmap: yes*
