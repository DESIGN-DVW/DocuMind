# Stack Research

**Domain:** Docker containerization + MCP HTTP transport + git-clone ingestion + GHCR publishing
**Researched:** 2026-03-23
**Confidence:** HIGH (Docker/Node base image, GHCR CI), MEDIUM (MCP HTTP transport current pattern, simple-git), LOW (better-sqlite3 Node 24 status — active upstream issue)

---

## Context

DocuMind v3.1 ships with a validated stack (Node 20+, Express 5, better-sqlite3, MCP SDK 1.27.1, zod 3.25.0). This research answers one question: **what additions and changes are needed for v3.2 — Docker containerization, MCP dual-mode transport, git-clone repo ingestion, environment-based config, graceful shutdown, and GHCR publishing?**

The answer: three new npm packages, no version bumps required, and specific Docker build decisions driven by better-sqlite3 native module constraints.

---

## Recommended Stack

### New Dependencies (Net-New to package.json)

| Library | Version | Purpose | Why Recommended |
| ------- | ------- | ------- | --------------- |
| `simple-git` | `^3.33.0` | Git clone/pull for remote repo ingestion | 7.9M weekly downloads vs 628K for isomorphic-git. Wraps native git CLI — faster for large repos, no pure-JS overhead. Native CLI dependency is a non-issue in Docker where git is installed. Simpler API for clone/pull/status use cases. |
| `dotenv` | `^16.4.7` | Environment variable loading from `.env` files | Zero-dependency. Works with Docker `env_file:` compose directive and `--env-file` flag. The `process.env` fallback means Docker-injected env vars override `.env` naturally — correct behavior for containerized config. Node 20.6+ has `--env-file` native flag but dotenv is still needed for programmatic loading and `.env.example` workflow. |

### New Dev Dependencies

| Library | Version | Purpose | Why Recommended |
| ------- | ------- | ------- | --------------- |
| `@godaddy/terminus` | `^4.12.1` | Graceful shutdown + health check middleware | Handles SIGTERM/SIGINT, drains in-flight requests, runs cleanup hooks (close DB connection, flush file watcher). Used by Node Best Practices guide. Integrates with Express via `createTerminus(server, { healthChecks, onSignal, onShutdown })`. Prevents SQLite WAL corruption on abrupt stops. |

### Existing Dependencies — No Changes Required

All existing runtime dependencies stay. The MCP SDK (`@modelcontextprotocol/sdk@^1.27.1`) already ships `StreamableHTTPServerTransport` — no separate package needed for HTTP transport. The `@modelcontextprotocol/express` middleware package exists but is a thin optional wrapper; mount directly via `StreamableHTTPServerTransport` as already documented in v3.0 STACK.md.

| Existing | Current Version | Status |
| -------- | --------------- | ------ |
| `@modelcontextprotocol/sdk` | `^1.27.1` | Stays — already includes HTTP transport |
| `better-sqlite3` | `^12.6.2` | Stays — but drives Docker base image choice (see below) |
| `express` | `^5.2.1` | Stays |
| `zod` | `^3.25.0` | Stays |

---

## Docker Base Image Decision

**Use `node:22-bookworm-slim` for both build and runtime stages.**

Do NOT use Alpine. Do NOT use Node 24.

### Why node:22, not node:24

