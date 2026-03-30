---

phase: 14-mcp-http-transport
plan: 01
subsystem: infra
tags: [mcp, http, bearer-auth, cors, express, streamable-http, stdio]

# Dependency graph

requires:

  - phase: 11-foundation

    provides: config/env.mjs single source of truth pattern

  - phase: 12-dockerfile-docker-compose

    provides: Docker environment variable conventions
provides:

  - MCP_MODE, MCP_TOKEN, MCP_CORS_ORIGINS exports in config/env.mjs

  - Mode-switching MCP startup in daemon/mcp-server.mjs (stdio default, http optional)

  - POST/GET/DELETE /mcp routes on Express app with bearer token auth and CORS

affects: [14-mcp-http-transport, docker-compose, ecosystem.config.cjs]

# Tech tracking

tech-stack:
  added: [StreamableHTTPServerTransport from @modelcontextprotocol/sdk]
  patterns:

    - Mode-switching transport startup via env var (DOCUMIND_MCP_MODE)

    - Hand-written bearer auth middleware (not SDK requireBearerAuth — avoids expiresAt requirement)

    - Stateless StreamableHTTPServerTransport (sessionIdGenerator undefined)

    - Token set built once at startup via Set for O(1) per-request lookup

    - Dynamic import of server.mjs in HTTP mode to attach /mcp routes to existing Express app

key-files:
  created: []
  modified:

    - config/env.mjs

    - daemon/mcp-server.mjs

key-decisions:

  - "MCP_MODE defaults to 'stdio' — no behavior change for existing local Claude Code users"

  - "Stateless HTTP transport (sessionIdGenerator undefined) — DocuMind tools are synchronous DB/file ops, no session state needed"

  - "Hand-written bearerAuthMiddleware instead of SDK requireBearerAuth — SDK version requires expiresAt field on tokens"

  - "Same port 9000 — /mcp routes added to existing Express app via dynamic import('./server.mjs'), no separate listener"

  - "req.body passed as third arg to handleRequest for POST — Express json() middleware already parsed it"

  - "CORS middleware scope-limited to /mcp only, not global — existing REST endpoints unaffected"

  - "Token set (Set) built once at startup, not per-request — O(1) lookup, no per-request string splitting"

  - "Failed auth logs timestamp, IP, origin — security audit trail"

patterns-established:

  - "env var mode-switching: export MODE from env.mjs, branch on it at startup"

  - "defense-in-depth HTTP auth: validate token presence at startup, then per-request bearer check"

requirements-completed: [MCPT-01, MCPT-02, MCPT-03, MCPT-04]

# Metrics

duration: 2min
completed: 2026-03-28

---

# Phase 14 Plan 01: MCP HTTP Transport Summary

## StreamableHTTPServerTransport on Express /mcp with bearer token auth and CORS, switchable from stdio default via DOCUMIND_MCP_MODE env var

## Performance

- **Duration:** 2 min

- **Started:** 2026-03-28T15:47:28Z

- **Completed:** 2026-03-28T15:49:03Z

- **Tasks:** 2

- **Files modified:** 2

## Accomplishments

- Added MCP_MODE, MCP_TOKEN, MCP_CORS_ORIGINS exports to config/env.mjs (follows established single-source-of-truth pattern)

- mcp-server.mjs now branches on MCP_MODE at startup: stdio path is unchanged, http path validates token and mounts StreamableHTTPServerTransport

- HTTP mode exposes POST/GET/DELETE /mcp on existing Express app (port 9000) with per-request bearer auth and optional CORS headers

- Invalid MCP_MODE or missing DOCUMIND_MCP_TOKEN in HTTP mode causes immediate startup exit with clear error

## Task Commits

Each task was committed atomically:

1. **Task 1: Add MCP env vars to config/env.mjs** - `7cb9b3d` (feat)

2. **Task 2: Add HTTP transport mode to mcp-server.mjs** - `436051e` (feat)

## Files Created/Modified

- `config/env.mjs` - Added MCP_MODE, MCP_TOKEN, MCP_CORS_ORIGINS exports with JSDoc

- `daemon/mcp-server.mjs` - Extended import from env.mjs; replaced static stdio startup with mode-switching block

## Decisions Made

- Used hand-written bearerAuthMiddleware rather than SDK's `requireBearerAuth` because the SDK version requires an `expiresAt` field on static tokens — not appropriate for long-lived service tokens.

- Stateless transport (`sessionIdGenerator: undefined`) — all 14 DocuMind MCP tools perform synchronous SQLite reads/writes with no cross-request state.

- Dynamic `import('./server.mjs')` in HTTP mode attaches /mcp routes to the already-started Express app on port 9000 rather than opening a second listener.

- Token set built once at startup via `Set` so per-request lookup is O(1) regardless of how many tokens are configured.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

IDE diagnostics reported implicit-any hints on middleware parameters (`req`, `res`, `next`) in the `.mjs` file. No tsconfig or jsconfig exists in the project — these are TypeScript language-service hints only, not build errors. The project is plain JavaScript/ESM and the warnings do not affect runtime behavior.

## User Setup Required

To use HTTP mode, set environment variables before starting:

```bash

DOCUMIND_MCP_MODE=http
DOCUMIND_MCP_TOKEN=your-secret-token

# Optional:

DOCUMIND_MCP_CORS_ORIGINS=https://my-client.example.com

```

Stdio mode (default) requires no changes — existing `.claude/mcp.json` configuration continues to work without any environment variables.

## Next Phase Readiness

- HTTP transport is ready for remote consumers (Docker-internal services, remote Claude Code agents)

- Existing stdio transport for local Claude Code is unchanged

- docker-compose.yml can enable HTTP mode by adding DOCUMIND_MCP_MODE and DOCUMIND_MCP_TOKEN to the service environment block

---

### Phase: 14-mcp-http-transport

### Completed: 2026-03-28

## Self-Check: PASSED

- config/env.mjs — FOUND

- daemon/mcp-server.mjs — FOUND

- 14-01-SUMMARY.md — FOUND

- Commit 7cb9b3d (Task 1) — FOUND

- Commit 436051e (Task 2) — FOUND
