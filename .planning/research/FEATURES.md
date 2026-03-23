# Feature Research

**Domain:** Docker containerization + MCP HTTP transport + GHCR publishing for a Node.js documentation daemon
**Researched:** 2026-03-23
**Confidence:** HIGH (Docker/Node.js practices from official nodejs/docker-node docs); HIGH (MCP transport from
official modelcontextprotocol.io spec); MEDIUM (git-clone ingestion patterns from community sources);
HIGH (GHCR publishing from official GitHub docs)

---

## Context Note

This research covers ONLY the new v3.2 features. DocuMind v3.1 already ships:
REST API on port 9000, MCP stdio server with 14 tools, SQLite FTS5 with graph/keywords/diagrams,
PM2 daemon, cron scheduler, and context profiles. The features below are what v3.2 adds.

The primary consumer shifts with this milestone: from a local macOS PM2 daemon callable by Claude Code
to a portable Docker image runnable anywhere — CI pipelines, remote Linux servers, other developers'
machines — while keeping local Claude Code integration fully functional.

---

## Feature Landscape

### Table Stakes (Users Expect These)

"Users" here means: (1) the developer running `docker compose up` expecting a working service,
(2) a CI pipeline consuming DocuMind as a service container, (3) a remote MCP client connecting
over HTTP. Missing any of these makes the container feel broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |

| ------- | ------------ | ---------- | ----- |

| Non-root user in container | Security requirement for any published image; Docker Hub and GHCR scan for root-run containers; kubernetes clusters often block root pods | LOW | Node.js official images ship a `node` user (uid 1000). One `USER node` line in Dockerfile. Existing dependency: `better-sqlite3` needs write access to `/data` — chown the volume mount path. |

| Graceful shutdown (SIGTERM handler) | Docker `stop` sends SIGTERM; if ignored, Docker force-kills after 10s and in-flight SQLite writes are corrupted | MEDIUM | `process.on('SIGTERM', ...)` must close better-sqlite3 connection, drain active cron jobs, close Express server. Node.js must run as PID 1 via `CMD ["node", ...]` not npm scripts (npm swallows signals). |

| HEALTHCHECK instruction in Dockerfile | Docker Compose and GitHub Actions service containers wait for healthy status before routing traffic; without it, dependent services start against an unready daemon | LOW | `HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:9000/health \|\| exit 1`. DocuMind already has `/health` endpoint — this is pure Dockerfile wiring. |

| .dockerignore file | Without it, COPY sends node_modules (100MB+), .git history, .env secrets, data/documind.db into build context — slow builds and potential credential leaks | LOW | Must exclude: `node_modules/`, `.git/`, `data/`, `*.env`, `.env*`, `config/context-profile.json` (runtime config), `markdown.bbprojectd/`, `docs/` if not needed at runtime. |

| Named volume for SQLite database | Without a volume, the database is destroyed on every container restart — all indexed documents lost | LOW | Mount `documind-data:/app/data`. WAL mode (already enabled in DocuMind) works correctly in single-container Docker volumes. Do NOT share this volume across multiple containers simultaneously — SQLite single-writer constraint. |

| Environment variable configuration | Config embedded in image = can't run in different environments without rebuilding; environment variables are the standard 12-factor app pattern for containerized services | MEDIUM | Must externalize: `REPO_MODE` (volume\|clone), `REPO_PATHS` or `GIT_REPOS`, `PORT` (default 9000), `CRON_HOURLY_ENABLED`, `CRON_DAILY_ENABLED`. Existing context profile JSON system is the right abstraction — extend it to accept env-var overrides. |

| Multi-stage Dockerfile (deps vs runtime) | Production image should not ship dev dependencies (markdownlint-cli2, @mermaid-js/mermaid-cli, jsdoc, husky) — these add 200-400MB and attack surface | MEDIUM | Stage 1: `npm ci` with full dependencies for build/compile. Stage 2: `npm ci --omit=dev` for runtime. DocuMind is pure JS/mjs — no transpile step. Main win is excluding devDeps and tools. Target image size: under 200MB. |

| docker-compose.yml for single-command startup | `docker compose up` is the expected UX for any containerized dev service; without it, users must manually pass volumes and env vars | LOW | Must cover: port mapping, named volume, env vars with defaults, healthcheck options, depends_on ordering if sidecar pattern used. Provide `docker-compose.yml` (dev, with volume mount) and `docker-compose.ci.yml` (CI, with git-clone mode). |

