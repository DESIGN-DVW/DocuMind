# Architecture Research

**Domain:** Documentation Intelligence Platform — Docker Containerization + MCP HTTP Transport + Git-Clone Ingestion
**Researched:** 2026-03-23
**Confidence:** HIGH (codebase inspected directly; MCP SDK verified in installed node_modules; Docker/GHCR patterns verified via official docs)

---

## Context: What This Milestone Adds

The existing system (DocuMind v3.1) is a fully operational PM2-managed daemon. What v3.2 adds is a deployment layer that wraps everything in Docker, plus two mode changes:

**New infrastructure components (net-new files):**

- `Dockerfile` — multi-stage Node.js image; builds on `node:22-alpine`; bakes `npm ci --omit=dev`; does NOT include PM2 (Docker replaces it)
- `docker-compose.yml` — orchestrates the container with volumes, env vars, port mappings
- `.dockerignore` — excludes `node_modules`, `data/*.db`, `.git`, `.planning`
- `daemon/mcp-http.mjs` — new entry point: MCP over Streamable HTTP transport (separate from stdio)
- `processors/git-ingestor.mjs` — new processor: clone/pull repos, feed paths to existing scanner
- `config/profiles/docker.json` — Docker-specific context profile (inline `repositories` list, no external registry path)
- `.github/workflows/docker-publish.yml` — CI workflow: build + push to GHCR on tag push

**Modified existing components:**

- `daemon/server.mjs` — add graceful shutdown handlers (`SIGTERM`/`SIGINT`); add Docker health endpoint (`GET /health` already exists, add `db.prepare('SELECT 1').get()` liveness check)
- `daemon/scheduler.mjs` — replace hardcoded cron intervals with `process.env.SCAN_INTERVAL` / `FULL_SCAN_CRON` etc.
- `context/loader.mjs` — support `DOCUMIND_REPOS` env var as override for repository list when in git-clone mode
- `ecosystem.config.cjs` — unchanged for local PM2 use; Docker bypasses this file entirely

**Unchanged components (Docker just runs them):**

- All processors (`markdown-processor.mjs`, `pdf-processor.mjs`, `word-processor.mjs`, `keyword-processor.mjs`, `tree-processor.mjs`, `mermaid-processor.mjs`, `relink-processor.mjs`)
- `graph/` — relations and queries untouched
- `scripts/` — CLI tools unchanged; not in Docker image runtime path (but available if `docker exec` needed)
- `data/documind.db` — mounted as a named volume; never baked into the image

---

## Standard Architecture

### System Overview: PM2 Mode (Current, Unchanged)

```text
┌──────────────────────────────────────────────────────────┐
│                  macOS Host Machine                       │
│                                                           │
│  PM2 Process Manager                                      │
│  ┌───────────────────────────┐  ┌──────────────────────┐ │
│  │  documind (server.mjs)    │  │  documind-mcp        │ │
│  │  Express :9000            │  │  (mcp-server.mjs)    │ │
│  │  + scheduler + watcher    │  │  stdio transport     │ │
│  └───────────┬───────────────┘  └──────────────────────┘ │
│              │                                            │
│  ┌───────────▼───────────────────────────────────────┐   │
│  │  data/documind.db  (WAL, on-disk)                  │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  Repo roots: /Users/Shared/htdocs/github/DVWDesign/...   │
│  (chokidar watches these paths directly)                  │
└──────────────────────────────────────────────────────────┘
```

### System Overview: Docker Mode (v3.2 Target)

