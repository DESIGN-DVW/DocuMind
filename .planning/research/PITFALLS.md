# Pitfalls Research

**Domain:** Dockerizing DocuMind — Node.js daemon with native SQLite, filesystem watchers, MCP stdio, git-clone ingestion, GHCR publishing
**Researched:** 2026-03-23
**Confidence:** HIGH (codebase analysis + official docs) / HIGH (better-sqlite3 Alpine issues) / HIGH (WAL + Docker) / HIGH (MCP stdio constraint)

---

## Critical Pitfalls

### Pitfall 1: better-sqlite3 Fails to Install on Alpine Linux

#### What goes wrong:

`better-sqlite3` is a native C++ addon. Alpine Linux uses musl libc instead of glibc. The prebuilt binaries that ship with the npm package are compiled against glibc. On Alpine, npm falls back to compiling from source via `node-gyp`, which requires Python 3, gcc, g++, and make — none of which are present in `node:alpine` by default. Without these build tools, `npm install` fails with errors like "No prebuilt binaries found" or `node-gyp` compilation errors. On Node.js 24+, there are additional V8 API deprecation errors during compilation even on Debian.

#### Why it happens:

Alpine is popular for Docker images because it produces smaller images (~5MB base vs. ~70MB for Debian slim). Developers reach for Alpine first without checking whether their native modules support musl. The better-sqlite3 maintainers explicitly recommend Debian slim for Docker use. The musl vs. glibc incompatibility is a known, documented issue — not a bug that will be fixed.

#### How to avoid:

Use `node:22-bookworm-slim` (Debian) as the base image. Do not use `node:alpine` or `node:22-alpine`. The Debian slim image is ~80MB (vs. ~5MB for Alpine), but "just works" with better-sqlite3's prebuilt binaries. No build tools required. If image size is critical, use a multi-stage build: builder stage installs with Debian (compiles native module), production stage copies only `node_modules` and app code. Verify the exact Node.js version used in the image matches the version better-sqlite3 was built against — mismatches cause "invalid ELF header" or "NODE_MODULE_VERSION" errors.

```dockerfile

# Correct — use Debian slim

FROM node:22-bookworm-slim

# Wrong — will fail for better-sqlite3

FROM node:22-alpine

```

## Warning signs:

- `npm install` in Docker build shows "No prebuilt binaries found for..." with `libc=musl`

- Build stage succeeds but container crashes with `Error: Cannot find module './build/Release/better_sqlite3.node'`

- `npm install` succeeds but the `.node` binary is for a different architecture (happens when host-built `node_modules` is copied into the container)

- Error: `Error relocating better_sqlite3.node: fcntl64: symbol not found` on Alpine

## Phase to address:

Dockerfile foundation phase — this is the first decision made when writing the Dockerfile. Wrong base image choice poisons everything downstream and requires a full rebuild.

---

### Pitfall 2: SQLite WAL Mode Corrupts the Database on Docker Volume Mounts

#### What goes wrong:

DocuMind already has `db.pragma('journal_mode = WAL')` in `daemon/server.mjs` (line 56), `daemon/mcp-server.mjs` (line 31), and `scripts/db/init-database.mjs` (line 47). WAL mode requires all processes accessing the database to share a small block of memory (the wal-index / `-shm` file). The SQLite documentation states explicitly: "WAL does not work over a network filesystem. This is because WAL requires all processes to share a small amount of memory and processes on separate host machines obviously cannot share memory with each other."

Docker volume mounts — especially Docker Desktop on macOS (which runs Linux inside a VM), NFS-backed volumes, and any volume shared across containers — violate this requirement. Symptoms range from `SQLITE_BUSY: database is locked` errors that never clear, to silent write loss, to full database corruption of the `-shm` and `-wal` files.

#### Why it happens:

On the macOS dev machine, WAL mode works perfectly because the DB lives on a local filesystem (`/Users/Shared/htdocs/github/DVWDesign/DocuMind/data/documind.db`). The developer tests locally with WAL mode on, then Dockerizes. In Docker, the DB is on a bind mount or named volume. On Docker Desktop for Mac, the bind mount goes through a VirtioFS translation layer — not a true local filesystem from Linux's perspective. The WAL shared memory locking semantics break silently or intermittently.

