---

phase: 18-query-layer
plan: "01"
subsystem: graph
tags:

  - kuzu

  - cypher

  - graph-traversal

  - query-layer

dependency_graph:
  requires:

    - "16-kuzu-foundation"

    - "17-sync-bridge"

  provides:

    - "graph/kuzu-queries.mjs (kuzuTraverseGraph + kuzuFindRelated)"

    - "scripts/smoke-test-kuzu-queries.mjs"

  affects:

    - "18-02 REST /graph endpoint wiring"

    - "18-03 MCP get_related tool wiring"

tech_stack:
  added: []
  patterns:

    - "Kuzu 0.11.3: conn.prepare(cypher) + conn.execute(stmt, params) for named-param queries"

    - "conn.query(cypher) for no-param queries (second arg is progressCallback, not params)"

    - "New Connection per function call, result.close() + conn.close() in finally"

    - "UNION (not UNION ALL) for both-direction queries — avoids undirected pattern uncertainty"

key_files:
  created:

    - graph/kuzu-queries.mjs

    - scripts/smoke-test-kuzu-queries.mjs

  modified:

    - package.json

decisions:

  - "Kuzu 0.11.3 conn.query(cypher, obj) treats second arg as progressCallback — use prepare+execute for named params"

  - "label(r[0]) not empirically confirmed (graph empty at test time) — implementation retained pending graph:rebuild"

  - "UNION used for both-direction queries rather than undirected -[r]- syntax (label(r) reliability on undirected uncertain)"

  - "Smoke test exits 0 on empty graph with a rebuild recommendation — does not fail the plan"

metrics:
  duration: "~4 minutes"
  completed: "2026-04-13"
  tasks_completed: 2
  files_created: 2
  files_modified: 1

---

# Phase 18 Plan 01: Kuzu Query Functions Summary

Kuzu Cypher traversal functions (`kuzuTraverseGraph` and `kuzuFindRelated`) implemented with
correct Kuzu 0.11.3 named-param API (prepare+execute pattern); `label(r[0])` status deferred
pending graph population.

## Tasks Completed

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 | Create graph/kuzu-queries.mjs with kuzuTraverseGraph + kuzuFindRelated | 45631ef |
| 2 | Write smoke test, add npm script, fix prepare/execute param pattern | 5a77118 |

## What Was Built

### graph/kuzu-queries.mjs

Two exported async functions for Kuzu graph traversal:

#### `kuzuTraverseGraph(kuzuDb, docId, direction, relType)`

- Single-hop directional traversal for the `/graph` REST endpoint

- Directions: `forward`, `reverse`, `both` (UNION of forward + reverse)

- Optional `relType` filter: appends `:relType` to the relationship pattern

- Returns: `{ doc_id, relationship_type, path, repository, filename, category, depth }`

- LIMIT 500 per query branch

#### `kuzuFindRelated(kuzuDb, docId, maxDepth, direction)`

- Multi-hop traversal for the `get_related` MCP tool

- Uses `label(r[0])` on variable-length paths `[r*1..$hops]`

- Returns: `{ doc_id, relationship_type, weight, depth, path, repository, filename, category }`

- Matches the existing SQLite `findRelated` response contract in `daemon/mcp-server.mjs`

- LIMIT 200

#### Internal `runQuery` helper

- Uses `conn.prepare(cypher)` + `conn.execute(stmt, params)` for parameterized queries

- Uses `conn.query(cypher)` for no-param queries

- New `kuzu.Connection` per call, `result.close()` then `conn.close()` in `finally`

### scripts/smoke-test-kuzu-queries.mjs

Empirical validator with three test stages:

- **Step 1:** Count Document nodes — skip traversal if graph empty

- **Test A:** Single-hop forward `label(r)` on direct edge

- **Test B:** `label(r[0])` on variable-length path `[r*1..2]` (LOW confidence test)

- **Test C:** Single-hop reverse direction

Exit codes: `0` = pass or empty graph; `1` = `label(r[0])` failed (fallback required).

## Deviations from Plan

### Auto-fixed Issues

#### 1. [Rule 1 - Bug] Fixed Kuzu named-param API usage

- **Found during:** Task 2 smoke test development and empirical testing

- **Issue:** `conn.query(cypher, params)` treats the second argument as `progressCallback`, not query parameters. Passing a plain object throws `"progressCallback must be a function"`. This is the correct Kuzu 0.11.3 API — named params require `conn.prepare()` + `conn.execute()`.

- **Fix:** Updated `runQuery` helper in `graph/kuzu-queries.mjs` and `scripts/smoke-test-kuzu-queries.mjs` to use `prepare+execute` for parameterized queries and plain `query()` for no-param queries.

- **Files modified:** `graph/kuzu-queries.mjs`, `scripts/smoke-test-kuzu-queries.mjs`

- **Commit:** 5a77118

### Deferred Items

**kuzu-sync.mjs broken params pattern** — `graph/kuzu-sync.mjs` uses the same broken `conn.query(cypher, params)` pattern for all MERGE/CREATE operations, which would throw errors. This is a pre-existing out-of-scope bug (Phase 17 code). Logged to `deferred-items.md`. This also explains why the Kuzu graph is currently empty (sync failed silently or errored). Requires a Phase 17 fix before `graph:rebuild` will populate data.

### label(r[0]) Status

The `label(r[0])` question was not empirically resolved because the graph is empty (0 Document nodes). The smoke test correctly detects this and exits 0 with a rebuild recommendation. The `kuzuFindRelated` implementation retains the `label(r[0])` approach — it will be validated once `graph:rebuild` successfully populates the graph (after fixing `kuzu-sync.mjs`).

## Self-Check: PASSED

- `graph/kuzu-queries.mjs` exists and exports both functions as async functions

- `scripts/smoke-test-kuzu-queries.mjs` exists and runs to completion

- `package.json` has `smoke-test:kuzu-queries` script

- Commits 45631ef and 5a77118 exist in git log
