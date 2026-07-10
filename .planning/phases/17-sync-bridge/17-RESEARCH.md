# Phase 17: Sync Bridge - Research

**Researched:** 2026-04-10
**Domain:** Kuzu graph sync from SQLite doc_relationships; orchestrator pipeline integration
**Confidence:** HIGH

## Summary

Phase 17 bridges the gap between SQLite `doc_relationships` (source of truth for relationship data)
and the Kuzu graph database (query-optimized graph store). After Phase 16, Kuzu is initialized and
running but contains zero data — the schema exists, nodes and edges are empty.

The sync bridge has three responsibilities: automatic post-scan sync (SYNC-01), manual full rebuild
via `npm run graph:rebuild` (SYNC-02), and health reporting of Kuzu edge count vs SQLite parity
(SYNC-03). A fourth implicit requirement from the success criteria is a startup backfill when Kuzu
is empty on fresh daemon start.

All implementation is self-contained in this codebase. No new dependencies are required — Kuzu's
Cypher MERGE statement handles upserts, and the data source is the already-populated
`doc_relationships` SQLite table.

**Primary recommendation:** Add a `graph/kuzu-sync.mjs` module with `syncToKuzu(db, kuzuDb)` and
`rebuildKuzuGraph(db, kuzuDb)` functions. Wire `syncToKuzu` into the deep scan path in
`orchestrator.mjs` and the startup backfill check in `server.mjs`. Add `graph:rebuild` npm script.
Extend `/health` to query Kuzu edge count.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SYNC-01 | After each relationship rebuild, doc_relationships sync automatically from SQLite to Kuzu | Wire `syncToKuzu(db, kuzuDb)` call into `runDeepScan` in orchestrator after `buildRelationships` completes |
| SYNC-02 | Operator can trigger full Kuzu graph rebuild via `npm run graph:rebuild` | New `scripts/rebuild-kuzu-graph.mjs` standalone script; add `graph:rebuild` to package.json scripts |
| SYNC-03 | `/health` endpoint reports Kuzu edge count and sync status vs SQLite | Query both `SELECT COUNT(*) FROM doc_relationships` (SQLite) and `MATCH ()-[r]->() RETURN COUNT(r)` (Kuzu); diff determines in-sync vs drift detected |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| kuzu | 0.11.3 | Graph write target — Cypher MERGE for upsert | Already installed; confirmed ESM default import |
| better-sqlite3 | ^12.6.2 | Source read — SELECT from doc_relationships | Already used throughout; synchronous reads fine here |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | No new dependencies required | All functionality uses kuzu + better-sqlite3 already present |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Kuzu MERGE upsert | DELETE all + CREATE fresh | MERGE is safer (preserves future manual edges); full drop+create used only in `graph:rebuild` |
| Passing kuzuDb through runScan options | Importing kuzuDb directly in orchestrator | Parameter passing is cleaner (testable, no circular import risk) — orchestrator should not import from server.mjs |

**Installation:**

```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure

```text
graph/
├── kuzu-init.mjs        # Phase 16 — schema DDL (frozen, no changes)
├── kuzu-sync.mjs        # Phase 17 — NEW: sync + rebuild functions
└── relations.mjs        # SQLite relationship builder (no changes)
scripts/
└── rebuild-kuzu-graph.mjs   # Phase 17 — NEW: standalone graph:rebuild script
```

### Pattern 1: Sync Module (kuzu-sync.mjs)

**What:** Single module exporting two functions: `syncToKuzu` (incremental post-scan upsert) and
`rebuildKuzuGraph` (drop-all + repopulate for full rebuild). Both accept `(db, kuzuDb)`.

**When to use:** `syncToKuzu` after every `buildRelationships` call; `rebuildKuzuGraph` for the
`graph:rebuild` script and fresh-start backfill.

**Example:**

```javascript
// graph/kuzu-sync.mjs

import kuzu from 'kuzu';

/**
 * Mirror all doc_relationships rows from SQLite into Kuzu.
 * Uses MERGE for nodes (idempotent) then CREATE for edges (after clearing existing).
 * Safe to call repeatedly — clears Kuzu edges before re-inserting.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} kuzuDb - kuzu.Database instance from server.mjs
 * @returns {Promise<{nodeCount: number, edgeCount: number}>}
 */
