# Phase 11: Foundation - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>

## Phase Boundary

Eliminate all hardcoded macOS paths from production code and CLAUDE.md. Externalize runtime configuration to environment variables with sensible defaults. This is a prerequisite for all Docker work — the codebase must be location-agnostic before containerization.

</domain>

<decisions>

## Implementation Decisions

### Config naming

- `.env` file at project root, gitignored

- `.env.example` shipped with documented defaults (current macOS paths)

- Env var prefix, cron granularity, and naming convention at Claude's discretion

### Migration path

- Both-layers approach: auto-detect macOS paths as fallback when no .env exists, .env overrides when present

- Local dev must continue working without any setup after refactor

- In Docker, env vars are required (no macOS fallback)

- PM2 retention decision at Claude's discretion

### Audit scope

- Audit and refactor: daemon/, processors/, config/, scripts/ (production code paths)

- Also update: CLAUDE.md (agents read it, must reflect env var config)

- Leave alone: docs/, .planning/, other markdown documentation

- Repo list: both auto-discover from DOCUMIND_REPOS_DIR (scan for .git dirs) AND explicit list override via env var/config for CI with specific repos

### Claude's Discretion

- Env var prefix strategy (DOCUMIND_ vs mix of standard + prefixed)

- Cron schedule configurability (per-tier expressions vs enable/disable)

- Whether context profiles (config/profiles/*.json) coexist with env vars or get simplified

- Centralized constants file vs per-module config pattern

- MCP server config approach (same pattern as daemon or separate)

- PM2 retention for local dev vs dropping to node direct

- Breaking change tolerance (zero-setup vs one-time cp .env.example .env)

</decisions>

<specifics>

## Specific Ideas

- User envisions using Docker version for running DocuMind as a service (scanning, API), while keeping local repo for development — both paths must coexist

- Auto-discover repos by scanning parent directory for .git dirs, but allow explicit repo list to override for CI scenarios

</specifics>

<deferred>

## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

### Phase: 11-foundation

### Context gathered: 2026-03-23
