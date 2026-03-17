---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: milestone
status: unknown
last_updated: "2026-03-17T18:39:37Z"
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 7
  completed_plans: 7
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** When you look at a document, you instantly see what it's connected to — what links to it, what duplicates it, and whether it's stale.
**Current focus:** Phase 3 — Orchestrator + Scheduler Wiring

## Current Position

Phase: 3 of 5 (Orchestrator + Scheduler Wiring) — IN PROGRESS
Plan: 2 of 4 in current phase — COMPLETE
Status: Phase 3 Plan 2 complete
Last activity: 2026-03-17 — Phase 3 Plan 2 complete: orchestrator.mjs with runScan (incremental/full/deep), FTS5 batch rebuild, mtime-skip logic, keyword + graph wiring

Progress: [███████░░░] 50% (7 of ~14 estimated plans)

## Performance Metrics

**Velocity:**

- Total plans completed: 7
- Average duration: 5m 58s
- Total execution time: 35m 42s

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
| ------- | ------- | ------- | ---------- |
| Phase 1 | 3 | 27m 42s | 9m 14s |
| Phase 2 | 2 | 8m 11s | 4m 5s |
| Phase 3 | 2 | 4m 03s | 2m 01s |

**Recent Trend:**

- Last 5 plans: 02-01 (3m 57s), 02-02 (4m 14s), 03-01 (2m 0s), 03-02 (2m 3s)
- Trend: Phase 3 Plan 2 took ~2 min — orchestrator wiring is narrow once processors and ctx are solid

Updated after each plan completion

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-phase]: Schema migration must come first — 8K live docs cannot survive a db:reset; `schema_migrations` table with numbered SQL files is the approach
- [Pre-phase]: MCP server uses stdio transport; `console.log` in any imported module corrupts JSON-RPC wire — mcp-server.mjs must redirect stdout to stderr at line 1
- [Pre-phase]: Graph population has O(n²) sibling edge risk — cap at max 10 sibling edges per folder before running against live corpus
- [Pre-phase]: Context profile schema must be designed generically (not DVW-shaped) to enable Step #3 portability
- [01-01]: Migration runner is separate from init-database.mjs — init creates fresh DB; migrate evolves existing DB
- [01-01]: Bootstrap schema_migrations created inline in migrate.mjs before reading applied versions (avoids chicken-and-egg ordering)
- [01-01]: Backup includes -wal and -shm files to ensure SQLite WAL consistency
- [01-02]: PRAGMA foreign_keys omitted from migration 005 SQL — migrate.mjs sets it at startup; with 0 rows no FK checks fire during INSERT INTO ... SELECT *
- [01-02]: document_graph view dropped and recreated inside migration 005 — SQLite validates dependent views on DROP TABLE; standard workaround
- [01-03]: Backfill scripts accept open db instance (not self-managed) — migrate.mjs controls connection lifecycle; scripts reusable in scheduler context
- [01-03]: JSON.parse() for frontmatter column (not gray-matter) — DB stores already-serialized JSON; gray-matter was used during initial indexing only
- [01-03]: --backfill flag added to migrate.mjs — triggers backfill without re-applying already-applied migrations; covers Plan 03 bootstrap scenario
- [02-01]: repositoryRegistryPath uses 3 levels up (../../../) from config/profiles/ — research doc measured from DocuMind root (2 levels), actual path from the profile file requires one more level
- [02-01]: path.resolve() applied to profilePath before dirname() — relative profile paths require resolution before dirname() to avoid CWD-anchored registry lookups
- [02-01]: Tech keyword count is 53 unique — source TECH_KEYWORDS Set had duplicate 'supabase'; actual unique count is 53, not 67/68 as plan estimated
- [02-02]: repoRegistry stores relative paths via path.relative(REPOS_ROOT, r.path) — PNG endpoint uses path.resolve(REPOS_ROOT, repoRegistry.get(repo)) so relative values required
- [02-02]: REPOS_ROOT_RESOLVED at module scope in watcher.mjs — mirrors ROOT pattern; required for processPendingChanges closure outside initWatcher
- [02-02]: registryPath kept in server.mjs for diagram relink endpoints — reads registry for per-repo sync (different purpose from REPOS_ROOT initialization)
- [03-01]: processMarkdown retains simple frontmatter.category || 'other' fallback — adding ctx would break standalone callers; classification happens in indexMarkdown
- [03-01]: siblingsByDir Map pre-computed before transaction — avoids repeated .filter() scans inside hot 8K-doc loop
- [03-01]: supersedes edge volume (167K) is pre-existing behavior outside plan scope — sibling cap confirmed at 5,425 edges / max 10 per doc
- [03-02]: fast-glob default import used (not named) — Node 24 ESM does not support named exports from CJS packages; `import fg from 'fast-glob'; const { glob } = fg`
- [03-02]: runFullScan pre-loads existing paths Set at start to classify indexed files as added vs updated without extra per-file DB queries
- [03-02]: runDeepScan passes startMs from runScan through to runFullScan — total durationMs reflects full elapsed time, not sub-phase only

### Pending Todos

None.

### Blockers/Concerns

- [Phase 4]: MCP tool description quality affects model behavior — test with MCP Inspector before finalizing tool definitions
- [Phase 4]: Monitor `supersedes` edge growth — currently 167K; if it approaches 500K it will need the same skip/cap treatment as siblings

## Session Continuity

Last session: 2026-03-17
Stopped at: Phase 3 Plan 2 complete — orchestrator.mjs runScan (incremental/full/deep); FTS5 batch rebuild; smoke test passed (28 docs, 1850ms)
Resume file: None
