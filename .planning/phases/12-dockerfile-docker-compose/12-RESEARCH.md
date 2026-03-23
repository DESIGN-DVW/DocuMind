# Phase 12: Dockerfile + Docker Compose — Research

**Researched:** 2026-03-23
**Domain:** Docker containerization of a Node.js daemon with native SQLite (better-sqlite3), graceful shutdown, named volumes, non-root user, health check
**Confidence:** HIGH

---

## Summary

Phase 12 creates three new files — `Dockerfile`, `docker-compose.yml`, and `.dockerignore` — and adds SIGTERM/SIGINT handlers to the already-running `daemon/server.mjs`. No other existing code changes. The foundation is already solid: Phase 11 verified that `config/env.mjs` centralises all runtime config and `daemon/server.mjs` reads `PORT`, `DB_PATH`, and `REPOS_DIR` from it. The remaining work is purely Docker packaging.

The two decisions that override all others for this phase: (1) base image must be `node:22-bookworm-slim` — not Alpine, not Node 24; (2) the container CMD must be `CMD ["node", "daemon/server.mjs"]` — not npm, not PM2. Both are locked by `better-sqlite3`'s native module constraints and Docker signal propagation requirements documented in the milestone-level research.

The current `daemon/server.mjs` has zero SIGTERM handlers. It calls `app.listen(PORT, ...)` but never calls `server.close()` or `db.close()` on shutdown. Adding those is the only code change in this phase. The `/health` endpoint exists and returns `200 OK` — it just needs a DB liveness probe added (`SELECT 1`) so the Docker HEALTHCHECK reflects actual DB availability, not just process uptime.

**Primary recommendation:** Write the Dockerfile as a two-stage build (builder compiles native modules, runtime is clean), use a named Docker volume for SQLite (not a bind mount from macOS), add SIGTERM handler to server.mjs, and set `CHOKIDAR_USEPOLLING=true` in the compose file.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCK-01 | Multi-stage Dockerfile using node:22-bookworm-slim base | Multi-stage pattern documented in STACK.md; bookworm-slim required for better-sqlite3 glibc dependency — confirmed by upstream issues and PITFALLS.md |
| DOCK-02 | .dockerignore excludes node_modules, .git, data/, .planning/ | Standard Docker build hygiene; without it the build context includes data/documind.db (potentially hundreds of MB) — PITFALLS.md performance traps |
| DOCK-03 | Container runs as non-root user | Security requirement; groupadd/useradd pattern confirmed in STACK.md Dockerfile example |
| DOCK-04 | SIGTERM/SIGINT triggers graceful shutdown (close DB, drain requests) | server.mjs confirmed to have ZERO signal handlers currently; must add before Docker stop will complete cleanly in < 5 seconds; WAL checkpoint required |
| DOCK-05 | /health endpoint returns container status for Docker HEALTHCHECK | `/health` endpoint exists in server.mjs (line 59); needs DB liveness probe added; curl-based HEALTHCHECK pattern confirmed in STACK.md |
| DOCK-06 | Named volume for SQLite DB persists across container restarts | Named Docker volume (not bind mount) required for WAL mode correctness on Docker Desktop for Mac — PITFALLS.md Pitfall 2 |
| DOCK-07 | docker-compose.yml starts daemon with volume-mount mode | docker-compose.yml pattern with named volume + env vars documented in STACK.md and ARCHITECTURE.md |
</phase_requirements>

---

## Standard Stack

### Core

| Library/Tool | Version | Purpose | Why Standard |
|---|---|---|---|
| `node:22-bookworm-slim` | Docker tag `22-bookworm-slim` | Base image for builder and runtime stages | Active LTS; bookworm = Debian 12 with glibc; `better-sqlite3` prebuilt N-API 131 binaries work without build tools in runtime stage |
| `dumb-init` | via apt: `dumb-init` | PID 1 signal forwarder | Node.js as PID 1 does not correctly handle signals; dumb-init receives SIGTERM from Docker, forwards to Node (PID 2), reaps zombies |
| `curl` | via apt (runtime stage) | HEALTHCHECK probe | Docker HEALTHCHECK runs `curl -f http://localhost:9000/health`; must be installed in the runtime image |
| `python3 make g++` | via apt (builder stage only) | Native addon compilation | `better-sqlite3` requires node-gyp build tools in the builder stage; not needed in runtime stage |