```text
┌──────────────────────────────────────────────────────────┐
│                  Host Machine                             │
│                                                           │
│  docker compose up                                        │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  DocuMind Container (node:22-alpine)                │  │
│  │                                                     │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  node daemon/server.mjs (PID 1 via dumb-init)│  │  │
│  │  │  Express :9000 + scheduler                   │  │  │
│  │  │  (no PM2, no chokidar in git-clone mode)     │  │  │
│  │  └──────────────────┬───────────────────────────┘  │  │
│  │                     │                               │  │
│  │  ┌──────────────────▼───────────────────────────┐  │  │
│  │  │  SQLite volume: /data/documind.db             │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │                                                     │  │
│  │  Repo access (choose one per deployment):           │  │
│  │  A) Volume mount: host repos → /repos in container  │  │
│  │  B) Git clone: git-ingestor.mjs pulls into /repos   │  │
│  │                                                     │  │
│  │  MCP access (choose one per client):                │  │
│  │  A) stdio: docker exec + pipe (local Claude Code)   │  │
│  │  B) HTTP: GET/POST :9001/mcp (remote consumers)     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  Named volumes:                                           │
│  - documind_data → /data (SQLite + logs)                  │
│  - documind_repos → /repos (git-clone target)             │
└──────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Status | Responsibility | Communicates With |
| --- | --- | --- | --- |
| `daemon/server.mjs` | Modified | Express :9000 + graceful shutdown + health check liveness | DB, processors, scheduler, watcher |
| `daemon/scheduler.mjs` | Modified | node-cron periodic scans; reads cron intervals from env vars | orchestrator, processors |
| `daemon/watcher.mjs` | Unchanged | chokidar file watcher (active in volume-mount mode only) | processors, notifier |
| `daemon/mcp-server.mjs` | Unchanged | MCP stdio server; 14 tools for Claude Code agents | DB, processors |
| `daemon/mcp-http.mjs` | NEW | MCP Streamable HTTP server on :9001; same tools as stdio | DB, processors (same) |
| `processors/git-ingestor.mjs` | NEW | Clone/pull git repos into /repos; trigger scan after pull | git, scanner, scheduler |
| `config/profiles/docker.json` | NEW | Context profile for Docker mode: inline repo list, /repos paths | context/loader.mjs |
| `Dockerfile` | NEW | Multi-stage build; node:22-alpine; bakes npm install | docker build |
| `docker-compose.yml` | NEW | Volumes, env vars, port map, health check, restart policy | Docker |
| `.github/workflows/docker-publish.yml` | NEW | Build + push GHCR on git tag; multi-arch (amd64 + arm64) | GitHub Actions, GHCR |

---

## Docker Integration: How PM2 Is Replaced

### PM2 in the current system

PM2 manages two processes: `documind` (server.mjs) and `documind-mcp` (mcp-server.mjs). It provides process restart on crash, log rotation, and cluster management. In a container, all of this is unnecessary:

- Docker's `restart: unless-stopped` handles crash restart
- Docker logging captures stdout/stderr
- One process per container is the container idiom

### What replaces PM2

The container runs `node daemon/server.mjs` as PID 1, wrapped with `dumb-init` to handle signal forwarding correctly. The MCP HTTP server runs as a second process started by `server.mjs` itself (not a separate PM2 app):

```text
Dockerfile CMD:
  ["dumb-init", "node", "daemon/server.mjs"]

server.mjs startup (additions):
  1. Start Express :9000 (existing)
  2. If DOCUMIND_MCP_HTTP=true: import mcp-http.mjs, start :9001
  3. Register SIGTERM handler for graceful shutdown
```

The stdio MCP server (`mcp-server.mjs`) is NOT started in Docker by default. It is only reachable via `docker exec -i documind node daemon/mcp-server.mjs`. In Docker mode, MCP consumers use HTTP instead.

### Graceful shutdown additions to server.mjs

```javascript
// daemon/server.mjs — additions only
process.on('SIGTERM', async () => {
  console.error('[server] SIGTERM received, shutting down gracefully');
  db.close();              // flush SQLite WAL
  server.close(() => {     // drain existing HTTP connections
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000); // force exit after 10s
});
```

---

## MCP HTTP Transport: Where It Sits

### Current MCP architecture

`daemon/mcp-server.mjs` uses `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`. It reads JSON-RPC from stdin, writes to stdout. Claude Code spawns it as a subprocess via `.claude/mcp.json` in each repo.

### New: Streamable HTTP transport

The installed SDK (`@modelcontextprotocol/sdk` v1.27.1) already ships `StreamableHTTPServerTransport` at:

```text
@modelcontextprotocol/sdk/server/streamableHttp.js
```

This is confirmed present in the installed node_modules. The class is `StreamableHTTPServerTransport`.

### New file: daemon/mcp-http.mjs

This is a new entry point, NOT a modification of `mcp-server.mjs`. It duplicates the tool registrations from `mcp-server.mjs` or better, imports them from a shared `daemon/mcp-tools.mjs` module (refactor opportunity, not required for v3.2 — see Anti-Patterns).

Minimal structure for `mcp-http.mjs`:

```javascript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import express from 'express';

const app = express();
app.use(express.json());

const transports = new Map(); // sessionId → transport

app.all('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  let transport;

  if (req.method === 'POST' && !sessionId) {
    // New session initialization
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    const server = new McpServer({ name: 'DocuMind', version: '3.1.0' });
    // register tools (same as mcp-server.mjs)
    await server.connect(transport);
    transports.set(transport.sessionId, transport);
  } else {
    transport = transports.get(sessionId);
    if (!transport) { res.status(404).end(); return; }
  }

  await transport.handleRequest(req, res, req.body);
});