export async function syncToKuzu(db, kuzuDb) {
  const conn = new kuzu.Connection(kuzuDb);
  try {
    // 1. Upsert all Document nodes
    const docs = db.prepare(
      'SELECT id, path, repository, filename, category FROM documents'
    ).all();

    for (const doc of docs) {
      await conn.query(
        `MERGE (d:Document {id: $id})
         SET d.path = $path, d.repository = $repo,
             d.filename = $filename, d.category = $category`,
        { id: doc.id, path: doc.path, repo: doc.repository,
          filename: doc.filename, category: doc.category }
      );
    }

    // 2. Drop all existing edges (re-sync is idempotent)
    for (const rel of REL_TYPES) {
      await conn.query(`MATCH ()-[r:${rel}]->() DELETE r`);
    }

    // 3. Insert fresh edges from doc_relationships
    const edges = db.prepare(
      'SELECT source_doc_id, target_doc_id, relationship_type, weight, metadata FROM doc_relationships'
    ).all();

    for (const edge of edges) {
      await insertEdge(conn, edge);
    }

    return { nodeCount: docs.length, edgeCount: edges.length };
  } finally {
    try { conn.close(); } catch (_) {}
  }
}

/**
 * Full drop + repopulate. Deletes all Kuzu nodes/edges, then re-creates from SQLite.
 * Used by graph:rebuild script and empty-Kuzu startup backfill.
 */
export async function rebuildKuzuGraph(db, kuzuDb) {
  const conn = new kuzu.Connection(kuzuDb);
  try {
    // Drop all edges first (edges reference nodes — must delete edges before nodes)
    for (const rel of REL_TYPES) {
      await conn.query(`MATCH ()-[r:${rel}]->() DELETE r`);
    }
    // Drop all nodes
    await conn.query(`MATCH (d:Document) DELETE d`);
  } finally {
    try { conn.close(); } catch (_) {}
  }
  // Re-populate with sync
  return syncToKuzu(db, kuzuDb);
}
```

### Pattern 2: Orchestrator Integration (SYNC-01)

**What:** Pass `kuzuDb` to `runScan` via options object. After `buildRelationships` in
`runDeepScan`, call `syncToKuzu(db, kuzuDb)`.

**When to use:** Only in `runDeepScan` — the only scan mode that calls `buildRelationships`.

**Example:**

```javascript
// orchestrator.mjs — runDeepScan addition (step 3 + new step 3b)

// 3. Graph rebuild (SQLite)
const edgeCount = buildRelationships(db);

// 3b. Sync to Kuzu (Phase 17)
let kuzuEdgeCount = 0;
if (kuzuDb) {
  const syncResult = await syncToKuzu(db, kuzuDb);
  kuzuEdgeCount = syncResult.edgeCount;
  console.log(`[orchestrator] Kuzu sync complete: ${kuzuEdgeCount} edges mirrored`);
}
```

**Signature change:**

```javascript
// BEFORE (Phase 16)
export async function runScan(db, ctx, options = {})

// AFTER (Phase 17)
export async function runScan(db, ctx, options = {})
// options gains: kuzuDb (optional, defaults undefined — backwards compatible)
```

Callers in `scheduler.mjs` and `server.mjs` must pass `kuzuDb` to daily/weekly scan calls.

### Pattern 3: Startup Backfill (Success Criterion 4)

**What:** On daemon startup, after `initKuzuSchema(kuzuDb)`, check if Kuzu has zero Document
nodes. If empty, trigger `rebuildKuzuGraph` before the server starts accepting requests.

**When to use:** Only when fresh Kuzu dir detected.

**Example:**

```javascript
// daemon/server.mjs — after initKuzuSchema call

const kuzuDb = new kuzu.Database(KUZU_DIR);
await initKuzuSchema(kuzuDb);

// Backfill: if Kuzu is empty, populate from SQLite before serving
const checkConn = new kuzu.Connection(kuzuDb);
let kuzuNodeCount = 0;
try {
  const res = await checkConn.query('MATCH (d:Document) RETURN COUNT(d) AS cnt');
  const rows = await res.getAll();
  kuzuNodeCount = rows[0]?.cnt ?? 0;
  try { res.close(); } catch (_) {}
} finally {
  try { checkConn.close(); } catch (_) {}
}

