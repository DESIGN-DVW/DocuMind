---

gsd_state_version: 1.0
milestone: v3.3
milestone_name: Kuzu Graph Intelligence
status: in_progress
last_updated: "2026-04-20T13:24:25Z"
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 12
  completed_plans: 10

---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** When you look at a document, you instantly see what it's connected to — what links to it, what duplicates it, and whether it's stale.
**Current focus:** Milestone v3.3 — Phase 16: Kuzu Foundation

## Current Position

Phase: 22 of 22 (Obsolete Docs Dashboard)
Plan: 02 complete — 22-03 next
Status: Plan 22-02 complete — REST endpoints + daily detection cron delivered
Last activity: 2026-04-20 — Plan 22-02: GET /obsolete + POST dismiss endpoints + scheduler wiring (bd31090, d38abef)

Progress: [██████░░░░] 67% (Phase 22) — 2/3 plans done

## Performance Metrics

### Velocity (v3.2 baseline):

- Total plans completed: 8 (v3.2)

- Average duration: ~1m 45s

- Total execution time: ~14 min

### By Phase (v3.2):

| Phase         | Plans | Total    | Avg/Plan |

| ------------- | ----- | -------- | -------- |

| 11 Foundation | 3     | ~6 min   | 2 min    |

| 12 Dockerfile | 2     | ~3 min   | 1.5 min  |

| 13 Git-Clone  | 2     | ~3.5 min | 1.75 min |

| 14 MCP HTTP   | 2     | ~4 min   | 2 min    |

| 15 CI & Dist  | 2     | ~2 min   | 1 min    |

## Accumulated Context

### Decisions (v3.3 constraints)

- Kuzu ESM import must be empirically verified in a smoke test BEFORE writing any app code (Phase 16 gates all downstream work) [RESOLVED 2026-04-08: `import kuzu from 'kuzu'` works]

- Kuzu schema (8 typed edge tables) is frozen in Phase 16 — schema is immutable once data is loaded

- [16-01] ESM import form: `import kuzu from 'kuzu'` (default import, no createRequire needed)

- [16-01] Kuzu shutdown order: result.close() -> conn.close() -> db.close(); standalone scripts need process.exit(0)

- [16-01] Docker: kuzu@0.11.3 uses pre-built binary on node:22-bookworm-slim; no Dockerfile changes needed

- [16-02] KUZU_DIR follows DB_PATH pattern: path.resolve(ROOT, process.env.DOCUMIND_KUZU_DIR ?? 'data/documind.kuzu')

- [16-02] initKuzuSchema(kuzuDb): opens short-lived Connection for DDL, closes in finally — caller owns kuzuDb lifecycle

- [16-02] Kuzu schema frozen: 8 edge table property types locked for Phase 17 sync

- [16-03] kuzuDb exported from server.mjs — Phase 17 sync bridge imports it directly rather than reopening Database

- [16-03] /health upgraded to async handler — Kuzu liveness probe uses conn.query('RETURN 1') which is async

- [16-03] Kuzu shutdown order enforced in daemon: kuzuDb.close() -> db.pragma(wal_checkpoint) -> db.close()

- [17-02] Kuzu sync in runDeepScan is non-fatal — syncToKuzu errors do not abort the scan; logged and execution continues

- [17-02] kuzuDb flows as explicit parameter through server → initScheduler → runScan → runDeepScan — no globals

- [17-02] Startup backfill uses node count (not edge count) as empty-graph signal; /health uses strict equality for in-sync vs drift-detected

- SQLite FTS5 stays in SQLite; Kuzu handles graph only (dual-DB architecture)

- DOCUMIND_LLM_PROVIDER env var with default=anthropic (claude-sonnet-4-6) for text-to-Cypher

- LangChain text-to-Cypher requires custom KuzuGraphAdapter (~150 lines) — not a Python package wiring task

- VIZ phase uses Vite React in dashboard/ with @design-dvw/ui + Cytoscape.js; diagrams.html stays plain HTML untouched

- Hard dependency chain: 16 → 17 → 18 → 19 → 20 → 21 (no parallelism; each phase gates the next)

- Phase 21 additionally depends on Phase 18 AND Phase 19 before visualization is useful

- [17-01] syncToKuzu uses MERGE for node upsert + drop-and-recreate for edges — SQLite is source of truth; rebuildKuzuGraph delegates to syncToKuzu after full wipe

- [17-01] insertEdge uses switch dispatch on relationship_type with explicit per-type property mapping for all 8 edge tables

- [17-01] Connection lifecycle per function call: new kuzu.Connection(kuzuDb) in try, conn.close() in finally — never holds multiple connections simultaneously

- [17-03] Standalone rebuild script opens own kuzu.Database — daemon must be stopped first (single-writer constraint); initKuzuSchema called before rebuildKuzuGraph for fresh-dir safety

- [18-01] Kuzu 0.11.3: conn.query(cypher, obj) treats second arg as progressCallback — named params require conn.prepare(cypher) + conn.execute(stmt, params)

- [18-01] UNION (not UNION ALL) for both-direction graph queries — undirected -[r]- pattern reliability uncertain in Kuzu 0.11.3

- [18-01] label(r[0]) not empirically confirmed (graph empty at test time) — retained pending graph:rebuild; kuzu-sync.mjs needs same prepare+execute fix first

- [18-02] /graph handler made async — required for await kuzuTraverseGraph; SQLite fallback path still sync internally

- [18-02] direction validation guard in server handler (not inside kuzu-queries.mjs) — REST layer owns API surface contract; invalid values silently default to 'forward'

- [18-03] mcp-server.mjs opens own kuzu.Database — safe because MCP runs as a separate OS process; concurrent reads OK with Kuzu WAL mode; process.on('exit') closes kuzuDb

- [18-03] get_related direction param default is 'forward' — backward-compatible; reverse traversal enables "who references this doc?" queries (QUERY-02)

- [22-01] dismissed_until excluded from ON CONFLICT SET clause — re-running detection never resets a user snooze/dismiss

- [22-01] Single Kuzu Connection per detection pass with full-scan MATCH query (not per-document) for efficiency

- [22-01] Kuzu unavailability is non-fatal in detectObsolescence — warns + defaults all inbound counts to 0; scheduler-safe

- [22-02] GET /obsolete guards against missing table via sqlite_master check — returns empty result not 500 on fresh install

- [22-02] POST /obsolete/batch-dismiss registered before POST /obsolete/:id/dismiss — prevents Express route capture of literal string 'batch-dismiss'

- [22-02] detectObsolescence called non-fatally after generateDiagramSnapshot in CRON_DAILY — runs only when scan succeeds, never aborts daily job

### Pending Todos

- Fix graph/kuzu-sync.mjs broken params pattern (conn.query with object arg) — needed for graph:rebuild to work; deferred to future fix task

### Blockers/Concerns

None for Phase 18 query layer — kuzu-queries.mjs is complete and correct.

## Session Continuity

Last session: 2026-04-20
Stopped at: Completed 22-02-PLAN.md — 22-03 (dashboard UI) is next
Resume file: None