| Published image on GHCR | Consumers expect `docker pull ghcr.io/dvwdesign/documind:latest` to just work; without GHCR, every user must build locally | LOW | Naming: `ghcr.io/dvwdesign/documind`. Tag strategy: `latest` + semantic version tags (`v3.2.0`). Auth: `GITHUB_TOKEN` in CI workflow with `packages: write` permission. Visibility: public for open distribution. |

| CI build + push GitHub Actions workflow | Without automated publishing, image gets stale immediately; manual push is error-prone | MEDIUM | Workflow triggers: push to `master` + version tags. Uses `docker/build-push-action` + `docker/login-action`. Build multi-arch (`linux/amd64`, `linux/arm64`) via buildx so macOS M-series and Linux CI both work. Cache layers with `cache-from: type=gha`. |

**Confidence:** HIGH — non-root, signal handling, healthcheck, .dockerignore patterns from official
nodejs/docker-node BestPractices.md (github.com/nodejs/docker-node). GHCR workflow from official
GitHub Docs. Multi-stage build sizing from 2025 community benchmarks (multiple concordant sources).

---

### Differentiators (DocuMind-Specific Advantage)

These go beyond "works in Docker" to make the image genuinely useful for the target use cases:
CI pipelines and remote deployment where local file mounts are not possible.

| Feature | Value Proposition | Complexity | Notes |

| ------- | ----------------- | ---------- | ----- |

| Dual repo access mode (volume-mount vs git-clone) | Volume mount works for local dev; git-clone works for CI and remote servers where repos are not mounted. Supporting both modes in one image means one image serves all environments. | HIGH | `REPO_MODE=volume`: reads from `/repos/{name}` volume mounts (current behavior, just containerized). `REPO_MODE=clone`: on startup, clones configured repos to `/app/repos/`, runs periodic `git pull` on cron. Context profile lists repos with `url` + `branch` fields for clone mode. Dependency: git must be installed in image for clone mode. |

| MCP HTTP transport (StreamableHTTP on POST /mcp) | Allows remote MCP clients to call DocuMind tools without stdio subprocess; required for CI and remote deployment where Claude Code cannot spawn a local subprocess | MEDIUM | Already partially designed in STACK.md. Mount `StreamableHTTPServerTransport` on `POST /mcp` in existing Express server. Stateless mode (`sessionIdGenerator: undefined`) = correct for single-tenant. Existing read + write tools all work unchanged. |

| Bearer token auth on MCP HTTP endpoint | MCP over HTTP with no auth = anyone on the network can call lint/fix/index tools; for a tool that writes to repos, that is unacceptable | LOW | Simple middleware: check `Authorization: Bearer <token>` header on `/mcp` route. Token configured via `MCP_AUTH_TOKEN` env var. If env var unset, HTTP MCP is disabled entirely (stdio still works). No OAuth needed for solo-user deployment — bearer token is sufficient. |

| Periodic git pull for clone mode repos | Without periodic pull, cloned repos go stale — the whole point of DocuMind is fresh indexing | MEDIUM | Wire a cron job (every 15 min or configurable) that runs `git pull --ff-only` on each cloned repo. On pull success, trigger incremental scan of changed files. On conflict/error, log and continue — do not crash the daemon. SSH key or HTTPS token for private repos configurable via `GIT_AUTH_TOKEN` env var. |

| Semantic version image tags + latest alias | `latest` alone makes rollback impossible; `v3.2.0` tags plus `latest` allows consumers to pin a specific version while still getting auto-updates if desired | LOW | CI workflow: tag with `${{ github.ref_name }}` on version tag push + always retag `latest` on master merge. GitHub Actions `docker/metadata-action` handles this automatically. |

**Confidence:** MEDIUM — dual-mode pattern is DocuMind-specific synthesis; no single reference confirms
exactly this approach. git-clone periodic sync pattern from kubernetes/git-sync (well-established sidecar
project). MCP HTTP bearer auth from modelcontextprotocol.io security docs and community discussion #1247.

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |

| ------- | ------------- | --------------- | ----------- |

| Running as root in container | "It's simpler, avoids permission issues" | GHCR and container registries flag root-run images; Kubernetes blocks them by policy; it is a security anti-pattern with no justification for a Node.js service | Use built-in `node` user (uid 1000). Chown `/app/data` to `node` in Dockerfile. One-time setup, no ongoing complexity. |

| Using npm start as CMD | "That's what package.json scripts are for" | npm does not forward SIGTERM to child processes. Container stop sends SIGTERM to npm, npm ignores it, Docker waits 10s and SIGKILL — no graceful shutdown, SQLite writes may corrupt | `CMD ["node", "daemon/server.mjs"]` directly. Signals reach Node.js. Works identically to `npm run daemon:dev` for startup behavior. |