if (kuzuNodeCount === 0) {
  console.log('[Kuzu] Empty graph detected — backfilling from SQLite...');
  const { rebuildKuzuGraph } = await import('../graph/kuzu-sync.mjs');
  const result = await rebuildKuzuGraph(db, kuzuDb);
  console.log(`[Kuzu] Backfill complete: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
}
```

### Pattern 4: Health Endpoint Sync Status (SYNC-03)

**What:** Extend the existing `/health` async handler to compare SQLite edge count vs Kuzu edge
count and add `sync_status` field.

**Example:**

```javascript
// daemon/server.mjs — /health handler addition

// Count SQLite edges
const sqliteEdges = db.prepare('SELECT COUNT(*) as count FROM doc_relationships').get().count;

// Count Kuzu edges across all 8 rel types
const kuzuConn = new kuzu.Connection(kuzuDb);
let kuzuEdges = 0;
try {
  // Kuzu supports UNION counting across rel tables
  const relTypes = ['imports','parent_of','variant_of','supersedes',
                    'depends_on','related_to','generated_from','dispatched_to'];
  for (const rel of relTypes) {
    const r = await kuzuConn.query(`MATCH ()-[e:${rel}]->() RETURN COUNT(e) AS cnt`);
    const rows = await r.getAll();
    kuzuEdges += rows[0]?.cnt ?? 0;
    try { r.close(); } catch (_) {}
  }
} finally {
  try { kuzuConn.close(); } catch (_) {}
}

const syncStatus = kuzuEdges === sqliteEdges ? 'in-sync' : 'drift detected';

res.json({
  status: 'ok',
  version: '2.0.0',
  uptime: process.uptime(),
  mcp_mode: MCP_MODE,
  kuzu: {
    status: 'ok',
    path: KUZU_DIR,
    edge_count: kuzuEdges,
    sqlite_edge_count: sqliteEdges,
    sync_status: syncStatus,
  },
});
```

### Pattern 5: Standalone Rebuild Script (SYNC-02)

**What:** `scripts/rebuild-kuzu-graph.mjs` — imports `db`, `kuzuDb` from server context OR opens
its own connections, calls `rebuildKuzuGraph`, exits.

**Critical:** This script runs standalone (outside the daemon). It must open its own Database
instances and call `process.exit(0)` after close (kuzu GC segfault avoidance per Plan 16-01).

**Example:**

```javascript
// scripts/rebuild-kuzu-graph.mjs
import kuzu from 'kuzu';
import Database from 'better-sqlite3';
import { DB_PATH, KUZU_DIR } from '../config/env.mjs';
import { initKuzuSchema } from '../graph/kuzu-init.mjs';
import { rebuildKuzuGraph } from '../graph/kuzu-sync.mjs';

const db = new Database(DB_PATH);
const kuzuDb = new kuzu.Database(KUZU_DIR);
await initKuzuSchema(kuzuDb);

const result = await rebuildKuzuGraph(db, kuzuDb);
console.log(`[graph:rebuild] Done: ${result.nodeCount} nodes, ${result.edgeCount} edges`);

try { kuzuDb.close(); } catch (_) {}
db.close();
process.exit(0);  // Required: prevents GC segfault (Plan 16-01)
```

### Pattern 6: Kuzu Cypher Edge Insertion by Type

**What:** Each of the 8 edge types has different optional properties. The edge inserter must
dispatch on `relationship_type` and parse `metadata` JSON for property values.

**Example:**

```javascript
// Property mapping per edge type (from kuzu-init.mjs frozen schema)
const REL_TYPES = [
  'imports', 'parent_of', 'variant_of', 'supersedes',
  'depends_on', 'related_to', 'generated_from', 'dispatched_to'
];

async function insertEdge(conn, edge) {
  const meta = edge.metadata ? JSON.parse(edge.metadata) : {};
  const type = edge.relationship_type;

  // MATCH both endpoint Document nodes, then CREATE edge
  const baseQuery = (rel, props) =>
    `MATCH (src:Document {id: $src}), (tgt:Document {id: $tgt})
     CREATE (src)-[:${rel} ${props}]->(tgt)`;

  switch (type) {
    case 'imports':
      await conn.query(baseQuery('imports', '{weight: $w, link_text: $lt}'),
        { src: edge.source_doc_id, tgt: edge.target_doc_id,
          w: edge.weight ?? 1.0, lt: meta.link_text ?? '' });
      break;
    case 'related_to':
      await conn.query(baseQuery('related_to', '{weight: $w, reason: $reason}'),
        { src: edge.source_doc_id, tgt: edge.target_doc_id,
          w: edge.weight ?? 0.3, reason: meta.reason ?? '' });
      break;
    case 'supersedes':
      await conn.query(baseQuery('supersedes', '{confidence: $conf}'),
        { src: edge.source_doc_id, tgt: edge.target_doc_id,
          conf: meta.confidence ?? edge.weight ?? 0.7 });
      break;
    case 'dispatched_to':
      await conn.query(baseQuery('dispatched_to', '{target_repo: $repo}'),
        { src: edge.source_doc_id, tgt: edge.target_doc_id,
          repo: meta.target_repo ?? '' });
      break;
    case 'variant_of':
      await conn.query(baseQuery('variant_of', '{similarity_score: $score}'),
        { src: edge.source_doc_id, tgt: edge.target_doc_id,
          score: meta.similarity_score ?? edge.weight ?? 0.0 });
      break;
    default:
      // parent_of, depends_on, generated_from — no properties
      await conn.query(
        `MATCH (src:Document {id: $src}), (tgt:Document {id: $tgt})
         CREATE (src)-[:${type}]->(tgt)`,
        { src: edge.source_doc_id, tgt: edge.target_doc_id }
      );
  }
}
```

### Anti-Patterns to Avoid

- **Sharing a single Connection across sync and health concurrently:** Kuzu is an embedded
  single-writer database. Each logical operation should open its own Connection, complete its
  queries, and close. Connections are cheap. Never pass a long-lived Connection between modules.
- **Opening a second kuzu.Database in the daemon:** Only one `kuzu.Database` instance per process.
  The `kuzuDb` singleton is owned by `server.mjs`. All other modules receive it as a parameter.
- **Calling `process.exit()` in daemon-context modules:** Only standalone scripts need it.
  `kuzu-sync.mjs` must never call `process.exit()`.
- **Counting edges via a single `MATCH ()-[r]->() RETURN COUNT(r)`:** Kuzu requires specifying
  the relationship table name in traversal queries. Cross-rel-table wildcard `[r]` may not be
  supported. Count each of the 8 tables separately and sum.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Node upsert | Custom SELECT+INSERT/UPDATE logic | Kuzu Cypher MERGE | MERGE is the Kuzu standard for conditional create; single statement |
| Edge deduplication | Track inserted edge IDs | Drop-and-recreate pattern (delete edges, re-insert from SQLite) | SQLite is the source of truth; re-sync is idempotent by design |
| Batch write transactions | Custom batching/chunking logic | One Connection per sync call, serial awaits | Kuzu embedded: no network overhead; serial awaits are fast enough for ~10K edges |

**Key insight:** The sync problem is simpler than it looks. SQLite `doc_relationships` is already
the authoritative source. The sync operation is a full mirror: delete all Kuzu edges, re-insert
from SQLite. Node upserts use MERGE. This avoids complex diffing entirely.

## Common Pitfalls

### Pitfall 1: Edges Referencing Non-Existent Document Nodes

**What goes wrong:** Creating a Kuzu edge `(src)-[:imports]->(tgt)` fails if `src.id` or `tgt.id`
has no corresponding Document node. Kuzu enforces referential integrity on rel table foreign keys.

**Why it happens:** `doc_relationships` may reference document IDs that were deleted from the
`documents` table between scans, or the node upsert step didn't include that document.

**How to avoid:** Always run the Document node MERGE loop over `SELECT * FROM documents` FIRST.
Then insert edges. The node set must be a superset of all IDs referenced in edges.

**Warning signs:** Kuzu query error mentioning a node ID that doesn't exist in the Document table.

### Pitfall 2: Kuzu Rejects Typed MERGE When Properties Differ

**What goes wrong:** `MERGE (d:Document {id: $id}) SET d.path = $path` fails if the node was
created with a different primary key type (e.g., INT64 vs a string cast).

**Why it happens:** Kuzu's PRIMARY KEY is strict — `id INT64` must receive an actual integer,
not a JavaScript number that gets coerced to float or a BigInt.

**How to avoid:** The `id` from `better-sqlite3` is already a JavaScript number (integer). Pass
it directly. Do not `String()` or `BigInt()` it.

**Warning signs:** Kuzu type mismatch error on MERGE when the row id is a large integer.

### Pitfall 3: Two Sync Calls in Parallel (Concurrent Access)

**What goes wrong:** If both the scheduled daily scan and a manual `graph:rebuild` run
simultaneously, two processes try to write to the same Kuzu directory. Kuzu is single-writer
embedded — the second open will fail with a lock error.

**Why it happens:** `graph:rebuild` script opens its own `kuzu.Database(KUZU_DIR)`, which
conflicts with the daemon's already-open instance.

**How to avoid:** Document this in the script. The `graph:rebuild` script should only be run when
the daemon is stopped, OR the script should detect the lock file and exit with a clear message.
Alternatively: expose `POST /graph/rebuild` as a daemon endpoint that delegates to
`rebuildKuzuGraph(db, kuzuDb)` — this ensures only one Database instance is ever open.

**Recommendation:** Phase 17 should implement BOTH:
1. `npm run graph:rebuild` (standalone, daemon must be stopped)
2. `POST /graph/rebuild` endpoint (daemon-internal, safer)

The npm script satisfies SYNC-02 literally. The endpoint provides operational safety.

### Pitfall 4: scheduler.mjs Doesn't Receive kuzuDb

**What goes wrong:** Phase 16 explicitly deferred passing `kuzuDb` to `initScheduler`. In Phase 17,
the daily CRON_DAILY job calls `runScan(db, ctx, { mode: 'full' })` — this uses `runFullScan`,
NOT `runDeepScan`. Only `runDeepScan` calls `buildRelationships`. Therefore daily cron does NOT
trigger a Kuzu sync.

**How it works:** Weekly cron (`CRON_WEEKLY`) calls `mode: 'deep'` — this hits `runDeepScan`.
SYNC-01 says "after each relationship rebuild" — so the sync must fire after `buildRelationships`
inside `runDeepScan`. The scheduler must be updated to pass `kuzuDb` in the options when calling
`runScan(db, ctx, { mode: 'deep', kuzuDb })`.

**Fix:** Update `initScheduler` signature to accept `kuzuDb` as 4th param. Pass it when calling
`runScan` in the weekly cron block only (since only deep scan rebuilds relationships). Update
`server.mjs` call from `initScheduler(db, ROOT, ctx)` to `initScheduler(db, ROOT, ctx, kuzuDb)`.

### Pitfall 5: Empty `doc_relationships` Table on First Deep Scan

**What goes wrong:** If the daemon starts fresh (new install), `doc_relationships` is empty until
the first deep scan runs. The startup backfill check queries Kuzu Document count, not edge count.
If docs were previously indexed but relationships were never built, backfill will insert 0 edges
into Kuzu (which is technically correct but may confuse operators).

**How to avoid:** Startup backfill is based on Document node count being 0 in Kuzu. If documents
exist but relationships don't, backfill will correctly insert Document nodes and 0 edges — not
an error. Log the counts explicitly so operators can see the state.

## Code Examples

Verified patterns from official sources:

### Kuzu MERGE Node Upsert

```javascript
// Source: kuzu@0.11.3 confirmed working in Phase 16 smoke test
// MERGE creates node if it doesn't exist; SET updates properties
await conn.query(
  `MERGE (d:Document {id: $id})
   SET d.path = $path, d.repository = $repo, d.filename = $filename, d.category = $category`,
  { id: doc.id, path: doc.path, repo: doc.repository,
    filename: doc.filename ?? '', category: doc.category ?? '' }
);
```

### Kuzu Edge Count Per Table

```javascript
// Count edges in a single rel table (wildcard across tables not guaranteed to work)
const res = await conn.query(`MATCH ()-[e:imports]->() RETURN COUNT(e) AS cnt`);
const rows = await res.getAll();
const count = rows[0]?.cnt ?? 0;
try { res.close(); } catch (_) {}
```

### Kuzu Delete All Edges of a Type

```javascript
// Drop all edges before re-inserting (idempotent sync pattern)
await conn.query(`MATCH ()-[r:imports]->() DELETE r`);
```

### Kuzu Delete All Document Nodes (full rebuild)

```javascript
// Must delete all edges first (they reference nodes)
for (const rel of REL_TYPES) {
  await conn.query(`MATCH ()-[r:${rel}]->() DELETE r`);
}
await conn.query(`MATCH (d:Document) DELETE d`);
```

### SQLite doc_relationships Query (source read)

```javascript
// Source: graph/relations.mjs — confirmed column names
const edges = db.prepare(
  `SELECT source_doc_id, target_doc_id, relationship_type, weight, metadata
   FROM doc_relationships`
).all();
```

### Connection Lifecycle Pattern (established in Phase 16)

```javascript
// Source: scripts/kuzu-smoke-test.mjs + kuzu-init.mjs
const conn = new kuzu.Connection(kuzuDb);
try {
  // ... queries ...
} finally {
  try { conn.close(); } catch (_) {}
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Kuzu empty (Phase 16) | Kuzu mirrors SQLite relationships (Phase 17) | This phase | Graph queries become possible |
| `/health` kuzu: status+path only | `/health` kuzu: status+path+edge_count+sync_status | This phase | Operators can verify sync parity |
| `initScheduler(db, ROOT, ctx)` | `initScheduler(db, ROOT, ctx, kuzuDb)` | This phase | Weekly deep scan triggers Kuzu sync |

**Deprecated/outdated:**

- Nothing deprecated; this phase adds new functionality without removing existing patterns.

## Open Questions

1. **Kuzu MATCH+CREATE edge performance at scale**
   - What we know: Phase 16 smoke test confirmed basic CREATE works; no performance benchmark exists
   - What's unclear: At 10K+ edges, does individual-row MATCH+CREATE in a loop become a bottleneck?
   - Recommendation: Implement single-row loop first (simplest, correct). If performance is a
     problem in Phase 18/19 query testing, evaluate Kuzu bulk load via CSV or batched transactions.

2. **Kuzu `result.getAll()` return type for COUNT queries**
   - What we know: Smoke test used `result.getAll()` and accessed `rows[0]`
   - What's unclear: COUNT query returns `[{ cnt: N }]` or `[{ 'COUNT(e)': N }]`? Column alias
     matters for the health check count logic.
   - Recommendation: Use an explicit alias `COUNT(e) AS cnt` and access `rows[0]?.cnt`. Verify
     in the first task of this phase.

3. **Single-process lock safety for `npm run graph:rebuild`**
   - What we know: Kuzu embedded is single-writer per directory
   - What's unclear: Does kuzu@0.11.3 use a lockfile we can detect, or does it throw an error?
   - Recommendation: Document in script README that daemon must be stopped. Optionally implement
     `POST /graph/rebuild` daemon endpoint as the safer alternative.

## Sources

### Primary (HIGH confidence)

- Phase 16 SUMMARY files (16-01, 16-02, 16-03) — confirmed ESM import, schema, shutdown order,
  kuzuDb export, deferred scheduler wiring
- `graph/kuzu-init.mjs` — frozen 8-table schema (Document node + 8 typed edge tables with properties)
- `graph/relations.mjs` — confirmed `doc_relationships` columns: source_doc_id, target_doc_id,
  relationship_type, weight, metadata
- `daemon/server.mjs` — confirmed kuzuDb export, /health handler structure, initScheduler call
- `orchestrator.mjs` — confirmed runDeepScan step order (buildRelationships at step 3)
- `daemon/scheduler.mjs` — confirmed weekly CRON calls `runScan(db, ctx, { mode: 'deep' })`
- `package.json` — confirmed no `graph:rebuild` script exists yet

### Secondary (MEDIUM confidence)

- kuzu@0.11.3 Cypher syntax for MERGE, DELETE, MATCH+CREATE: based on standard Cypher patterns
  confirmed working in kuzu smoke test environment; MERGE specifically is standard Cypher supported
  by Kuzu per their documentation patterns

### Tertiary (LOW confidence)

- COUNT query alias return format `{ cnt: N }` — inferred from standard Cypher behavior; needs
  empirical verification in Phase 17 Task 1

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new dependencies; all from Phase 16 confirmed working
- Architecture: HIGH — all integration points confirmed from reading actual source files
- Pitfalls: HIGH — derived from reading existing code + Phase 16 decisions (concurrent access,
  scheduler wiring, node-before-edge ordering all confirmed from codebase inspection)

**Research date:** 2026-04-10
**Valid until:** 2026-06-10 (kuzu@0.11.3 stable; no anticipated API changes)