const MCP_HTTP_PORT = process.env.DOCUMIND_MCP_HTTP_PORT || 9001;
app.listen(MCP_HTTP_PORT, () => {
  console.error(`[mcp-http] Streamable HTTP transport on :${MCP_HTTP_PORT}/mcp`);
});
```

**Why stateful mode (not stateless):** DocuMind MCP tools involve multi-step operations (lint + fix). Stateful sessions allow session context to be maintained. Stateless mode would require every call to re-initialize the DB connection — wasteful.

### How Docker exposes MCP HTTP

```yaml
# docker-compose.yml
ports:
  - "9000:9000"   # REST API
  - "9001:9001"   # MCP HTTP (only expose if remote access needed)
```

For local-only use, omit the 9001 port binding — it stays internal to the container network.

### Updated .claude/mcp.json for HTTP mode

Remote consumers configure their MCP client to use:

```json
{
  "mcpServers": {
    "documind": {
      "url": "http://localhost:9001/mcp"
    }
  }
}
```

Local Claude Code (non-Docker) continues using stdio with `command: "node daemon/mcp-server.mjs"`.

---

## Git-Clone Ingestion: How It Plugs In

### The problem it solves

In volume-mount mode, repo paths are hardcoded to `/Users/Shared/htdocs/github/DVWDesign/...` (the host machine's paths). In a CI environment or on a remote Linux server, those paths don't exist. Git-clone mode lets the container fetch repos itself.

### Where it hooks in

The ingestion point is the `context/loader.mjs` profile system. The profile already resolves `repoRoots` as an array of `{ name, path }` objects. Git-clone mode adds a step before the daemon starts:

```text
Container startup sequence (git-clone mode):

1. docker-entrypoint.sh runs git-ingestor.mjs
   → reads DOCUMIND_REPOS env var (JSON array of { name, url, branch })
   → clones each repo into /repos/{name}/ if not present
   → pulls if already present (git pull --ff-only)
   → exits 0 if all succeed, 1 if any fail
   ↓