### No New npm Dependencies Required

Phase 12 is infrastructure-only. All runtime code changes (SIGTERM handler, DB liveness probe) use only Node.js built-ins and existing `better-sqlite3` / `express` APIs. The milestone STACK.md listed `@godaddy/terminus` as a graceful shutdown option, but the simpler `process.on('SIGTERM', ...)` pattern is sufficient for Phase 12's scope — terminus is a Phase 14 concern if MCP HTTP transport needs full drain semantics.

| Decision | Rationale |
|---|---|
| No `@godaddy/terminus` in Phase 12 | Phase 12 scope is Dockerfile + compose; manual SIGTERM handler + `server.close()` + `db.close()` is sufficient and keeps this phase focused. Terminus can be added in Phase 14 when MCP HTTP drain semantics are needed. |
| No `dotenv` in Phase 12 | Phase 11 already ships `process.loadEnvFile()` via `config/env.mjs`. Docker injects env vars directly; no dotenv import needed. |

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```text
DocuMind/
├── Dockerfile              # Multi-stage: builder + runtime
├── docker-compose.yml      # Volume-mount mode (Phase 12 scope)
├── .dockerignore           # Excludes node_modules, .git, data/, .planning/
└── daemon/
    └── server.mjs          # MODIFIED: add SIGTERM handler + DB liveness to /health
```

### Pattern 1: Multi-Stage Dockerfile

**What:** Builder stage installs all build deps + compiles native modules; runtime stage copies compiled node_modules only, has no build tools.

**When to use:** Any Node.js image with native C++ addons (better-sqlite3, sharp, canvas, etc.)

**Why two stages on the same base:** Using `node:22-bookworm-slim` for both stages means the N-API version matches exactly. The compiled `better_sqlite3.node` binary built against Node 22 / glibc on Debian 12 will work in the runtime stage because it is the same OS and the same Node version.

```dockerfile
# Source: STACK.md Dockerfile pattern + official Docker Node.js best practices
# Stage 1: builder — installs build tools, compiles native modules
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# Stage 2: runtime — clean image with only runtime tools
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y \
    dumb-init curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user before copying files
RUN groupadd -r documind && useradd -r -g documind -d /app documind

# Copy compiled node_modules (includes better_sqlite3.node binary)
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=documind:documind . .

# Remove any accidentally baked DB or .env files
RUN rm -f data/documind.db .env

USER documind

EXPOSE 9000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:9000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "daemon/server.mjs"]
```

### Pattern 2: SIGTERM Handler in server.mjs

**What:** Capture the return value of `app.listen()` as `server`, then register SIGTERM/SIGINT handlers that close the HTTP server, checkpoint the WAL, and close the DB before exiting.

**When to use:** Any Node.js HTTP server running as the primary process in a Docker container.

**Critical:** `app.listen()` returns an `http.Server` instance. The current server.mjs calls `app.listen(PORT, () => { ... })` and discards the return value. It must be captured to call `server.close()`.