#### How to avoid:

Two options, ordered by preference:

1. **Named Docker volume (preferred for persistence):** Use a named Docker volume (`type: volume`) rather than a bind mount (`type: bind`) for the `data/` directory. Named Docker volumes are managed by Docker's storage driver (overlay2) on the Linux host — these do behave as local filesystems and WAL mode works correctly. Bind mounts from macOS hosts via Docker Desktop do not.

2. **Switch to DELETE journal mode for bind-mount scenarios:** If bind mounts are required (e.g., the user wants to inspect the DB on the host with a SQLite browser), disable WAL: `PRAGMA journal_mode=DELETE`. DELETE mode is slightly slower for write-heavy workloads but is safe on any filesystem. For DocuMind's read-heavy access pattern, the performance difference is negligible.

Add an environment variable `DOCUMIND_WAL_MODE=true/false` that controls whether WAL is enabled at startup. Default to `true` on direct Node.js runs, `false` or auto-detect when running in Docker with a bind mount.

```yaml

# docker-compose.yml — named volume (WAL-safe)

volumes:

  - documind_data:/app/data   # named volume — WAL works

# Wrong — bind mount from macOS host (WAL corrupts)

volumes:

  - ./data:/app/data

```

## Warning signs:

- `SQLITE_BUSY: database is locked` errors that persist even with no other DB connections open

- The `-wal` file grows unboundedly (never checkpointed)

- Database works fine on macOS dev but fails intermittently in Docker

- `PRAGMA integrity_check` reports errors after a container restart

## Phase to address:

Dockerfile + docker-compose foundation phase. The volume strategy must be established before writing any DB initialization code for the container. Changing volume type after the fact is a data migration.

---

### Pitfall 3: Hardcoded macOS Paths Survive Into the Container

#### What goes wrong:

DocuMind has macOS-specific absolute paths hardcoded in at least 10 files: `config/constants.mjs` exports `LOCAL_BASE_PATH = '/Users/Shared/htdocs/github/DVWDesign'`, `processors/tree-processor.mjs` sets `REPOS_ROOT = '/Users/Shared/htdocs/github/DVWDesign'` (line 12), `scripts/scan/enhanced-scanner.mjs` has 14 hardcoded repo paths, `scripts/watch-and-index.mjs` has `BASE_PATH`, and `daemon/server.mjs` falls back to the macOS path (line 50). These paths do not exist inside a Linux container. Every scan, watcher, and processor that reads from these paths will silently find no files or crash with ENOENT.

#### Why it happens:

The system was built for a single macOS developer. "It works on Dave's machine" was acceptable until Dockerization. The context profile system partially solves this (profile JSON defines `repoRoots`), but the hardcoded fallbacks and constants file are independent codepaths that bypass the profile. The enhanced-scanner in particular reads from a static array, not the profile.

#### How to avoid:

Audit every hardcoded path before writing a single line of Dockerfile. The fix has three layers:

1. **Eliminate `LOCAL_BASE_PATH` fallbacks in daemon code.** `daemon/server.mjs` line 50 should fail loudly if no profile is loaded, not fall back to the macOS path.

2. **Replace `REPOS_ROOT` in `tree-processor.mjs` with `ctx.repoRoots` (the profile-driven list)** — already available via context loader.

3. **Rewrite `scripts/scan/enhanced-scanner.mjs`** to read repo list from the active context profile, not the hardcoded array.

4. **Container-side path convention:** Inside the container, repos live at `/repos/<name>/` when volume-mounted or `/repos/<name>/` when git-cloned. Define this as the one true internal path — never `/Users/Shared/`.

```bash

# Host-side env var drives the container path mapping

DOCUMIND_REPOS_ROOT=/repos

```

## Warning signs:

- `npm run scan` in container completes in <1 second with 0 documents found

- Watcher starts but monitors `/Users/Shared/...` (no such path in container)

- Context profile loads correctly but enhanced-scanner still reports zero repos

- Any log line containing `/Users/Shared/` when running in a container

## Phase to address:

Pre-Docker refactor phase — must happen before writing Dockerfile. Hardcoded paths are blocking, not cosmetic. The context profile system provides the right abstraction; the task is to route all path lookups through it.

---

### Pitfall 4: MCP stdio Cannot Coexist With Container Stdout Logging

#### What goes wrong:

The existing pitfall (documented in v3.0 PITFALLS.md) of `console.log` polluting MCP stdio is amplified in Docker. In a container, `docker logs` captures everything written to stdout. When MCP stdio transport is active, stdout carries JSON-RPC 2.0 messages. Any `console.log` in any imported module writes non-JSON to stdout before DocuMind can redirect it. The daemon code has 55 `console.log` calls across 5 files (`daemon/watcher.mjs` alone has 15). The scheduler has 21.

Additionally, in Docker, PM2 is not present — the process runs as PID 1 directly. The current `daemon/server.mjs` does not register SIGTERM handlers. When Docker sends SIGTERM to stop the container, the process does not drain in-flight requests, does not checkpoint the WAL, and does not close the SQLite connection cleanly. Docker will then send SIGKILL after 10 seconds.

#### Why it happens:

The daemon was designed as a PM2-managed process. PM2 handles signal forwarding. When running as a raw Node.js process in a container (PID 1), signal handling must be explicit. The startup command `npm start` in a Dockerfile also breaks signal propagation — npm does not forward SIGTERM to its child Node.js process.

#### How to avoid:

Two independent problems need separate solutions:

#### Stdout contamination (for stdio mode):

The MCP server entry point (`daemon/mcp-server.mjs`) must shadow `console.log` before any import: redirect to stderr. This is already flagged in v3.0 PITFALLS.md and must be verified as actually implemented before Dockerizing.

#### Graceful shutdown (for all container modes):

Add SIGTERM and SIGINT handlers to `daemon/server.mjs`:

```javascript

// In daemon/server.mjs
process.on('SIGTERM', async () => {
  console.error('[DocuMind] Received SIGTERM — shutting down...');
  server.close(() => {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    process.exit(0);
  });
});

```

In the Dockerfile, run Node directly — never via npm:

```dockerfile

# Wrong — npm does not forward SIGTERM to Node

CMD ["npm", "start"]

# Correct — Node receives SIGTERM directly

CMD ["node", "daemon/server.mjs"]

```

## Warning signs:

- `docker stop` hangs for 10 seconds then kills the container (SIGTERM not handled)

- DB `-wal` file present after container stops (incomplete checkpoint)

- MCP tool calls return parse errors intermittently when other startup log output hits stdout

- `docker logs` shows JSON-RPC frames mixed with human-readable log output

## Phase to address:

Dockerfile foundation phase (CMD instruction) and MCP dual-mode phase (stdio stdout redirect). The shutdown handler should be added in the foundation phase since it protects data integrity regardless of MCP.

---

### Pitfall 5: PM2 Inside Docker Creates a Zombie Process Manager

#### What goes wrong:

The current production setup uses PM2 (`ecosystem.config.cjs`, `npm run daemon:start`). PM2 daemonizes the process — it forks a background daemon and then the calling process exits. In Docker, when PID 1 exits, the container stops. If `pm2 start ecosystem.config.cjs` is the container's CMD, PM2 starts DocuMind in the background, then PM2's foreground process completes (exits 0), and the container immediately stops.

The workaround — `pm2-runtime` — does keep the process in the foreground, but it adds a process management layer that Docker's restart policies and health checks already provide. PM2's cluster mode and auto-restart are redundant when Docker Swarm or docker-compose handles service restarts. PM2's log rotation conflicts with Docker's log driver (json-file, fluentd). PM2's metric collection adds memory overhead.

#### Why it happens:

PM2 is the right tool for a raw VPS or macOS daemon. It is the wrong tool inside a Docker container. The transition from "daemon on macOS" to "container on Linux" requires accepting that Docker is the process supervisor.

#### How to avoid:

Do not use PM2 or pm2-runtime inside the container. Run Node.js directly as PID 1 via the `CMD` instruction. Use Docker's built-in restart policy (`restart: unless-stopped` in docker-compose) for auto-restart. Use Docker health checks for liveness. The existing `ecosystem.config.cjs` remains valid for the **macOS dev workflow** (direct PM2 usage outside Docker) — do not delete it.

```yaml

# docker-compose.yml

services:
  documind:
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

```

## Warning signs:

- `docker compose up` shows container starting then immediately stopping with exit 0

- Container shows as "Exited (0)" in `docker ps -a` immediately after start

- Container log shows "PM2 daemon started" then nothing

- Health check never runs because container exits before check interval

## Phase to address:

Dockerfile foundation phase — the CMD instruction is the first thing to get right.

---

### Pitfall 6: Chokidar File Watcher Is Silent on Docker Volume Mounts

#### What goes wrong:

`daemon/watcher.mjs` uses chokidar to watch `${REPOS_ROOT_RESOLVED}/**/*.md` and similar patterns. In Docker on macOS (Docker Desktop), the container runs inside a Linux VM. The macOS FSEvents API is not available inside the VM. The Linux inotify API is not triggered by file changes that originate on the macOS host side of a bind mount, because the changes pass through Docker Desktop's VirtioFS layer without surfacing as inotify events inside the container.

Result: the watcher starts successfully (no errors), but never fires any `add`, `change`, or `unlink` events when files are modified on the host. The watcher appears to work (logs "Ready. Monitoring X patterns") but is silent.

#### Why it happens:

This is a known Docker Desktop behavior on macOS and Windows. The virtualization layer translates filesystem access but does not reliably translate inotify signals from host to container. It affects all filesystem watchers — chokidar, nodemon, webpack dev server, Vite HMR.

#### How to avoid:

Enable polling mode for chokidar when running in Docker:

```javascript

const watcher = watch(WATCH_PATTERNS, {
  usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
  interval: parseInt(process.env.CHOKIDAR_INTERVAL || '2000'),
  persistent: true,
  ignoreInitial: true,
});

```

Set `CHOKIDAR_USEPOLLING=true` and `CHOKIDAR_INTERVAL=2000` in the docker-compose environment. This uses polling instead of inotify — CPU-heavier but reliable on all filesystems. A 2-second interval is acceptable because DocuMind's incremental hourly scan is the authoritative source; the watcher is an acceleration layer.

For git-clone mode (container clones repos itself, no bind mount), this problem does not exist — git writes occur inside the container's own filesystem, and inotify works correctly.

#### Warning signs:

- Watcher logs "Ready. Monitoring X patterns" but no `[watcher] Changed:` entries ever appear

- Editing a file on the host does not trigger re-indexing even after 10 seconds

- `CHOKIDAR_USEPOLLING` is not set in docker-compose environment

- Bind mount is from a macOS host path (not a Linux-native named volume)

#### Phase to address:

Watcher + environment config phase. Add `CHOKIDAR_USEPOLLING` as a first-class env var with a default of `false` (preserves current macOS PM2 behavior) and document that Docker users must set it to `true`.

---

### Pitfall 7: Git Clone Mode Leaks Credentials Into Image Layers

#### What goes wrong:

Git-clone ingestion mode requires cloning private GitHub repos inside the container. The naive implementation copies SSH keys or GitHub tokens into the Dockerfile with `COPY .ssh/ /root/.ssh/` or `ENV GITHUB_TOKEN=...`. Both approaches embed credentials into Docker image layers. Any intermediate layer containing the secret is permanently accessible to anyone who pulls the image — including after publishing to GHCR. `docker history` or `docker save | tar xf` exposes all layers.

Additionally, if `GITHUB_TOKEN` is passed as a build argument (`ARG GITHUB_TOKEN`), it appears in `docker history --no-trunc` output and is stored in the build cache.

#### Why it happens:

The simplest way to authenticate git clone is to put the credential in an env var or file. Developers test this locally, it works, and they push without checking whether the credential is in the image.

#### How to avoid:

For **runtime** credential passing (HTTPS token), use environment variables injected at container start, not at build time. The token is never baked into the image:

```yaml

# docker-compose.yml

environment:
  GITHUB_TOKEN: ${GITHUB_TOKEN}  # from .env on host, never in image

```