| Bundling SQLite DB in image | "Ship everything in one image for simplicity" | Database is ephemeral state — it belongs in a volume. Baking it in means every image update wipes the index. Also bloats the image layer cache unnecessarily. | Named volume `documind-data:/app/data`. Container is stateless; data persists independently. |

| git inside the image for one-off clone at build time | "Clone repos at image build time so they're always present" | Bakes repo snapshots into the image — they go stale the moment they're built. Also embeds git credentials in image layers (security risk). | Clone mode: clone at container startup, not build time. Credentials passed via env vars at runtime, never embedded in image. |

| Kubernetes / Helm charts in v3.2 | "If you're dockerizing, go full cloud-native" | DocuMind is a single-node, single-user service. Kubernetes adds orchestration complexity with zero value at this scale. SQLite single-writer constraint makes horizontal scaling impossible without a database swap. | `docker compose up` on a remote server covers the legitimate use case. Revisit if SaaS path chosen in v4.x. |

| OAuth 2.1 on MCP HTTP endpoint | "The MCP spec recommends OAuth 2.1 for remote servers" | OAuth 2.1 requires authorization server, PKCE flow, token refresh — 2-3 weeks of infrastructure for a single-user tool. The spec recommends OAuth for multi-tenant; for single-user, bearer token is explicitly acceptable. | Bearer token via `MCP_AUTH_TOKEN` env var. Simple, auditable, revokable by rotating the env var. |

| Multi-container compose with separate MCP process | "Separation of concerns — MCP and REST should be independent services" | DocuMind's MCP server shares SQLite state with the REST daemon. Running them in separate containers requires network RPC, introducing latency, failure modes, and sync complexity for zero architectural gain. | Mount both transports from the same process (already the design). Single container, two transports. |

| Alpine base image for Node.js | "Alpine is smallest — always use it" | `better-sqlite3` uses native bindings compiled with node-gyp. Alpine uses musl libc; the prebuilt binaries in the npm package expect glibc. Alpine requires rebuilding native dependencies from source during `npm ci`, significantly slowing CI builds. | Use `node:22-bookworm-slim` (Debian-based, glibc) instead. Slim is 60% smaller than full `node:22` and avoids the musl/glibc native binding problem entirely. |

---

## Feature Dependencies

```text
[Docker image — non-root user + signal handling + healthcheck]
    └── is prerequisite for ──> [GHCR publishing] (image must be production-quality before publishing)
    └── is prerequisite for ──> [CI GitHub Actions workflow] (CI builds the image)
    └── is prerequisite for ──> [GitHub Actions service container usage]

[Named volume for SQLite]
    └── is prerequisite for ──> [docker-compose.yml] (compose defines the volume)
    └── is prerequisite for ──> [data persistence across deploys]

[Environment variable configuration]
    └── is prerequisite for ──> [dual repo access mode] (REPO_MODE switches behavior)
    └── is prerequisite for ──> [CI compatibility] (CI passes env vars, not mounted configs)
    └── enhances ──> [context profile system] (env vars can override profile fields)

[Dual repo access mode — volume vs clone]
    └── volume mode requires ──> [docker-compose.yml with volume mounts] (repos mounted at /repos/)
    └── clone mode requires ──> [git installed in image] (apt-get install git in Dockerfile)
    └── clone mode requires ──> [periodic git pull cron job] (freshness depends on pulls)
    └── clone mode requires ──> [GIT_AUTH_TOKEN env var] (private repos need credentials)

[MCP HTTP transport — StreamableHTTP on POST /mcp]
    └── requires ──> [existing MCP stdio server] (same McpServer instance, new transport)
    └── requires ──> [bearer token auth middleware] (HTTP MCP with no auth is unacceptable)
    └── enables ──> [remote MCP clients] (CI and remote servers can call tools)
    └── enables ──> [GitHub Actions service container with MCP] (workflow steps can call tools)

[Bearer token auth on MCP HTTP]
    └── requires ──> [MCP_AUTH_TOKEN env var] (token configured at runtime)
    └── is prerequisite for ──> [public GHCR image] (can't ship a write-capable image with no auth)

[GHCR publishing]
    └── requires ──> [GitHub Actions CI workflow] (automated build + push)
    └── requires ──> [production-quality image] (non-root + healthcheck + graceful shutdown)
    └── requires ──> [packages: write permission] (GITHUB_TOKEN must have write:packages scope)

[GitHub Actions CI workflow]
    └── requires ──> [docker/build-push-action] (standard buildx action)
    └── requires ──> [docker/login-action with GITHUB_TOKEN] (authentication to GHCR)
    └── enhances ──> [multi-arch build] (linux/amd64 + linux/arm64 via buildx)
```