2. node daemon/server.mjs starts
   → loads docker.json profile
   → docker.json has inline repositories: [{ name, path: "/repos/{name}" }]
   → ctx.repoRoots resolved from /repos/*
   ↓
3. scheduler.mjs runs initial scan on startup (not just on cron trigger)
   → scans /repos/* via existing scan-all-repos logic
   ↓
4. Periodic re-pull (optional): scheduler adds a git-pull cron job
   → every GIT_PULL_CRON (default: "0 * * * *") runs git pull in each /repos/{name}
   → after pull, triggers incremental scan for changed files
```

### New file: processors/git-ingestor.mjs

```javascript
// processors/git-ingestor.mjs
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const exec = promisify(execFile);
const REPOS_DIR = process.env.DOCUMIND_REPOS_DIR || '/repos';

export async function cloneOrPull(repos) {
  // repos: Array<{ name: string, url: string, branch?: string }>
  const results = [];
  for (const repo of repos) {
    const dest = path.join(REPOS_DIR, repo.name);
    const exists = await fs.access(dest).then(() => true).catch(() => false);
    if (exists) {
      const { stdout } = await exec('git', ['-C', dest, 'pull', '--ff-only']);
      results.push({ name: repo.name, action: 'pull', output: stdout.trim() });
    } else {
      const args = ['clone', '--depth=1'];
      if (repo.branch) args.push('--branch', repo.branch);
      args.push(repo.url, dest);
      await exec('git', args);
      results.push({ name: repo.name, action: 'clone', dest });
    }
  }
  return results;
}
```

### docker-entrypoint.sh

```bash
#!/bin/sh
set -e

# If git-clone mode is enabled, ingest repos before starting daemon
if [ -n "$DOCUMIND_REPOS" ]; then
  echo "[entrypoint] Git-clone mode: ingesting repos..."
  node /app/scripts/ingest-repos.mjs
fi

exec "$@"
```

### Interaction with chokidar

In git-clone mode, chokidar watches `/repos/*` (not the host filesystem). This is correct — changes arrive via `git pull`, not via user edits. The watcher still provides value: if git pull modifies files, the 5s debounce batch picks them up. However, the watcher is optional in git-clone mode; the scheduler's periodic scan is the primary ingestion trigger.

**Decision:** Keep the watcher running in git-clone mode. It adds negligible overhead and catches any mid-cycle file changes. No code change required.

---

## Environment Variable Configuration

### Current env vars (in ecosystem.config.cjs)

| Var | Current Default | Notes |
| --- | --- | --- |
| `PORT` | `9000` | Express listen port |
| `NODE_ENV` | `production` | |
| `DOCUMIND_DB` | `./data/documind.db` | SQLite path |
| `DOCUMIND_PROFILE` | `./config/profiles/dvwdesign.json` | Context profile path |

### New env vars (v3.2)

| Var | Default | Purpose |
| --- | --- | --- |
| `DOCUMIND_MCP_HTTP` | `false` | If `true`, starts mcp-http.mjs alongside Express |
| `DOCUMIND_MCP_HTTP_PORT` | `9001` | Port for MCP HTTP server |
| `DOCUMIND_REPOS` | (unset) | JSON array of `{ name, url, branch }` for git-clone mode |
| `DOCUMIND_REPOS_DIR` | `/repos` | Target dir for cloned repos |
| `SCAN_INTERVAL` | `0 * * * *` | Cron expression for incremental scan |
| `FULL_SCAN_CRON` | `0 2 * * *` | Cron expression for daily full scan |
| `GIT_PULL_CRON` | `0 * * * *` | Cron expression for git pull refresh |

### What changes in scheduler.mjs

Replace hardcoded cron strings:

```javascript
// Before (hardcoded):
cron.schedule('0 * * * *', () => runIncrementalScan(db));

// After (env-configurable):
const SCAN_INTERVAL = process.env.SCAN_INTERVAL || '0 * * * *';
cron.schedule(SCAN_INTERVAL, () => runIncrementalScan(db));
```

This enables CI deployments to use `SCAN_INTERVAL=*/5 * * * *` for faster ingestion during tests.

---

## Dockerfile Architecture

### Multi-stage build

```dockerfile
# Stage 1: deps
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: runtime
FROM node:22-alpine AS runtime
RUN apk add --no-cache dumb-init git
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Don't bake DB or profile — they come from volumes/env
RUN rm -f data/documind.db

# Health check: Express /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:9000/health || exit 1

EXPOSE 9000 9001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "daemon/server.mjs"]
```

### Why dumb-init

Node.js as PID 1 does not handle SIGTERM properly — it ignores signals that it hasn't explicitly registered handlers for. `dumb-init` runs as PID 1, forwards signals to the Node.js process (PID 2), and reaps zombie processes. This is critical for `docker stop` to cleanly shut down the daemon.

### Why better-sqlite3 works in Alpine

`better-sqlite3` uses native bindings (compiled C++). `npm ci` in the Dockerfile rebuilds the bindings for the Alpine musl libc environment. The host machine's pre-compiled `node_modules/better-sqlite3/build/` is NOT copied — only the `node_modules` from the `deps` stage (which built on Alpine) transfers to the runtime stage. This is why the multi-stage build is required.

### SQLite data volume

The DB must NOT be baked into the image. It lives in a Docker named volume:

```yaml
# docker-compose.yml
services:
  documind:
    volumes:
      - documind_data:/app/data
      - documind_repos:/repos  # only in git-clone mode

volumes:
  documind_data:
  documind_repos:
```

In volume-mount mode (local dev), bind mount the host repos instead:

```yaml
volumes:
  - documind_data:/app/data
  - /Users/Shared/htdocs/github/DVWDesign:/repos:ro