Inside the container's git-clone script, configure git to use the token at runtime:

```bash

git clone https://x-access-token:${GITHUB_TOKEN}@github.com/DESIGN-DVW/RepoName.git

```

For **build-time** SSH key access (if needed during image build), use Docker BuildKit's `--ssh` flag — SSH agent is forwarded, keys never appear in image layers:

```dockerfile

# syntax=docker/dockerfile:1

RUN --mount=type=ssh git clone git@github.com:DESIGN-DVW/RepoName.git

```

For **GHCR publishing**, ensure the published image never contains credentials. The git-clone script runs at container startup (entrypoint), not at image build time.

## Warning signs:

- `docker history --no-trunc <image>` shows any string containing a token or key

- `ENV GITHUB_TOKEN=...` or `ARG GITHUB_TOKEN` in the Dockerfile

- `COPY .ssh /root/.ssh` in the Dockerfile (copies real SSH keys into image)

- Published GHCR image allows unauthenticated pull but contains private tokens

## Phase to address:

Git-clone ingestion phase — the credential strategy must be designed before writing any git-clone code. Wrong choices here produce a security incident when the image is published.

---

### Pitfall 8: MCP stdio Transport Requires `-i` Flag in Docker but HTTP Mode Does Not

#### What goes wrong:

When Claude Code runs DocuMind's MCP server in stdio mode inside a Docker container (not the primary pattern, but possible for remote Docker-hosted MCP), the container must be started with `docker run -i` (interactive stdin). Without `-i`, the container cannot read from stdin, the MCP transport gets EOF immediately, and the server shuts down. The difference between `-i` and `-it` also matters: `-t` allocates a pseudo-TTY which can corrupt the binary JSON-RPC stream.

For HTTP mode (the primary containerized MCP mode), neither `-i` nor `-t` are needed — the container just needs the port exposed.

#### Why it happens:

stdio MCP = process communication over stdin/stdout. Docker containers, by default, redirect stdin to `/dev/null`. The `-i` flag keeps stdin open. Developers testing HTTP mode forget this distinction when switching to stdio mode or when configuring Claude Code to call a containerized MCP server.

#### How to avoid:

Design the Docker image for HTTP MCP mode as the primary containerized transport. stdio MCP remains the transport for the local macOS PM2 workflow. Document the two modes clearly:

- Local (macOS + PM2): `node daemon/mcp-server.mjs` — stdio transport, no Docker

- Containerized: Express on port 9000 with `POST /mcp` (StreamableHTTP) — HTTP transport

If stdio-in-Docker is ever needed:

```bash

docker run -i --rm ghcr.io/design-dvw/documind:latest node daemon/mcp-server.mjs

```

Note: `-i` only, never `-t` for stdio MCP.

#### Warning signs:

- MCP client reports EOF or immediate disconnect when connecting to containerized server

- Container exits immediately after `docker run` without `-i`

- Claude Code successfully connects to HTTP `/mcp` endpoint but stdio mode is non-functional in Docker

- Logs show MCP server started then "stdin closed" immediately

#### Phase to address:

MCP dual-mode phase — document the transport/deployment mapping clearly and test both modes before publishing to GHCR.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |

| -------- | ----------------- | -------------- | --------------- |

| Using `node:latest` as base image | Always current Node version | `latest` tracks Node.js majors; Node 24+ breaks better-sqlite3 until it catches up; unpredictable build failures | Never in production Dockerfile — pin to `node:22-bookworm-slim` |

| Copying host `node_modules` into image with `COPY . .` | Fast build (no re-install) | Copies macOS-compiled `.node` binaries that crash on Linux; copies `node_modules` with dev deps | Never — always `npm ci` inside the container |

| Bind mount `./data:/app/data` on macOS for DB persistence | Easy DB inspection from host | WAL mode corruption on Docker Desktop for Mac | Only acceptable if WAL mode is explicitly disabled for that mount |

| Using `CMD ["npm", "start"]` | Familiar pattern | npm does not forward SIGTERM to Node; Docker stop always force-kills after 10s timeout | Never — use `CMD ["node", "daemon/server.mjs"]` |