### Dependency Notes

- **node:22-bookworm-slim not node:22-alpine**: `better-sqlite3` uses native C++ bindings. Alpine's musl libc breaks prebuilt binaries. This is the single most common DocuMind-specific Docker pitfall — use `node:22-bookworm-slim` (Debian glibc). HIGH confidence — confirmed by better-sqlite3 GitHub issues and musl/glibc native binding documentation.

- **Clone mode requires git at startup, not build time**: Repos are cloned when the container starts using credentials passed via env vars. This avoids embedding credentials in image layers and ensures repos are always at HEAD, not a snapshot from build time.

- **MCP HTTP needs auth before GHCR publish**: DocuMind's write tools (lint, fix, index, scan) modify files in mounted repos. Publishing an image where these are callable with no auth would be irresponsible. Bearer token auth is the minimum bar before making the image public.

- **Graceful shutdown protects SQLite**: better-sqlite3 WAL mode creates `-wal` and `-shm` sidecar files. If the process is SIGKILL'd without a clean checkpoint, the WAL file is left in an inconsistent state. SIGTERM → close DB connection → Docker stop works correctly.

---

## MVP Definition

v3.2 MVP = a single `docker compose up` that starts DocuMind with local repos mounted, healthy API
on port 9000, MCP HTTP available with bearer auth, and a published GHCR image that CI can pull.

### Launch With (v3.2)

- [ ] Dockerfile with non-root user, multi-stage build (deps → runtime), `node:22-bookworm-slim` base — image quality gates
- [ ] .dockerignore excluding node_modules, .git, data/, .env, markdown.bbprojectd — build context hygiene
- [ ] Graceful shutdown: `process.on('SIGTERM', ...)` closes DB + Express + drains crons — data integrity
- [ ] HEALTHCHECK in Dockerfile pointing to existing `/health` endpoint — container orchestration compatibility
- [ ] Named volume for `/app/data` (SQLite DB) in docker-compose.yml — data persistence
- [ ] Environment variable configuration: `REPO_MODE`, `PORT`, `MCP_AUTH_TOKEN`, `CRON_*` flags — portability
- [ ] docker-compose.yml with volume-mount mode, env var defaults, healthcheck — local dev UX
- [ ] MCP HTTP transport: `StreamableHTTPServerTransport` mounted on `POST /mcp` in Express — remote access
- [ ] Bearer token middleware on `/mcp` route, disabled if `MCP_AUTH_TOKEN` unset — security gate
- [ ] GHCR GitHub Actions workflow: build + push on master + version tags, multi-arch — published image
- [ ] docker-compose.ci.yml with git-clone mode, `REPO_MODE=clone`, `GIT_REPOS` list — CI compatibility

### Add After Validation (v3.2.x)

- [ ] Periodic git pull cron in clone mode — trigger: CI deployments show stale index after first sync
- [ ] `docker-compose.remote.yml` for remote Linux server deployment — trigger: someone wants to run on a VPS
- [ ] SSH key auth for private git repos in clone mode — trigger: need to clone private DVWDesign repos in CI
- [ ] Image scan in CI workflow (Trivy or Docker Scout) — trigger: GHCR scan flags vulnerabilities

### Future Consideration (v4+)

- [ ] Kubernetes Helm chart — only if SaaS path confirmed; SQLite is the blocker (need Turso or Postgres first)
- [ ] Multi-arch ARM build optimization — current buildx QEMU emulation is slow; native ARM runner if justified
- [ ] Image signing with cosign — if distributing to enterprises who require supply chain verification

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |

| ------- | ---------- | ------------------- | -------- |

| Dockerfile (non-root, slim, healthcheck, graceful shutdown) | HIGH | LOW (1 file, ~30 lines) | P1 |

| .dockerignore | HIGH (build speed + security) | LOW (1 file) | P1 |

| Named volume for SQLite | HIGH (data persistence) | LOW (docker-compose config) | P1 |

| docker-compose.yml (volume-mount mode) | HIGH (local dev UX) | LOW | P1 |

| Environment variable configuration | HIGH (portability) | MEDIUM (audit all hardcoded paths) | P1 |

| MCP HTTP transport (StreamableHTTP) | HIGH (remote access) | LOW (wiring only, SDK already installed) | P1 |

| Bearer token auth on /mcp | HIGH (security) | LOW (middleware, ~20 lines) | P1 |

| GHCR GitHub Actions workflow | HIGH (publishability) | MEDIUM (CI workflow authoring) | P1 |

| docker-compose.ci.yml (clone mode) | MEDIUM (CI compatibility) | MEDIUM (new startup logic) | P2 |

