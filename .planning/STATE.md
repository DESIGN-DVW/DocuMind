---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: milestone
status: unknown
last_updated: "2026-03-17T18:57:16.105Z"
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** When you look at a document, you instantly see what it's connected to — what links to it, what duplicates it, and whether it's stale.
**Current focus:** Phase 3 — Orchestrator + Scheduler Wiring

## Current Position

Phase: 3 of 5 (Orchestrator + Scheduler Wiring) — COMPLETE
Plan: 4 of 4 in current phase — COMPLETE
Status: Phase 3 complete
Last activity: 2026-03-16 — Phase 3 Plan 4 complete: TF-IDF similarity detection, staleness detection, deviation analysis, and document_tags population added; /stats returns stale_documents count

Progress: [█████████░] 64% (9 of ~14 estimated plans)

## Performance Metrics

**Velocity:**

- Total plans completed: 9
- Average duration: 4m 44s
- Total execution time: ~42m 40s

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
| ------- | ------- | ------- | ---------- |
| Phase 1 | 3 | 27m 42s | 9m 14s |
| Phase 2 | 2 | 8m 11s | 4m 5s |
| Phase 3 | 4 | ~10m 01s | ~2m 30s |

**Recent Trend:**

- Last 5 plans: 03-01 (2m 0s), 03-02 (2m 3s), 03-03 (2m 58s), 03-04 (~4m 0s)
- Trend: Phase 3 complete — intelligence features plan took slightly longer due to schema constraint discovery and 5-type deviation analysis

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
- [03-03]: setImmediate used for non-blocking scan trigger in /scan and /index endpoints — responds before scan runs to avoid HTTP timeout on large corpora
- [03-03]: CTX stored at module scope in watcher.mjs (alongside ROOT) — processPendingChanges is module-level, cannot receive ctx through initWatcher closure
- [03-03]: deriveRepoName iterates ctx.repoRoots with startsWith then falls back to DVWDesign path segment — handles nested repos like FigmaAPI/FigmailAPP
- [03-03]: post-commit case wrapped in {} braces — prevents let/const block-scoping conflict in switch/case
- [03-04]: deviation_type='duplicate' used in content_similarities — schema CHECK does not include 'potential_duplicate'; correct value is 'duplicate'
- [03-04]: deviations.severity mapped to schema values — 'medium' -> 'minor', 'low' -> 'info' (schema allows critical/major/minor/info only)
- [03-04]: INSERT OR IGNORE for document_tags — avoids re-triggering FTS sync triggers on idempotent keyword runs with identical keywords
- [03-04]: doc1_id < doc2_id enforced in similarity insert — content_similarities has CHECK constraint requiring ordered IDs
- [03-04]: detected_at included explicitly in INSERT statements — both content_similarities and deviations have NOT NULL detected_at columns

### Pending Todos

None.

### Blockers/Concerns

- [Phase 4]: MCP tool description quality affects model behavior — test with MCP Inspector before finalizing tool definitions
- [Phase 4]: Monitor `supersedes` edge growth — currently 167K; if it approaches 500K it will need the same skip/cap treatment as siblings

## Session Continuity

Last session: 2026-03-16
Stopped at: Phase 3 Plan 4 complete — TF-IDF similarity detection, staleness detection via relationship graph, 5-type deviation analysis, document_tags population, and /stats stale_documents count all implemented
Resume file: None