| Skipping `.dockerignore` | No setup effort | Build context includes `data/documind.db` (large), `node_modules/`, `.git/` — slows every build | Never — `.dockerignore` is mandatory |

| Hardcoding `REPO_URL=https://github.com/DESIGN-DVW/...` in Dockerfile | Simple | Image is tied to one org; cannot be used for other repos | Only acceptable if image is explicitly org-specific and labeled as such |

| Using `pm2-runtime` in Docker | Reuses existing PM2 config | Redundant process manager layer; PM2 logs conflict with Docker log driver; complicates health checks | Acceptable as a temporary bridge while migrating — remove before GHCR publish |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |

| ----------- | -------------- | ---------------- |

| better-sqlite3 + Docker | Using Alpine base image | Use `node:22-bookworm-slim` (Debian); prebuilt binaries work without build tools |

| better-sqlite3 + Docker | Copying host-built `node_modules` | Run `npm ci` inside the container; never copy native `.node` binaries across OS/arch |

| SQLite WAL + Docker volumes | Bind mounting `./data` from macOS host | Use named Docker volume for DB data; or switch to `journal_mode=DELETE` for bind mounts |

| chokidar + Docker | Not setting `CHOKIDAR_USEPOLLING=true` | Set via docker-compose env var; use polling for volume-mounted directories |

| MCP stdio + Docker | Running with `-it` (TTY allocated) | Use `-i` only — TTY corrupts binary JSON-RPC stream |

| GHCR + credentials | `ARG GITHUB_TOKEN` in Dockerfile | Pass token at runtime via environment variable; never bake into image |

| git-clone + SSH | `COPY .ssh /root/.ssh` in Dockerfile | Use `--mount=type=ssh` with BuildKit, or pass HTTPS token at runtime |

| SIGTERM + Docker | `CMD ["npm", "start"]` | Use `CMD ["node", "daemon/server.mjs"]` — Node receives SIGTERM directly |

| PM2 + Docker | `CMD ["pm2", "start", "ecosystem.config.cjs"]` | PM2 daemon exits immediately, killing the container — use `node` directly |

| Docker health check + Express | No `/health` endpoint | Verify `GET /health` returns 200 before registering health check in docker-compose |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |

| ---- | -------- | ---------- | -------------- |

| chokidar polling at 500ms interval on 8K-file corpus | Container CPU spikes to 100% continuously | Use 2000ms interval (`CHOKIDAR_INTERVAL=2000`); rely on hourly scan as authoritative source | Any polling interval < 1000ms with >1K watched files |

| git-clone fetching all repo history on every container start | Container startup takes minutes; CI jobs time out | Clone with `--depth=1` (shallow clone); pull with `--ff-only` on subsequent starts | Repos with years of history — DocuMind's DVWDesign repos may have deep history |

| Running full scan on container startup before serving requests | `/health` check fails during scan; load balancer marks container unhealthy | Run startup scan async; serve requests immediately; background scan completes separately | Full scan takes 30+ seconds on 8K+ documents |

| No `.dockerignore` file | Every build copies `data/documind.db` (potentially hundreds of MB) into build context | Add `.dockerignore` with `data/`, `node_modules/`, `.git/` | DB grows above 100MB — builds stall on context transfer |

| Multi-arch image not specified | Image only runs on amd64 (CI server) but not arm64 (M1/M2 Mac dev) or vice versa | Use `docker buildx build --platform linux/amd64,linux/arm64` | Deploying to arm64 Raspberry Pi or apple silicon Mac hosts |

## Security Mistakes

| Mistake | Risk | Prevention |

| ------- | ---- | ---------- |

| Publishing image to GHCR as public without auditing layers | Any hardcoded credential (token, path with usernames) becomes public | Run `docker history --no-trunc` and `docker scout` or `trivy` before making image public |

| Running container as root (Docker default) | If app is compromised, attacker has root on container; bind mounts are root-owned on host | Add `USER node` to Dockerfile after installing dependencies; use `--chown=node:node` in COPY |

| Exposing SQLite DB as a bind mount without access controls | Anyone with Docker host access can read all indexed document content | Use named Docker volume (not bind mount) for DB; set container-side file permissions to 600 |

