# Phase 18 Deferred Items

## kuzu-sync.mjs: broken named-param pattern

**Discovered during:** 18-01 Task 2 smoke test
**File:** `graph/kuzu-sync.mjs`
**Issue:** `conn.query(cypher, params)` passes the params object as the `progressCallback` arg, which throws `"progressCallback must be a function"` in Kuzu 0.11.3. The correct pattern is `conn.prepare(cypher)` + `conn.execute(stmt, params)`.

**Impact:** syncToKuzu and rebuildKuzuGraph appear to work for no-param queries (DROP, DELETE) but any parameterized MERGE/CREATE with `{ id, path, ... }` would throw unless Kuzu's native layer handles it differently. This may explain why the graph is currently empty (sync silently failed or errored).

**Action required:** Fix `insertEdge` and node-upsert loops in `graph/kuzu-sync.mjs` to use `prepare+execute` pattern. Out of scope for Phase 18 (query layer) — belongs in a Phase 17 fix or Phase 18 pre-work task.

**Note:** `graph/kuzu-queries.mjs` (Phase 18) was written with the correct `prepare+execute` pattern from the start.