better-sqlite3 prebuilt binaries are missing for Node 24 / N-API 137 (tracked in [WiseLibs/better-sqlite3#1384](https://github.com/WiseLibs/better-sqlite3/issues/1384)). Node 24 compilation from source fails with deprecated V8 API errors on the current published versions of better-sqlite3. Node 22 is Active LTS (codename "Jod", supported through 2027) — it is the correct production target.

**Confidence:** MEDIUM — Node 24 incompatibility verified via multiple GitHub issues. Node 22 LTS status verified via official Docker Hub tags. This may resolve in a future better-sqlite3 release; re-evaluate when upgrading beyond v3.2.

### Why bookworm-slim, not Alpine

better-sqlite3 links against glibc. Alpine uses musl libc, which causes `fcntl64: symbol not found` and similar relocation errors at runtime. Even with a multi-stage build that compiles on Debian and copies binaries to Alpine, the linked glibc symbols break on musl. Community consensus: "Use Debian slim — image will be slightly larger but everything just works out of the box." ([WiseLibs/better-sqlite3 discussion #1270](https://github.com/WiseLibs/better-sqlite3/discussions/1270))

`node:22-bookworm-slim` adds ~30MB vs Alpine but eliminates an entire class of native module debugging.

### Multi-Stage Build Pattern

```dockerfile
# Stage 1: builder — compiles native modules
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install build tools required by better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --include=dev

COPY . .

# Stage 2: runtime — clean image, no build tools
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y \
    git curl \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled node_modules (including better-sqlite3.node binary)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY . .

# Non-root user for security
RUN groupadd -r documind && useradd -r -g documind documind \
    && chown -R documind:documind /app
USER documind

EXPOSE 9000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:9000/health || exit 1

# Use node directly (not npm) so SIGTERM propagates correctly
CMD ["node", "daemon/server.mjs"]
```

**Critical:** `CMD ["node", "daemon/server.mjs"]` not `CMD ["npm", "run", "daemon:dev"]`. npm does not forward SIGTERM to the Node process — the container will hang on `docker stop` and eventually force-kill, risking SQLite WAL corruption.

**Critical:** `git` must be in the runtime stage (not just builder). simple-git shells out to the native git CLI — if git is absent at runtime, clone/pull fails silently.

---

## MCP HTTP Transport — Current State

### Transport Status (2026)

SSE (`/sse` + `/messages` dual endpoint) is deprecated as of MCP spec 2025-03-26. Streamable HTTP (`POST /mcp`, single endpoint, optional SSE upgrade) is the current standard. The existing SDK version (`^1.27.1`) supports `StreamableHTTPServerTransport` — no package change needed.

**Confidence:** HIGH — [MCP spec 2025-03-26 transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) confirms Streamable HTTP as current, SSE as deprecated.

### Dual-Mode Transport (Stdio + HTTP)

Run both transports from the same process. Stdio for local Claude Code, HTTP for containerized/remote consumers. The existing v3.0 STACK.md documents the correct mount pattern — no changes needed.

Do NOT implement the deprecated SSE transport. Even though the SDK maintains backward compat, new implementations should use Streamable HTTP only.

---

## Environment-Based Configuration

### Pattern: Native Node + dotenv fallback

```javascript
// In daemon/server.mjs — load at startup
import 'dotenv/config';  // no-op if vars already set by Docker

const config = {
  port:      parseInt(process.env.PORT ?? '9000'),
  repoMode:  process.env.REPO_MODE ?? 'volume',       // 'volume' | 'clone'
  repoRoots: (process.env.REPO_ROOTS ?? '').split(':').filter(Boolean),
  cloneBase: process.env.CLONE_BASE ?? '/repos',
  cronHourly: process.env.CRON_HOURLY ?? '0 * * * *',
  cronDaily:  process.env.CRON_DAILY  ?? '0 2 * * *',
  cronWeekly: process.env.CRON_WEEKLY ?? '0 3 * * 0',
};
```

`dotenv/config` only populates `process.env` keys not already set — Docker `environment:` and `env_file:` injections take precedence naturally.

**No additional library.** `dotenv` is sufficient. Do not add `convict`, `config`, or `nconf` — they add complexity without benefit for a single-tenant daemon.

---

## Graceful Shutdown Pattern

### Why @godaddy/terminus

`@godaddy/terminus` is the established Express graceful shutdown library (Node Best Practices guide). It handles:

1. Routes `/health` and `/readiness` checks
2. On SIGTERM: stops accepting new requests, waits for in-flight to drain
3. Runs `onSignal` callbacks (close SQLite connection, stop chokidar watcher, flush cron jobs)
4. Exits cleanly

SQLite WAL mode keeps a write-ahead log. If the process is force-killed mid-write, the WAL may be in an inconsistent state. `terminus` prevents this by ensuring `db.close()` runs before exit.

```javascript
import { createTerminus } from '@godaddy/terminus';

createTerminus(server, {
  healthChecks: {
    '/health': async () => ({ status: 'ok', uptime: process.uptime() }),
  },
  onSignal: async () => {
    db.close();
    watcher.close();
    // cron jobs stop automatically when process exits
  },
  timeout: 10000,  // 10s drain window
});
```

**Alternative considered:** Bare `process.on('SIGTERM', ...)`. This works but requires manually handling drain timing and health check endpoints. terminus is 15 lines vs ~80 lines of error-prone manual handling. Worth the dependency.

---

## GHCR Publishing — GitHub Actions

### Actions Required

| Action | Version | Purpose |
| ------ | ------- | ------- |
| `docker/login-action` | `v3` | Authenticate to ghcr.io using `GITHUB_TOKEN` |
| `docker/metadata-action` | `v5` | Generate tags (semver, latest, sha) from git refs |
| `docker/setup-buildx-action` | `v3` | Enable multi-platform builds via BuildKit |
| `docker/setup-qemu-action` | `v3` | QEMU for cross-platform (arm64 on amd64 runner) |
| `docker/build-push-action` | `v6` | Build + push to GHCR with caching |

### Workflow Pattern

```yaml
name: Publish to GHCR
on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-qemu-action@v3

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha

      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

`GITHUB_TOKEN` is auto-created per workflow run — no secret configuration needed for GHCR. The `packages: write` permission is required.

**Confidence:** HIGH — official [GitHub Publishing Docker Images docs](https://docs.github.com/en/actions/publishing-packages/publishing-docker-images) confirm this pattern.

---

## docker-compose.yml Pattern (Volume Mount Mode)

```yaml
services:
  documind:
    build: .
    image: ghcr.io/dvwdesign/documind:latest
    ports:
      - "9000:9000"
    volumes:
      - ./data:/app/data                          # SQLite database persistence
      - /Users/Shared/htdocs/github:/repos:ro     # Local repo access (volume mode)
    environment:
      - REPO_MODE=volume
      - REPO_ROOTS=/repos/DVWDesign/DocuMind:/repos/DVWDesign/RootDispatcher
      - PORT=9000
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s
```

For git-clone mode (CI/remote), set `REPO_MODE=clone` and provide `REPO_URLS` instead of `REPO_ROOTS`. The clone processor uses simple-git to fetch repos into `CLONE_BASE` at startup and on the hourly cron.

---

## What NOT to Use

| Avoid | Why | Use Instead |
| ----- | --- | ----------- |
| `node:24-*` base image | better-sqlite3 prebuilt binaries missing for N-API 137; compilation from source fails with deprecated V8 API. Active upstream issue as of 2026-03. | `node:22-bookworm-slim` (Active LTS) |
| `node:*-alpine` base image | musl libc incompatible with better-sqlite3 glibc-linked binaries. Results in `fcntl64: symbol not found` at runtime even with multi-stage builds. | `node:22-bookworm-slim` (Debian glibc) |
| `isomorphic-git` | Pure JS reimplementation of git — slower for large repos, 10x fewer downloads than simple-git. Only useful in browser environments, which Docker containers are not. | `simple-git` |
| `CMD ["npm", "run", "daemon:start"]` | npm does not forward SIGTERM to child Node process. Container hangs on `docker stop`, eventually force-killed, risks SQLite WAL corruption. | `CMD ["node", "daemon/server.mjs"]` |
| SSE transport (`/sse` endpoint) | Deprecated in MCP spec 2025-03-26. Dual-endpoint design requires persistent connections that complicate health checks and load balancers. | `StreamableHTTPServerTransport` on `POST /mcp` |
| `@modelcontextprotocol/express` middleware | Thin optional wrapper around `StreamableHTTPServerTransport`. Adds a dependency for what is 3 lines of code. DocuMind already mounts transports directly. | Direct `StreamableHTTPServerTransport` mount |
| `convict` / `nconf` for config | Schema-heavy config frameworks designed for complex multi-environment apps. Single-tenant daemon with Docker `ENV` injection needs `dotenv` + plain object, not a config DSL. | `dotenv` + `process.env` |
| Pre-copying `node_modules` from host into image | Compiled native addon binaries are architecture-specific. Copying macOS-compiled `better_sqlite3.node` into a Linux container will fail. | Always run `npm ci` inside the builder stage |

---

## Installation

```bash
# New runtime dependencies
npm install simple-git dotenv

# New dev dependency
npm install -D @godaddy/terminus
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
| ----------- | ----------- | ----------------------- |
| `node:22-bookworm-slim` | `node:20-bookworm-slim` | If existing CI/CD is pinned to Node 20 and cannot be updated. Node 22 is preferred — it is Active LTS and eliminates some Node-version CVEs. |
| `simple-git` | `isomorphic-git` | Only if DocuMind needs to run in a browser context (never) or needs git operations without a native git CLI installed. Not applicable in Docker. |
| `@godaddy/terminus` | Manual SIGTERM handler | Acceptable if keeping dependencies minimal. Requires ~80 lines of careful manual implementation to match terminus behavior. Not worth the risk for a system with SQLite WAL. |
| `dotenv` | Node `--env-file` flag (native, Node 20.6+) | For config loading in scripts invoked via `node --env-file .env script.mjs`. Cannot be used programmatically from inside `server.mjs` at module load time — dotenv covers both CLI and programmatic use. |
| Single `node:22-bookworm-slim` for both stages | Separate `node:22-bookworm` (full) for builder | Full Debian image in builder is not needed. `node:22-bookworm-slim` with `apt-get install python3 make g++` in the builder stage is sufficient and keeps both stages on the same base. |

---

## Version Compatibility

| Package | Compatible With | Notes |
| ------- | --------------- | ----- |
| `better-sqlite3@^12.6.2` | `node:22-bookworm-slim` | Prebuilt binaries available for Node 22 / N-API 131. No compilation from source needed in builder stage (prebuilt binary downloaded during `npm ci`). |
| `better-sqlite3@^12.6.2` | `node:24-*` | INCOMPATIBLE. N-API 137 binaries missing. Node 24 V8 API changes break compilation from source. Do not use Node 24 until better-sqlite3 publishes Node 24 prebuilts. |
| `simple-git@^3.33.0` | `node@>=20` | No native bindings. Requires git CLI available at runtime. |
| `@godaddy/terminus@^4.12.1` | `express@5.x` | Wraps the `http.Server` instance, not the Express app — compatible with Express 5. |
| `docker/build-push-action@v6` | `docker/setup-buildx-action@v3` | Must use Buildx for multi-platform builds. Both actions required together. |

---

## Sources

- [WiseLibs/better-sqlite3 Discussion #1270](https://github.com/WiseLibs/better-sqlite3/discussions/1270) — Alpine vs Debian: community consensus that Debian slim is correct for better-sqlite3 (MEDIUM confidence)
- [WiseLibs/better-sqlite3 Issue #1384](https://github.com/WiseLibs/better-sqlite3/issues/1384) — Node 24 / N-API 137 prebuilt binaries missing (HIGH confidence — open upstream issue)
- [Docker Hub node:22-bookworm-slim](https://hub.docker.com/layers/library/node/22-bookworm-slim/) — Confirmed Active LTS tag exists (HIGH confidence)
- [MCP Specification 2025-03-26 — Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — Streamable HTTP current standard, SSE deprecated (HIGH confidence — official spec)
- [GitHub Publishing Docker Images docs](https://docs.github.com/en/actions/publishing-packages/publishing-docker-images) — GHCR workflow pattern with GITHUB_TOKEN (HIGH confidence — official docs)
- [Node Best Practices — Graceful Shutdown](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/docker/graceful-shutdown.md) — SIGTERM handling, terminus recommendation (MEDIUM confidence)
- [godaddy/terminus GitHub](https://github.com/godaddy/terminus) — API reference for createTerminus (MEDIUM confidence)
- [simple-git npm](https://www.npmjs.com/package/simple-git) — v3.33.0 confirmed current (MEDIUM confidence — search result, not direct npm page fetch)
- [Express Healthcheck and Graceful Shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html) — Official Express guidance confirming node direct exec over npm for SIGTERM (HIGH confidence — official Express docs)
- [How to Run SQLite in Docker](https://oneuptime.com/blog/post/2026-02-08-how-to-run-sqlite-in-docker-when-and-how/view) — Named volume pattern for SQLite persistence (MEDIUM confidence)

---

*Stack research for: DocuMind v3.2 — Docker + MCP HTTP + git-clone + GHCR*
*Researched: 2026-03-23*