| Periodic git pull in clone mode | MEDIUM (freshness) | MEDIUM (cron + error handling) | P2 |

| Multi-arch build (amd64 + arm64) | MEDIUM (M-series Mac + Linux CI) | LOW (buildx flag, handled by action) | P2 |

| SSH key auth for private repos | LOW (public repos work without it) | MEDIUM (secret mounting in container) | P3 |

| Kubernetes Helm chart | LOW (no k8s use case yet) | HIGH | P3 |

**Priority key:**

- P1: Must have for v3.2 milestone completion
- P2: Add once core container is proven working
- P3: Future consideration — not before v4.0

---

## Competitor / Reference Implementation Analysis

DocuMind is not competing with container registries or CI platforms. The reference here is
"how do comparable Node.js daemon projects Docker themselves?"

| Feature | node-docker-good-defaults (Bret Fisher) | Express.js official health check guide | DocuMind v3.2 Approach |

| ------- | --------------------------------------- | --------------------------------------- | ---------------------- |

| Base image | node:lts-slim | Not specified | node:22-bookworm-slim (glibc, no Alpine — native bindings) |

| Non-root user | USER node | Not specified | USER node, chown /app/data |

| Signal handling | CMD ["node", ...] | process.on('SIGTERM', ...) with http.server.close() | Both: CMD + SIGTERM handler that closes DB + Express |

| Health check | HEALTHCHECK in Dockerfile | /health endpoint returning 200 | Existing /health endpoint + HEALTHCHECK instruction |

| MCP transport | N/A | N/A | StreamableHTTP on POST /mcp, same Express server |

| Auth | N/A | N/A | Bearer token middleware, env var controlled |

| Data persistence | Named volume | N/A | Named volume documind-data:/app/data |

| GHCR publishing | docker/build-push-action | N/A | GITHUB_TOKEN + packages: write + multi-arch buildx |

---

## Sources

- Node.js Docker best practices (official, HIGH confidence): [github.com/nodejs/docker-node/blob/main/docs/BestPractices.md](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)

- Docker graceful shutdown + SIGTERM (official Express docs, HIGH confidence): [expressjs.com/en/advanced/healthcheck-graceful-shutdown.html](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html)

- Node.js graceful shutdown in Docker best practices (community, MEDIUM confidence): [github.com/goldbergyoni/nodebestpractices — graceful-shutdown.md](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/docker/graceful-shutdown.md)

- Docker non-root user 2026 (MEDIUM confidence): [oneuptime.com — docker-run-non-root-user](https://oneuptime.com/blog/post/2026-01-16-docker-run-non-root-user/view)

- GHCR working with container registry (official GitHub Docs, HIGH confidence): [docs.github.com — working-with-the-container-registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

- MCP Streamable HTTP transport spec (official, HIGH confidence): [modelcontextprotocol.io — transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)

- MCP transport future roadmap 2026 (official MCP blog, HIGH confidence): [blog.modelcontextprotocol.io — 2026-mcp-roadmap](http://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)

- MCP HTTP transport in production (MEDIUM confidence): [medium.com — implementing-mcp-with-streamable-http-transport-in-prod](https://medium.com/ai-in-plain-english/implementing-mcp-with-streamable-http-transport-in-prod-23ca9c6731ca)

- MCP bearer token auth best practices (official MCP discussions, MEDIUM confidence): [github.com/modelcontextprotocol/modelcontextprotocol/discussions/1247](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1247)

- MCP authorization docs (official, HIGH confidence): [modelcontextprotocol.io/docs/tutorials/security/authorization](https://modelcontextprotocol.io/docs/tutorials/security/authorization)

- kubernetes/git-sync sidecar pattern (official, HIGH confidence): [github.com/kubernetes/git-sync](https://github.com/kubernetes/git-sync)

- SQLite in Docker — named volumes + WAL (MEDIUM confidence): [oneuptime.com — how-to-run-sqlite-in-docker](https://oneuptime.com/blog/post/2026-02-08-how-to-run-sqlite-in-docker-when-and-how/view)

- Docker multi-stage Node.js image optimization 2025 (MEDIUM confidence): [markaicode.com — nodejs-docker-optimization-2025](https://markaicode.com/nodejs-docker-optimization-2025/)

- .dockerignore Node.js best practices (MEDIUM confidence): [github.com/goldbergyoni/nodebestpractices — docker-ignore.md](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/docker/docker-ignore.md)

---

*Feature research for: DocuMind v3.2 — Docker containerization + MCP HTTP + GHCR publishing*
*Researched: 2026-03-23*