```javascript
// daemon/server.mjs — change at server start section
// BEFORE (current):
app.listen(PORT, () => {
  console.log(`DocuMind v2.0 listening on port ${PORT}`);
  initScheduler(db, ROOT, ctx);
  initWatcher(db, ROOT, ctx);
});

// AFTER:
const server = app.listen(PORT, () => {
  console.log(`DocuMind v2.0 listening on port ${PORT}`);
  initScheduler(db, ROOT, ctx);
  initWatcher(db, ROOT, ctx);
});

function shutdown(signal) {
  console.error(`[DocuMind] ${signal} received — shutting down gracefully`);
  server.close(() => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    } catch (_) {}
    process.exit(0);
  });
  // Force exit after 5 seconds if drain takes too long
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

### Pattern 3: DB Liveness in /health

**What:** Add a `SELECT 1` probe inside the `/health` handler so the Docker HEALTHCHECK fails if SQLite is corrupted or unreachable, not just if the process is alive.

```javascript
// daemon/server.mjs — modify existing /health handler
app.get('/health', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();  // DB liveness check
    res.json({ status: 'ok', version: '2.0.0', uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});
```

### Pattern 4: docker-compose.yml (Volume-Mount Mode)

**What:** Named volume for SQLite persistence, bind mount for host repos (read-only), env vars for runtime config, polling mode for chokidar.

```yaml
# Source: STACK.md docker-compose pattern
services:
  documind:
    build: .
    ports:
      - "9000:9000"
    volumes:
      - documind_data:/app/data
      - /Users/Shared/htdocs/github/DVWDesign:/repos:ro
    environment:
      DOCUMIND_REPOS_DIR: /repos
      CHOKIDAR_USEPOLLING: "true"
      CHOKIDAR_INTERVAL: "2000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 30s

volumes:
  documind_data:
```

**Key choices explained:**
- `documind_data:/app/data` is a named volume (not `./data:/app/data` bind mount) — WAL mode requires named volumes on Docker Desktop for Mac
- `/repos:ro` bind mount is read-only — DocuMind reads repos, never writes them back
- `CHOKIDAR_USEPOLLING=true` is required for file change detection on Docker Desktop for Mac bind mounts (inotify does not fire across VirtioFS layer)
- `start_period: 30s` gives the daemon time to load the profile and initialize the DB before health checks begin

### Pattern 5: .dockerignore

```text
# Source: PITFALLS.md performance traps + DOCK-02 requirement
node_modules
.git
data
.planning
.env
*.db
*.db-wal
*.db-shm
dashboard/diagrams.html
```

**Why `data/` not `data/*.db`:** Excludes the entire data directory including any WAL files. The DB is never baked into the image — it lives in the named volume.

### Anti-Patterns to Avoid

- **`FROM node:22-alpine`:** musl libc breaks `better-sqlite3` glibc-linked binaries. Results in `fcntl64: symbol not found` at runtime.
- **`FROM node:24-*`:** N-API 137 binaries missing from better-sqlite3 prebuilts; source compilation fails with deprecated V8 API errors.
- **`CMD ["npm", "start"]` or `CMD ["npm", "run", "daemon:dev"]`:** npm does not forward SIGTERM to its child Node process. `docker stop` will always hit the 10-second SIGKILL timeout.
- **`CMD ["pm2", "start", "ecosystem.config.cjs"]`:** PM2 daemon process exits immediately → container exits with code 0 immediately after start.
- **`./data:/app/data` bind mount (macOS host):** WAL mode + Docker Desktop VirtioFS = intermittent `SQLITE_BUSY` / WAL corruption. Use a named volume.
- **Copying `node_modules` from host into image via `COPY . .` before `.dockerignore` excludes it:** Copies macOS-compiled `better_sqlite3.node` that will crash on Linux.
- **`ENV GITHUB_TOKEN=...` or `ARG GITHUB_TOKEN` in Dockerfile:** Credentials baked into image layers visible via `docker history --no-trunc`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| PID 1 signal handling | Custom PID 1 shell script that catches signals | `dumb-init` via apt | Node as PID 1 silently ignores unregistered signals; dumb-init is the established, tested solution |
| HTTP server drain on shutdown | Manual request counting + timer loops | `server.close(callback)` | Node's built-in `http.Server.close()` stops accepting new connections and calls callback when all in-flight requests complete |
| SQLite WAL checkpoint on shutdown | Custom WAL file detection + checkpoint logic | `db.pragma('wal_checkpoint(TRUNCATE)')` then `db.close()` | better-sqlite3's built-in pragmas handle WAL state correctly |
| Health check endpoint | Custom health framework | The existing `/health` endpoint + `SELECT 1` probe | Already exists; just needs DB liveness added |
| Build context exclusions | Manual `COPY` of each included directory | `.dockerignore` | Industry standard; avoids sending node_modules + .git + data to Docker daemon |

**Key insight:** Every problem in this phase has a one-line or built-in solution. The instinct to write a custom `docker-entrypoint.sh` or a health check library is wrong for Phase 12's scope — entrypoint scripting is Phase 13 (git-clone mode).

---

## Common Pitfalls

### Pitfall 1: better-sqlite3 "Module Not Found" After Container Start

**What goes wrong:** Container builds successfully but crashes at startup with `Error: Cannot find module './build/Release/better_sqlite3.node'` or `invalid ELF header`.

**Why it happens:** The host's pre-compiled macOS `.node` binary ended up in the image (`.dockerignore` missing or wrong), or Alpine was used as the base (musl vs. glibc mismatch).

**How to avoid:** `.dockerignore` must exclude `node_modules/` from the build context. The builder stage runs `npm ci` inside the container — this downloads and compiles `better_sqlite3.node` for Linux glibc. The runtime stage `COPY --from=builder /app/node_modules ./node_modules` copies the Linux-built binary.

**Warning signs:** Build log shows "Sending build context" with a large size (> 50MB means node_modules were included). Container crashes immediately with native module error.

### Pitfall 2: `docker stop` Takes 10 Seconds (Force Kill)

**What goes wrong:** `docker stop documind` hangs for 10 seconds then kills the container with SIGKILL (exit code 137). The SQLite WAL file is left in an inconsistent state.

**Why it happens:** `daemon/server.mjs` currently has zero SIGTERM handlers. When Docker sends SIGTERM, Node.js ignores it (no handler registered) and Docker waits 10 seconds before sending SIGKILL.

**How to avoid:** Add `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)` handlers that call `server.close()` and `db.close()`. The shutdown should complete in < 1 second under normal conditions. The 5-second safety timer ensures it never blocks longer than Docker's timeout even if connections are stuck.

**Verification:** `time docker stop documind` should complete in < 5 seconds. Container exit code should be 0, not 137.

### Pitfall 3: WAL Corruption on macOS Bind Mounts

**What goes wrong:** DB works fine during development (macOS PM2 mode) but fails intermittently in Docker with `SQLITE_BUSY: database is locked` errors that never clear, or `PRAGMA integrity_check` reports errors after container restart.

**Why it happens:** `db.pragma('journal_mode = WAL')` is set in `daemon/server.mjs` (line 49). WAL mode requires shared memory locking semantics that Docker Desktop's VirtioFS layer does not provide for bind mounts from macOS.

**How to avoid:** Use a named Docker volume (`documind_data:/app/data`) not a bind mount (`./data:/app/data`). Named Docker volumes are managed by Docker's overlay2 storage driver on the Linux VM — these behave as local filesystems and WAL works correctly.

**Warning signs:** `./data:/app/data` in docker-compose.yml volumes section. `-wal` file present after container stops.

### Pitfall 4: Chokidar Silent on Volume-Mounted Repos

**What goes wrong:** File watcher starts without errors ("Ready. Monitoring X patterns") but never fires any events when markdown files are edited on the macOS host.

**Why it happens:** Linux inotify events do not propagate through Docker Desktop's VirtioFS bind mount layer. The watcher uses inotify by default.

**How to avoid:** Set `CHOKIDAR_USEPOLLING=true` and `CHOKIDAR_INTERVAL=2000` in the docker-compose `environment:` block. The watcher in `daemon/watcher.mjs` already reads these environment variables (chokidar respects them automatically via the `CHOKIDAR_USEPOLLING` env convention — no code change needed if chokidar reads `process.env`).

**Verification check:** Confirm `daemon/watcher.mjs` passes `usePolling: process.env.CHOKIDAR_USEPOLLING === 'true'` to the chokidar `watch()` call. If it does not, add that option during this phase.

### Pitfall 5: Image Over 400MB (Success Criterion)

**What goes wrong:** `docker build` produces an image > 400MB, failing DOCK success criterion 4.

**Why it happens:** Build tools (`python3 make g++`) left in the runtime stage, or `node_modules` includes dev dependencies.

**How to avoid:** Multi-stage build ensures build tools stay in the builder stage only. The runtime stage `apt-get` installs only `dumb-init` and `curl`. The builder stage runs `npm ci` (installs all deps to compile native modules), but the runtime stage uses `COPY --from=builder /app/node_modules ./node_modules` — this copies the full node_modules including dev deps. To exclude dev deps from the image, use `npm ci --omit=dev` in the builder stage OR add a `npm prune --omit=dev` step.

**Expected sizes:** `node:22-bookworm-slim` = ~80MB; node_modules (prod only) = ~150-200MB; app code = ~5MB. Total should be ~250-280MB.

### Pitfall 6: Build Context Too Large (Success Criterion 4)

**What goes wrong:** `docker build` sends hundreds of MB to the Docker daemon because `data/documind.db`, `node_modules/`, or `.git/` are included in the build context.

**How to avoid:** `.dockerignore` must be written BEFORE running `docker build`. The critical exclusions are `node_modules`, `data`, `.git`, `.planning`. Verify with `docker build --progress=plain 2>&1 | grep "transferring context"` — the build context size should be under 10MB.

---

## Code Examples

Verified patterns from milestone research and codebase analysis:

### Capturing server reference for shutdown

```javascript
// daemon/server.mjs — the critical pattern
// app.listen() returns an http.Server instance; capture it
const server = app.listen(PORT, () => {
  console.log(`DocuMind v2.0 listening on port ${PORT}`);
  initScheduler(db, ROOT, ctx);
  initWatcher(db, ROOT, ctx);
});
```

### Complete shutdown handler

```javascript
// Source: PITFALLS.md Pitfall 4 + Node.js best practices
function shutdown(signal) {
  console.error(`[DocuMind] ${signal} received — shutting down gracefully`);
  server.close(() => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    } catch (_) {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

### Non-root user creation in Dockerfile

```dockerfile
# Source: STACK.md Dockerfile example
# Must happen BEFORE COPY so files can be chowned correctly
RUN groupadd -r documind && useradd -r -g documind -d /app documind
COPY --chown=documind:documind . .
USER documind
```

### Verifying non-root at runtime

```bash
# Success criterion 5: output must NOT be "root"
docker run --rm <image> whoami
# Expected output: documind
```

### Verifying image size

```bash
docker images ghcr.io/dvwdesign/documind:latest --format "{{.Size}}"
# Must be < 400MB
```

### Verifying SIGTERM shutdown time

```bash
time docker stop documind
# Must complete in < 5 seconds; exit code must be 0
docker inspect documind --format='{{.State.ExitCode}}'
# Must be 0, not 137
```

---

## State of the Art

| Old Approach | Current Approach | Impact on Phase 12 |
|---|---|---|
| `pm2-runtime` in Docker | `node` directly + `dumb-init` | CMD is `["dumb-init", "--", "node", "daemon/server.mjs"]`; ecosystem.config.cjs is irrelevant inside container |
| `node:alpine` for small images | `node:22-bookworm-slim` | +30MB vs Alpine but eliminates entire class of native module failures; non-negotiable for better-sqlite3 |
| `CMD ["npm", "start"]` | `CMD ["node", "daemon/server.mjs"]` | npm swallows SIGTERM; direct node exec is the documented correct pattern |
| No SIGTERM handler | `process.on('SIGTERM', ...)` with WAL checkpoint | Required for `docker stop` < 5s success criterion and WAL integrity |
| bind mount `./data:/app/data` | Named Docker volume `documind_data:/app/data` | WAL mode safety on Docker Desktop for Mac |
| Single-stage Dockerfile | Multi-stage (builder + runtime) | build tools excluded from final image; smaller + more secure image |

**Deprecated/outdated:**
- `pm2-runtime` in containers: PM2 docs themselves recommend running without PM2 inside Docker; use `dumb-init` + direct `node` exec
- `node:latest` tag: tracks Node.js majors; Node 24 currently breaks better-sqlite3 — never use `latest` in production Dockerfile

---

## Open Questions

1. **Does `daemon/watcher.mjs` already pass `usePolling` from `CHOKIDAR_USEPOLLING`?**
   - What we know: The file uses chokidar `watch()`. PITFALLS.md says to set the env var.
   - What's unclear: Whether the current `watcher.mjs` code already reads `CHOKIDAR_USEPOLLING` or hardcodes `usePolling: false`.
   - Recommendation: Read `daemon/watcher.mjs` in Wave 1 before writing docker-compose.yml. If it doesn't read the env var, add `usePolling: process.env.CHOKIDAR_USEPOLLING === 'true'` to the `watch()` options in the same plan that writes docker-compose.yml.

2. **Should `npm ci --omit=dev` in the builder stage, or full `npm ci` + prune?**
   - What we know: Runtime stage only needs production deps. Dev deps (markdownlint-cli2, mermaid-cli, jsdoc, etc.) add ~50-80MB.
   - What's unclear: Whether any "dev" dep is actually imported at runtime (some projects accidentally import dev-only packages).
   - Recommendation: Use `npm ci` (full install) in builder so native modules compile with all available tooling, then add `RUN npm prune --omit=dev` as a second step before copying to runtime stage. Safer than `--omit=dev` at install time.

3. **Profile loading at container startup — will the default profile path work?**
   - What we know: `server.mjs` calls `loadProfile()` which reads `DOCUMIND_PROFILE` (defaults to `config/profiles/dvwdesign.json`). That file has macOS-absolute paths for `repoRoots`.
   - What's unclear: Whether the planner should address this in Phase 12 or defer to Phase 13.
   - Recommendation: Phase 12's docker-compose.yml should set `DOCUMIND_REPOS_DIR=/repos` so context/loader.mjs uses `discoverRepos()` instead of the profile's hardcoded paths. Document this in the compose file comments. The Phase 13 work (volume-mount ingestion) will fully address it.

---

## Sources

### Primary (HIGH confidence)

- `.planning/research/STACK.md` — Dockerfile multi-stage pattern, base image decision, CMD pattern, docker-compose.yml volume pattern
- `.planning/research/PITFALLS.md` — All 8 Docker pitfalls including WAL corruption, Alpine failure, SIGTERM, chokidar polling, PM2 anti-pattern
- `.planning/research/ARCHITECTURE.md` — Component modification list, graceful shutdown code pattern, dumb-init rationale
- `daemon/server.mjs` (codebase) — Confirmed: zero SIGTERM handlers, `app.listen()` return value discarded, WAL pragma at line 49, `/health` exists at line 59
- `.env.example` (codebase) — All DOCUMIND_* env vars documented; Phase 11 complete
- `.planning/phases/11-foundation/11-VERIFICATION.md` — Phase 11 verified; `config/env.mjs` wiring confirmed for PORT, DB_PATH, REPOS_DIR

### Secondary (MEDIUM confidence)

- `better-sqlite3` Discussion #1270 — Debian slim vs Alpine: maintainer confirms Debian slim required (cited in PITFALLS.md + STACK.md)
- `better-sqlite3` Issue #1384 — Node 24 N-API incompatibility (cited in STACK.md)
- Express official docs — `app.listen()` returns `http.Server`; `server.close(callback)` drains connections
- Node.js Best Practices (goldbergyoni) — `CMD ["node", ...]` not npm; SIGTERM handling pattern

---

## Metadata

**Confidence breakdown:**

- Standard stack (base image, dumb-init): HIGH — locked by upstream better-sqlite3 constraints; multiple sources agree
- Architecture (multi-stage pattern, shutdown handler): HIGH — verified against actual server.mjs code; no unknowns
- Pitfalls (WAL, chokidar, SIGTERM): HIGH — sourced from codebase analysis + upstream issue trackers
- Open question on watcher.mjs polling: MEDIUM — flagged for Wave 1 inspection

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (Docker + Node.js base image landscape; better-sqlite3 Node 24 compat may resolve sooner)