| `GITHUB_TOKEN` in `.env` file committed to git | Token is in repo history even if file is later deleted | Add `.env` to `.gitignore`; use GitHub Actions secrets for CI; use `.env.example` without real values |

| Git-clone script trusting `REPO_URL` from environment without validation | Path traversal or clone from untrusted remote | Validate `REPO_URL` against allowlist of known GitHub org URLs before cloning |

## "Looks Done But Isn't" Checklist

- [ ] **Base image:** Dockerfile uses `node:22-bookworm-slim` — verify with `docker inspect <image> | grep Os` showing `linux` and no `alpine` in image name

- [ ] **Native module:** `docker run --rm <image> node -e "require('better-sqlite3')"` exits 0 with no error

- [ ] **WAL safety:** DB is on a named Docker volume (`docker volume ls` shows `documind_data`) OR `journal_mode` switches to DELETE for bind mounts — verify with `PRAGMA journal_mode` inside container

- [ ] **Hardcoded paths eliminated:** `docker run --rm <image> grep -r '/Users/Shared' /app/` returns no matches in production code paths

- [ ] **SIGTERM handler:** `docker stop <container>` completes in < 5 seconds (not 10s timeout kill) — verify container exit code is 0 not 137

- [ ] **Chokidar polling:** Editing a file on the host triggers watcher event within `CHOKIDAR_INTERVAL` seconds — verify in docker logs

- [ ] **No PM2 in container:** `docker exec <container> ps aux` shows `node daemon/server.mjs` as PID 1, no PM2 process

- [ ] **MCP HTTP mode:** `curl -X POST http://localhost:9000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"initialize",...}'` returns valid MCP response from container

- [ ] **No credentials in image:** `docker history --no-trunc <image>` contains no tokens, SSH keys, or `/Users/` paths

- [ ] **Health check active:** `docker inspect <container> | jq '.[0].State.Health'` shows `healthy` status after startup

- [ ] **`.dockerignore` in place:** Build context does not include `data/`, `node_modules/`, `.git/` — verify with `docker build --progress=plain 2>&1 | grep "Sending build context"` shows small size

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |

| ------- | ------------- | -------------- |

| Alpine image used; better-sqlite3 fails | LOW | Change base image to `node:22-bookworm-slim` in Dockerfile; rebuild; no data loss |

| WAL corruption on bind-mounted DB | HIGH | Stop container; run `sqlite3 documind.db 'PRAGMA integrity_check'`; if corrupt, restore from backup (migrate.mjs creates backups); switch to named volume; re-run full scan |

| Hardcoded macOS paths cause empty scan | MEDIUM | Fix `config/constants.mjs` and affected scripts to read from context profile; rebuild image; re-run `POST /scan` |

| Credentials leaked into GHCR image | HIGH | Rotate all leaked tokens immediately; delete the affected image tags from GHCR; rebuild without credentials in layers; audit all image history |

| PM2 daemon exits container immediately | LOW | Change CMD from `pm2 start` to `node daemon/server.mjs`; rebuild; no data loss |

| chokidar silent on volume mounts | LOW | Add `CHOKIDAR_USEPOLLING=true` to docker-compose environment; restart container; no data loss |

| git-clone fails with auth error | LOW | Verify `GITHUB_TOKEN` env var is set and not expired; check token has `repo` scope for private repos |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |

| ------- | ---------------- | ------------ |

| Alpine / better-sqlite3 failure | Phase 1: Dockerfile foundation | `docker run --rm <image> node -e "require('better-sqlite3')"` exits 0 |

| WAL mode corruption on volume mounts | Phase 1: Dockerfile foundation | Named volume strategy confirmed; `PRAGMA integrity_check` returns `ok` after restart |

| Hardcoded macOS paths | Phase 0: Pre-Docker refactor (before Dockerfile) | `grep -r '/Users/Shared' daemon/ processors/ config/constants.mjs` returns no results in production code |

| SIGTERM not handled | Phase 1: Dockerfile foundation | `docker stop` completes in < 5 seconds, exit code 0 |

