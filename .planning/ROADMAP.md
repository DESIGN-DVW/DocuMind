# Roadmap: DocuMind v3.0

## Overview

DocuMind v3.0 evolves a 60%-implemented documentation daemon into a fully wired, AI-agent-callable intelligence platform. The work follows a hard dependency chain: schema columns must exist before processors can write to them; the context profile must be stable before the orchestrator imports it; the orchestrator must exist before the scheduler and MCP write tools can delegate to it; and the MCP read tools must be clean before write tools are layered on. Five phases deliver the complete v3.0 feature set — schema safety first, portability second, intelligence third, agent read-access fourth, agent write-access last.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Schema Migration Foundation** - Safe, versioned schema evolution that protects 8K live documents while adding classification, tags, and summary columns (completed 2026-03-17)
- [ ] **Phase 2: Context Profile Loader** - Externalize all hardcoded DVWDesign config into a portable, Zod-validated JSON profile that every subsystem reads from
- [ ] **Phase 3: Orchestrator and Scheduler Wiring** - Wire all processors into a single callable orchestrator and replace every scheduler TODO stub with real cron jobs
- [ ] **Phase 4: MCP Server — Read Tools** - Expose DocuMind's intelligence layer as Claude-callable read tools over stdio transport
- [ ] **Phase 5: MCP Server — Write Tools** - Add autonomous document maintenance tools (lint, fix, index, scan, relink) behind path-validated write operations

## Phase Details

### Phase 1: Schema Migration Foundation

**Goal**: The live database can evolve safely — new columns and tables are added without destroying indexed documents, and every schema change is tracked in a migrations table
**Depends on**: Nothing (first phase)
**Requirements**: SCHM-01, SCHM-02, SCHM-03, SCHM-04, SCHM-05
**Success Criteria** (what must be TRUE):

  1. Running `npm run db:migrate` on the live database adds the new columns without touching existing document rows
  2. A `schema_migrations` table exists and records each applied migration with its version and timestamp
  3. The `documents` table has `summary`, `classification`, and tag-related columns visible via `.schema documents` in SQLite
  4. `db:reset` is explicitly blocked or warns loudly — it no longer silently destroys the 8K document corpus
  5. FTS5 search still returns results after migration (FTS5 rebuild was run as part of migration)
**Plans:** 3/3 plans complete

Plans:

- [x] 01-01-PLAN.md — Migration runner infrastructure and db:reset safety guard
- [x] 01-02-PLAN.md — SQL migration files (002-005) for columns, tables, and CHECK removal
- [x] 01-03-PLAN.md — Summary and classification backfill for all 8K documents

### Phase 2: Context Profile Loader

**Goal**: All hardcoded DVWDesign-specific config (repo paths, classification tree, keyword taxonomies, lint rules, relationship types) lives in a validated JSON profile file that DocuMind loads at startup
**Depends on**: Phase 1
**Requirements**: PROF-01, PROF-02, PROF-03, PROF-04, PROF-05
**Success Criteria** (what must be TRUE):

  1. Starting DocuMind with a missing or invalid profile JSON causes an immediate crash with a clear error message — not a silent bad-state start
  2. A `dvwdesign.json` reference profile exists and produces identical behavior to the current hardcoded defaults
  3. The classification tree is defined entirely in the profile JSON — no classification categories are hardcoded in any `.mjs` file
  4. The keyword taxonomies are defined entirely in the profile JSON — `keyword-processor.mjs` contains no hardcoded category lists
  5. `DOCUMIND_PROFILE` env var controls which profile is loaded — switching profiles switches all repo paths and classification behavior
**Plans:** 1/2 plans executed

Plans:

- [ ] 02-01-PLAN.md — Zod schema, loader module, and dvwdesign.json reference profile
- [ ] 02-02-PLAN.md — Wire all consumers to use ctx (server, watcher, keyword-processor, backfill-classifications, PM2)

### Phase 3: Orchestrator and Scheduler Wiring

**Goal**: Every processor (markdown indexing, keyword extraction, graph population, staleness detection, deviation analysis) runs on its correct schedule for the first time — and all entry points (scheduler, REST `/scan`, future MCP tools) call the same orchestrator functions
**Depends on**: Phase 2
**Requirements**: ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05, ORCH-06, INTL-01, INTL-02, INTL-03, INTL-04, INTL-05, INTL-06, INTL-07
**Success Criteria** (what must be TRUE):

  1. `GET /graph` returns actual relationship edges — `doc_relationships` table is no longer empty after the first orchestrated scan
  2. `GET /keywords` returns real TF-IDF scores — the `keywords` table is populated after the first weekly cron or manual trigger
  3. `GET /stats` shows a non-zero stale document count — staleness detection is running and surfacing results
  4. `POST /scan` triggers the orchestrator and completes without duplicating logic that already exists in `scheduler.mjs`
  5. Scheduler log shows hourly, daily, and weekly jobs firing (no TODO stubs remaining in `scheduler.mjs`)
**Plans**: TBD

### Phase 4: MCP Server — Read Tools

**Goal**: Claude Code agents across all DVWDesign repos can query DocuMind's search, graph, keywords, tree, and diagram data via named MCP tools over stdio transport — with zero stdout pollution corrupting the JSON-RPC wire
**Depends on**: Phase 3
**Requirements**: MCPR-01, MCPR-02, MCPR-03, MCPR-04, MCPR-05, MCPR-06, MCPR-07, MCPR-08
**Success Criteria** (what must be TRUE):

  1. `npx @modelcontextprotocol/inspector node daemon/mcp-server.mjs` connects cleanly and lists all read tools without errors
  2. Calling `search_docs` from Claude Code returns ranked document results with repo and classification metadata
  3. Calling `get_related` with a document ID returns its relationship graph up to the requested hop depth
  4. No `console.log` output appears on stdout during any tool call — all logging routes to stderr only
  5. The MCP server is registered in `ecosystem.config.cjs` and starts alongside the main daemon
**Plans**: TBD

### Phase 5: MCP Server — Write Tools

**Goal**: Claude Code agents can autonomously maintain documentation — linting, fixing, re-indexing, triggering scans, and relinking diagrams — with all file operations validated against known repo roots to prevent path traversal
**Depends on**: Phase 4
**Requirements**: MCPW-01, MCPW-02, MCPW-03, MCPW-04, MCPW-05, MCPW-06
**Success Criteria** (what must be TRUE):

  1. Calling `lint_file` from Claude Code returns actionable lint issues for a given file path without modifying the file
  2. Calling `fix_file` applies markdownlint auto-fixes and reports what changed
  3. Calling `trigger_scan` from an agent initiates an incremental scan via the orchestrator and returns a completion summary
  4. A file path outside `ctx.repoRoots` passed to any write tool returns a validation error — not a silent failure or filesystem access
  5. Calling `relink_diagram` sets a curated FigJam URL and propagates it into the source markdown file
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
| ------- | ---------------- | -------- | ----------- |
| 1. Schema Migration Foundation | 3/3 | Complete   | 2026-03-17 |
| 2. Context Profile Loader | 1/2 | In Progress|  |
| 3. Orchestrator and Scheduler Wiring | 0/TBD | Not started | - |
| 4. MCP Server — Read Tools | 0/TBD | Not started | - |
| 5. MCP Server — Write Tools | 0/TBD | Not started | - |
