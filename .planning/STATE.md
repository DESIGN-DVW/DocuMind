---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Dockerize
status: unknown
last_updated: "2026-03-28T23:05:11.182Z"
progress:
  total_phases: 10
  completed_phases: 10
  total_plans: 25
  completed_plans: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-23)

**Core value:** When you look at a document, you instantly see what it's connected to — what links to it, what duplicates it, and whether it's stale.
**Current focus:** Milestone v3.2 — Dockerize

## Current Position

Phase: 15-ci-distribution (Plan 2 of 2 complete)
Plan: 15-02
Status: Complete
Last activity: 2026-03-28 — Completed 15-02 (DOCKER-USAGE.md extended with Publishing to GHCR section: automated tag workflow, manual buildx multi-arch steps, pull instructions)

## Performance Metrics

### Velocity (v3.0 baseline):

- Total plans completed: 14 (v3.0)

- Average duration: 4m 31s

- Total execution time: ~49m 22s

## Accumulated Context

### Decisions

- config/env.mjs is the single source of truth for all runtime config; no module reads process.env directly

- REPOS_DIR is null (not empty string) when DOCUMIND_REPOS_DIR unset — callers use null check for profile vs dir discovery

- macOS fallback path lives only in constants.mjs so env.mjs stays path-agnostic

- No new npm deps for env loading — process.loadEnvFile() is built into Node 22

- Manual SIGTERM handler instead of @godaddy/terminus — no new dependency needed for Phase 12 scope

- Safety valve exits with code 1 (not 0) to signal abnormal forced exit to Docker

- usePolling defaults to false when CHOKIDAR_USEPOLLING unset — zero behavior change on macOS native

- server exported from server.mjs for downstream MCP HTTP transport use in later phases

- GIT_TOKEN read from process.env at runtime inside initIngestion() — secrets must not be module-level env.mjs exports

- initIngestion() does not mutate DOCUMIND_REPOS_DIR — docker-compose sets it before container start; env.mjs reads it at import time

- execFile (not exec) used for all git commands in ingestion module to prevent shell injection

- Pull cron registered as second CRON_HOURLY job in clone mode — scan is content-hash idempotent so double-scanning is harmless

- git installed in runtime stage only (not builder) — runtime needs it for clone/pull, builder does not

- Clone mode config shipped as commented YAML blocks in docker-compose.yml — mount mode is always the safe default

- REPOS_HOST_PATH variable makes bind mount configurable without editing docker-compose.yml

- /app/repos chowned before USER documind directive — chown requires root

- MCP_MODE defaults to 'stdio' — no behavior change for existing local Claude Code users without env var set

- Hand-written bearerAuthMiddleware used instead of SDK requireBearerAuth — SDK version requires expiresAt field on static tokens

- Stateless StreamableHTTPServerTransport (sessionIdGenerator undefined) — DocuMind tools are synchronous DB/file ops, no session state needed

- Token Set built once at startup, O(1) per-request lookup, not rebuilt per request

- CORS middleware scope-limited to /mcp route only — existing REST endpoints unaffected

- mcp_mode exposed in /health for observability — consumers can verify transport without env inspection

- DOCUMIND_MCP_TOKEN and CORS vars commented in docker-compose.yml — stdio is default, http vars only needed when opting in
- [Phase 15-ci-distribution]: Step labels in Manual Publishing subsection use h4 headings not bold text — avoids MD036 linting violation
- Builder stage pinned to ${BUILDPLATFORM:-linux/amd64} so npm ci compiles better-sqlite3 natively on GitHub runner, not under QEMU
- GITHUB_TOKEN with permissions: packages: write used for GHCR auth — no PAT rotation burden; credentials auto-expire per workflow run
- metadata-action flavor: latest=auto + type=semver produces both version and latest tags automatically from a single git tag push

### Pending Todos

None.

### Blockers/Concerns

None.

## Performance Metrics (v3.2)

| Plan  | Duration | Tasks | Files |

| ----- | -------- | ----- | ----- |

| 11-01 | 2 min    | 2     | 4     |

| 12-01 | 1 min    | 2     | 2     |

| 13-01 | 1m 35s   | 2     | 4     |

| 13-02 | 2 min    | 2     | 3     |

| 14-01 | 2 min    | 2     | 2     |

| 14-02 | 2 min    | 2     | 4     |

| 15-01 | 1 min    | 2     | 2     |

| 15-02 | 1 min    | 1     | 1     |

## Session Continuity

Last session: 2026-03-28
Stopped at: Completed 15-02-PLAN.md
Resume file: .planning/phases/15-ci-distribution/15-02-PLAN.md