| PM2 as CMD | Phase 1: Dockerfile foundation | `docker ps` shows container running; PID 1 is `node` |

| Chokidar silent in Docker | Phase 2: Environment config + watcher | Bind-mount file edit triggers watcher log within polling interval |

| Git credentials in image layers | Phase 3: Git-clone ingestion | `docker history --no-trunc` shows no token strings; runtime-only credential injection |

| MCP stdio `-i` vs HTTP mode | Phase 4: MCP dual-mode | HTTP mode: `POST /mcp` returns valid response. stdio mode: `docker run -i` test completes successfully |

| No `.dockerignore` | Phase 1: Dockerfile foundation | Build context size < 10MB (`.dockerignore` excludes DB and node_modules) |

## Sources

- Codebase analysis: `daemon/server.mjs` line 56 (`journal_mode = WAL` confirmed), line 50 (macOS path fallback confirmed)

- Codebase analysis: `daemon/mcp-server.mjs` line 31 (`journal_mode = WAL` in MCP server)

- Codebase analysis: `config/constants.mjs` line 42 (`LOCAL_BASE_PATH` hardcoded)

- Codebase analysis: `processors/tree-processor.mjs` line 12 (`REPOS_ROOT` hardcoded)

- Codebase analysis: `scripts/scan/enhanced-scanner.mjs` lines 22–31 (14 hardcoded absolute paths)

- Codebase analysis: `daemon/` folder — zero `SIGTERM` handlers across all 5 daemon files

- Codebase analysis: `daemon/watcher.mjs` — no `usePolling` option in `watch()` call

- better-sqlite3 Alpine recommendation: [WiseLibs/better-sqlite3 Discussion #1270](https://github.com/WiseLibs/better-sqlite3/discussions/1270) — HIGH confidence; maintainer explicitly recommends Debian slim over Alpine

- SQLite WAL + network filesystem: [SQLite WAL official docs](https://www.sqlite.org/wal.html) — HIGH confidence; official documentation: "WAL does not work over a network filesystem"

- Docker volume WAL corruption reports: [Vaultwarden SQLite corruption discussion](https://github.com/dani-garcia/vaultwarden/discussions/2965) — MEDIUM confidence; multiple user reports of WAL corruption on Docker bind mounts

- chokidar Docker polling: [chokidar Issue #1051](https://github.com/paulmillr/chokidar/issues/1051) — HIGH confidence; official chokidar repo acknowledges Docker volume mount issue; `usePolling=true` is the documented fix

- PM2 in Docker anti-pattern: [Leapcell PM2 and Docker](https://leapcell.io/blog/pm2-and-docker-choosing-the-right-process-manager-for-node-js-in-production) — MEDIUM confidence; community consensus

- PM2 official Docker guidance: [PM2 Docker Integration](https://pm2.keymetrics.io/docs/usage/docker-pm2-nodejs/) — HIGH confidence; PM2 docs themselves recommend `pm2-runtime` for Docker but acknowledge redundancy

- SIGTERM via npm: [Node.js best practices graceful shutdown](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/docker/graceful-shutdown.md) — HIGH confidence; npm does not forward SIGTERM to Node child process

- MCP stdio Docker -i flag: [Configure MCP Transport Protocols for Docker](https://mcpcat.io/guides/configuring-mcp-transport-protocols-docker-containers/) — MEDIUM confidence; `-i` required for stdin; `-t` corrupts stream

- Git credentials Docker BuildKit: [Docker BuildKit SSH mount](https://sanderknape.com/2019/06/installing-private-git-repositories-npm-install-docker/) — MEDIUM confidence; `--mount=type=ssh` prevents key leakage

- Multi-stage build for native modules: [node:22-bookworm-slim for native builds](https://prepare.sh/articles/from-dev-to-production-mastering-multi-stage-builds-and-image-optimization-with-ghcr) — MEDIUM confidence; Debian bookworm-slim confirmed for native addon compatibility

---

### Pitfalls research for: DocuMind v3.2 — Dockerization of Node.js daemon with native SQLite, filesystem watchers, MCP stdio, and git-clone ingestion

### Researched: 2026-03-23