```

---

## GHCR Publishing

### GitHub Actions workflow

```yaml
# .github/workflows/docker-publish.yml
name: Publish Docker Image
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ghcr.io/dvwdesign/documind:${{ github.ref_name }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

The `GITHUB_TOKEN` secret is automatically available — no extra secrets needed. Multi-arch (amd64 + arm64) means the image runs on both Intel/AMD cloud VMs and Apple Silicon Macs.

---

## Data Flow Changes

### Volume-Mount Mode (local dev)

```text
Host .md files change
    ↓
chokidar (running inside container, watching /repos/* = host bind-mount)
    ↓ 5s debounce
processPendingChanges() → markdown-processor.indexFile()
    ↓
SQLite /app/data/documind.db (in named volume)
    ↓
Express :9000 serves queries
MCP HTTP :9001 serves agent queries
```

### Git-Clone Mode (CI / remote)

```text
docker-entrypoint.sh: git clone/pull → /repos/*
    ↓
node daemon/server.mjs starts
    ↓
scheduler: initial scan on startup
    ↓
markdown-processor.indexFile() × N files
    ↓
SQLite /app/data/documind.db
    ↓
Periodic: GIT_PULL_CRON fires
    ↓
git-ingestor.mjs: git pull each /repos/{name}
    ↓
chokidar detects changed files
    ↓
processPendingChanges() → re-index changed files
```

### MCP HTTP Request Flow

```text
Remote MCP client POST http://container:9001/mcp
    (InitializeRequest, no session ID)
    ↓
StreamableHTTPServerTransport creates new session
    → generates UUID session ID
    → includes Mcp-Session-Id in response header
    ↓
McpServer processes tool call
    → same DB queries as stdio version
    ↓
Response: SSE stream OR JSON (client's Accept header determines)
    ↓
Subsequent requests include Mcp-Session-Id header
```

---

## Suggested Build Order

The build order is driven by dependencies between components. Each step is independently testable.

```text
Step 1: Dockerfile + docker-compose.yml + .dockerignore
  → Can be validated with: docker compose up
  → Tests: container starts, /health returns 200, DB initializes
  → No code changes needed — just new files
  → Confidence check: better-sqlite3 builds on Alpine

Step 2: Graceful shutdown + health check liveness (daemon/server.mjs)
  → Add SIGTERM/SIGINT handlers
  → Enhance /health to include db.prepare('SELECT 1').get() liveness
  → Tests: docker stop cleanly shuts down, /health returns 200 with db_ok: true
  → Dependency: Step 1 must work so Docker can send SIGTERM

Step 3: Environment variable config (daemon/scheduler.mjs + context/loader.mjs)
  → Replace hardcoded cron strings with process.env fallbacks
  → Add DOCUMIND_REPOS support to loader.mjs (or docker.json profile with inline repos)
  → Tests: SCAN_INTERVAL env override changes cron behavior
  → Dependency: Step 2 (container must be running to verify env vars work)

Step 4: Git-clone mode (processors/git-ingestor.mjs + docker-entrypoint.sh)
  → Write git-ingestor.mjs (clone/pull)
  → Write docker-entrypoint.sh (calls ingestor if DOCUMIND_REPOS set)
  → Write config/profiles/docker.json (inline repo list, /repos paths)
  → Tests: set DOCUMIND_REPOS, verify repos appear in /repos and get scanned
  → Dependency: Step 3 (env var support must exist for DOCUMIND_REPOS)

Step 5: MCP HTTP transport (daemon/mcp-http.mjs)
  → Write mcp-http.mjs using StreamableHTTPServerTransport
  → Wire into server.mjs startup: if DOCUMIND_MCP_HTTP=true, start mcp-http
  → Tests: connect MCP inspector to http://localhost:9001/mcp, verify tools respond
  → Dependency: Step 2 (server.mjs must handle multiple processes cleanly)

Step 6: GHCR publish workflow (.github/workflows/docker-publish.yml)
  → Write GitHub Actions workflow
  → Push a test tag to trigger it
  → Tests: image appears on ghcr.io/dvwdesign/documind
  → Dependency: Steps 1-5 complete (image must actually work)
```

**Why this order:** Steps 1-2 get a working container. Step 3 adds config flexibility before any mode-specific code. Step 4 (git-clone) and Step 5 (MCP HTTP) are independent of each other after Step 3 — they can be built in parallel. Step 6 only makes sense once the image is production-ready.

---

## Component Boundaries: New vs Modified vs Unchanged

| Component | Action | Why |
| --- | --- | --- |
| `Dockerfile` | NEW | Container build instructions |
| `docker-compose.yml` | NEW | Local dev container orchestration |
| `.dockerignore` | NEW | Exclude dev artifacts from image |
| `daemon/mcp-http.mjs` | NEW | HTTP transport entry point |
| `processors/git-ingestor.mjs` | NEW | Clone/pull processor |
| `scripts/ingest-repos.mjs` | NEW | CLI wrapper for git-ingestor (called by entrypoint) |
| `docker-entrypoint.sh` | NEW | Pre-start hook for git-clone mode |
| `config/profiles/docker.json` | NEW | Docker-specific context profile |
| `.github/workflows/docker-publish.yml` | NEW | GHCR CI/CD |
| `daemon/server.mjs` | MODIFIED | Add SIGTERM handler, MCP HTTP startup, health liveness |
| `daemon/scheduler.mjs` | MODIFIED | Replace hardcoded cron strings with env vars |
| `context/loader.mjs` | MODIFIED (minor) | Support DOCUMIND_REPOS_DIR path prefix for git-clone repos |
| `daemon/mcp-server.mjs` | UNCHANGED | Stdio MCP untouched; Docker mode uses mcp-http.mjs |
| `daemon/watcher.mjs` | UNCHANGED | Works in both modes; watches /repos/* |
| `daemon/hooks.mjs` | UNCHANGED | Hook routing unchanged |
| `processors/*` | UNCHANGED | All 7 processors need no Docker-specific changes |
| `graph/*` | UNCHANGED | Graph queries need no changes |
| `scripts/*` | UNCHANGED | CLI tools available via docker exec |
| `ecosystem.config.cjs` | UNCHANGED | Still used for PM2 local dev; Docker ignores it |
| `data/documind.db` | VOLUME | Never in image; always a mounted volume |

---

## Integration Points

### Docker Container ↔ Host Filesystem

| Mode | Integration | Notes |
| --- | --- | --- |
| Volume-mount (local dev) | Host `/Users/Shared/htdocs/github/DVWDesign` → `/repos` (bind mount, `:ro`) | Read-only is correct; DocuMind only reads repos, never writes back |
| Git-clone (CI/remote) | Container writes to `/repos` named volume via `git clone` | No host filesystem dependency |
| Data | Named volume `documind_data` → `/app/data` | DB persists across container restarts |

### MCP HTTP ↔ Claude Code

| Transport | Config Location | Use When |
| --- | --- | --- |
| stdio | `.claude/mcp.json` in each repo: `command: "node daemon/mcp-server.mjs"` | Local machine, PM2 or Docker with exec |
| HTTP | `.claude/mcp.json`: `url: "http://localhost:9001/mcp"` | Containerized, CI, or remote consumers |

### Scheduler ↔ Git Ingestor

The scheduler gains one new cron job in git-clone mode: periodic `git pull`. This is separate from the existing scan crons — a pull runs first, then the incremental scan fires (or the watcher picks up the changed files). The scheduler calls `git-ingestor.mjs`'s `cloneOrPull()` function directly.

### better-sqlite3 ↔ Docker Alpine

`better-sqlite3` uses native Node.js addons compiled with node-gyp. The Dockerfile must run `npm ci --omit=dev` inside the Alpine build stage — not copy pre-compiled binaries from the host. Key Alpine dependencies: `python3`, `make`, `g++` (all available as `npm ci` build deps in the node:22-alpine base image by default). If Alpine base lacks them, add `RUN apk add --no-cache python3 make g++` before `npm ci`.

---

## Anti-Patterns

### Anti-Pattern 1: Baking the SQLite DB into the image

**What people do:** Run `COPY data/documind.db /app/data/documind.db` in the Dockerfile.

**Why it's wrong:** Every `docker build` creates a new image with the baked-in DB state. The DB is not updated by container restarts — it resets to the build-time snapshot on each pull. DB state must be externalized to a volume.

**Do this instead:** `RUN rm -f data/documind.db` in the Dockerfile to ensure no accidental baking. Mount as a named volume.

### Anti-Pattern 2: Running PM2 inside Docker

**What people do:** `npm install -g pm2 && pm2 start ecosystem.config.cjs` as the Docker CMD.

**Why it's wrong:** PM2 inside Docker adds a supervisor-of-supervisors pattern. Docker is already the supervisor. PM2 interferes with signal forwarding (SIGTERM goes to PM2, which may not pass it to Node.js). PM2 log rotation duplicates Docker log management.

**Do this instead:** `dumb-init node daemon/server.mjs` as the CMD. One process per container.

### Anti-Pattern 3: Copying mcp-server.mjs tool logic into mcp-http.mjs verbatim

**What people do:** Duplicate all 14 tool registrations from `mcp-server.mjs` into `mcp-http.mjs` as a copy-paste.

**Why it's wrong:** Two places to update when tools change. Tool behavior diverges between stdio and HTTP modes. v3.1 already happened — there are 14 tools; divergence is a real risk.

**Do this instead:** Extract tool registrations into `daemon/mcp-tools.mjs` (a shared module). Both `mcp-server.mjs` and `mcp-http.mjs` import and call `registerTools(server, db, ctx)`. This is a refactor opportunity in v3.2 — not strictly required but highly recommended.

### Anti-Pattern 4: Exposing MCP HTTP on 0.0.0.0 without validation

**What people do:** Start `app.listen(9001)` with no Origin header validation.

**Why it's wrong:** The MCP specification (2025-03-26) explicitly requires Origin header validation to prevent DNS rebinding attacks. Any web page could call the MCP endpoint from a browser if it's exposed without validation.

**Do this instead:** Bind to `127.0.0.1` when running locally, or add Origin validation middleware. The SDK's `@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js` is available in the installed node_modules.

### Anti-Pattern 5: Cloning repos at Docker build time

**What people do:** `RUN git clone https://github.com/DVWDesign/...` in the Dockerfile.

**Why it's wrong:** Cloned content is baked into the image layer. The image becomes stale the moment repos are updated. A 500MB image rebuild is needed to get new commits.

**Do this instead:** Clone at container startup via `docker-entrypoint.sh`. The named volume `/repos` persists across container restarts; subsequent starts do `git pull` (fast) instead of `git clone` (slow).

---

## Scaling Considerations

This is a single-user internal tool. The Docker milestone targets CI readiness and portability, not horizontal scale.

| Scale | Architecture |
| --- | --- |
| Solo local (current) | PM2 daemon on macOS. Docker is an optional deployment path. |
| CI server (v3.2 target) | Single container on a Linux VM or GitHub Actions service. SQLite on a persistent volume. |
| Team use (Step #3 precursor) | Add auth to Express and MCP HTTP. Consider multiple containers behind a load balancer — would require migrating from SQLite to PostgreSQL or Turso, as SQLite's single-writer constraint makes horizontal scale impossible. |

**First bottleneck in containerized mode:** SQLite single-writer. In the current solo-use scenario this is fine. If multiple CI pipelines write to the DB simultaneously (e.g., parallel GitHub Action runs sharing the same volume), writes will serialize and pipelines will slow. The fix: either one container at a time (adequate for v3.2) or switch to Turso (future SaaS path).

---

## Sources

- Direct codebase inspection: `daemon/mcp-server.mjs`, `daemon/server.mjs`, `ecosystem.config.cjs`, `context/loader.mjs`, `context/schema.mjs`, `config/profiles/dvwdesign.json` (HIGH confidence)
- MCP SDK installed in project: `@modelcontextprotocol/sdk` v1.27.1 — `StreamableHTTPServerTransport` confirmed at `dist/esm/server/streamableHttp.js` (HIGH confidence)
- MCP Specification (2025-03-26): [Transports — Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — Origin header validation requirement confirmed (HIGH confidence)
- Docker Node.js best practices: [9 Tips for Containerizing Your Node.js Application](https://www.docker.com/blog/9-tips-for-containerizing-your-node-js-application/) (MEDIUM confidence)
- better-sqlite3 Alpine Docker: [Discussion #1270](https://github.com/WiseLibs/better-sqlite3/discussions/1270) — `npm ci` in Alpine stage required (MEDIUM confidence, consistent with native addon rebuild requirement)
- GHCR multi-arch publish: [Publishing Multi-Arch Docker images to GHCR using Buildx and GitHub Actions](https://dev.to/pradumnasaraf/publishing-multi-arch-docker-images-to-ghcr-using-buildx-and-github-actions-2k7j) (MEDIUM confidence)
- dumb-init for signal handling: Standard Node.js container practice, consistent across multiple official Docker guides (HIGH confidence — well-established pattern)

---

*Architecture research for: DocuMind v3.2 — Docker + MCP HTTP + Git-Clone Ingestion*
*Researched: 2026-03-23*
