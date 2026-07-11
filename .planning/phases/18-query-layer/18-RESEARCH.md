# Phase 18: Query Layer - Research

**Researched:** 2026-04-11
**Domain:** Kuzu Cypher graph traversal, REST API extension, MCP tool migration
**Confidence:** HIGH

## Summary

Phase 18 migrates all document relationship graph queries from SQLite recursive CTEs to Kuzu Cypher.
Two work items exist: (1) extending the `/graph` REST endpoint with a `direction` parameter that
Kuzu's native directional query syntax handles without any application-level logic, and (2) replacing
`findRelated` in the `get_related` MCP tool with a Kuzu Cypher traversal function while keeping the
existing response contract unchanged.

The Kuzu graph is fully populated and stable after Phase 17. The schema is frozen (8 typed edge
tables) and `kuzuDb` is owned by `daemon/server.mjs`. The MCP server (`daemon/mcp-server.mjs`)
currently opens its own SQLite connection and calls `findRelated` from `graph/relations.mjs` — it
has no Kuzu access today. Phase 18 must give `mcp-server.mjs` a path to Kuzu without opening a
second `kuzu.Database` instance (single-writer constraint).

**Primary recommendation:** Create `graph/kuzu-queries.mjs` with two exported async functions
(`kuzuTraverseGraph` and `kuzuFindRelated`), update the `/graph` REST handler in `server.mjs` to
call `kuzuTraverseGraph`, and update `get_related` in `mcp-server.mjs` to call `kuzuFindRelated`
via a new HTTP sub-call to the daemon (HTTP bridge pattern — avoids dual Database open) OR by
passing `kuzuDb` through the MCP init path.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
| ---- | ------------- | ----------------- |
| QUERY-01 | `GET /graph` supports `direction=forward\|reverse\|both` parameter (Kuzu backend) | Kuzu Cypher arrow syntax: `->` forward, `<-` reverse, `-` both; `docId` param triggers per-node traversal; existing SQLite path removed |
| QUERY-02 | `get_related` MCP tool uses Kuzu Cypher traversal (same response contract, reverse traversal enabled) | `graph/kuzu-queries.mjs` exports `kuzuFindRelated`; response shape matches current `findRelated` output: `{ doc_id, hops, total, related: [{doc_id, relationship_type, weight, depth, path, repository, filename, category}] }` |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
| --------- | --------- | --------- | -------------- |
| kuzu | ^0.11.3 | Graph database — Cypher queries | Already installed, schema frozen, kuzuDb singleton in server.mjs |
| better-sqlite3 | existing | SQLite — documents lookup for node metadata | Stays as-is; no FTS replacement |
| express | existing | REST endpoint host | No change |
| @modelcontextprotocol/sdk | existing | MCP tool registration | No change |
| zod | existing | MCP input schema validation | No change |

### No New Dependencies

Phase 18 adds zero new npm packages. All Kuzu access goes through the already-installed `kuzu`
package and the existing `kuzuDb` singleton.

## Architecture Patterns

### Recommended File Structure Change

```text
graph/
├── relations.mjs        # KEEP — still used for buildRelationships; findRelated stays but is bypassed
├── kuzu-init.mjs        # UNCHANGED — frozen schema DDL
├── kuzu-sync.mjs        # UNCHANGED — sync bridge from Phase 17
└── kuzu-queries.mjs     # NEW — kuzuTraverseGraph + kuzuFindRelated
daemon/
├── server.mjs           # MODIFIED — /graph handler uses kuzuTraverseGraph; passes kuzuDb
└── mcp-server.mjs       # MODIFIED — get_related handler calls kuzuFindRelated
```

### Pattern 1: Kuzu Directional Traversal in Cypher

**What:** Kuzu's Cypher uses arrow direction to control traversal direction. No application-side
filtering needed — the database does it.

**Forward (outgoing from docId):**

```cypher
MATCH (src:Document {id: $id})-[r]->(tgt:Document)
RETURN tgt.id AS doc_id, label(r) AS relationship_type, tgt.path, tgt.repository,
       tgt.filename, tgt.category, 1 AS depth
```

**Reverse (incoming to docId — documents that point TO this doc):**

```cypher
MATCH (src:Document)-[r]->(tgt:Document {id: $id})
RETURN src.id AS doc_id, label(r) AS relationship_type, src.path, src.repository,
       src.filename, src.category, 1 AS depth
```

**Both (undirected — union of forward and reverse):**

```cypher
MATCH (src:Document {id: $id})-[r]-(tgt:Document)
RETURN tgt.id AS doc_id, label(r) AS relationship_type, tgt.path, tgt.repository,
       tgt.filename, tgt.category, 1 AS depth
```

Note: The pipe `|` operator for multiple relationship types works when listing edge tables:

```cypher
MATCH (a:Document)-[r:imports|related_to|parent_of]->(b:Document)
```

For "all relationship types" across all 8 tables, omit the label or list all 8 via `|`.

### Pattern 2: Variable-Length / N-Hop Traversal (for get_related)

**What:** Kuzu supports `*min..max` syntax on relationship patterns for variable-length paths.

```cypher
MATCH (src:Document {id: $id})-[r*1..3]->(tgt:Document)
RETURN tgt.id AS doc_id, label(r) AS relationship_type,
       tgt.path, tgt.repository, tgt.filename, tgt.category,
       length(r) AS depth
```

**Constraint:** Multi-hop traversal with mixed edge labels — when omitting label, Kuzu traverses
all edge tables. The `hops` parameter maps to `*1..{hops}`.

**When to use:** `kuzuFindRelated(kuzuDb, docId, hops, direction)` — the MCP `get_related` tool
calls this.

### Pattern 3: Connection Lifecycle (established in Phases 16-17)

```javascript
// Source: confirmed pattern from graph/kuzu-sync.mjs and daemon/server.mjs
const conn = new kuzu.Connection(kuzuDb);
try {
  const result = await conn.query(cypher, params);
  const rows = await result.getAll();
  try { result.close(); } catch (_) {}
  return rows;
} finally {
  try { conn.close(); } catch (_) {}
}
```

Never hold multiple connections simultaneously. Open per-call, close in `finally`.

### Pattern 4: Giving mcp-server.mjs Access to Kuzu

**The problem:** `mcp-server.mjs` opens its own `Database` (SQLite) and has no `kuzuDb`.
Opening a second `kuzu.Database(KUZU_DIR)` in `mcp-server.mjs` violates the single-writer
constraint (Kuzu embedded databases allow only one Database instance per process — the daemon
and MCP server run in separate processes).

**The solution:** `mcp-server.mjs` runs as a separate process (stdio MCP transport). It already
uses `better-sqlite3` for its own DB instance. For Kuzu access, `mcp-server.mjs` CAN safely
open its own `kuzu.Database` because it is a separate OS process from `daemon/server.mjs`.

**Confirmed safe:** The single-writer constraint is per-process. The MCP server is spawned by
the MCP client (Claude Code), not by `daemon/server.mjs`. Each process may open one
`kuzu.Database`. The daemon holds one, mcp-server.mjs can hold one.

**Implementation:** `mcp-server.mjs` imports `kuzu`, opens `new kuzu.Database(KUZU_DIR)` using
the same `KUZU_DIR` from `config/env.mjs`, and passes it to `kuzuFindRelated`. Because the MCP
server is read-only (queries only, no writes), concurrent read access to the same Kuzu directory
is safe — Kuzu uses WAL mode and supports concurrent readers.

### Pattern 5: Kuzu Result Shape

Kuzu `conn.query()` returns a QueryResult object. Call `result.getAll()` to get an array of
plain JS objects. Column names in the RETURN clause become property names. Close the result
before closing the connection.

```javascript
const result = await conn.query(
  'MATCH (d:Document {id: $id}) RETURN d.path AS path, d.repository AS repository',
  { id: 42 }
);
const rows = await result.getAll();
// rows = [{ path: '/some/file.md', repository: 'DocuMind' }]
try { result.close(); } catch (_) {}
```

### Pattern 6: UNION for "both" direction (alternative approach)

If undirected `-` syntax does not return `label(r)` reliably for all edge types, use explicit
UNION ALL:

```cypher
MATCH (src:Document {id: $id})-[r]->(tgt:Document)
RETURN tgt.id AS doc_id, label(r) AS relationship_type, tgt.path,
       tgt.repository, tgt.filename, tgt.category, 1 AS depth
UNION ALL
MATCH (src:Document)-[r]->(tgt:Document {id: $id})
RETURN src.id AS doc_id, label(r) AS relationship_type, src.path,
       src.repository, src.filename, src.category, 1 AS depth
```

This guarantees the full edge label is returned regardless of direction matching behavior.
Use UNION (not UNION ALL) to deduplicate when a node is both source and target.

### Anti-Patterns to Avoid

- **Opening kuzu.Database twice in one process:** Only one Database per process. The daemon
  owns its instance; don't import kuzuDb across process boundary.
- **Holding a Connection across async awaits outside a single function:** Always open/close
  within one function call. Never store a Connection in module scope.
- **Replacing findRelated in relations.mjs:** Keep it. `buildRelationships` in `relations.mjs`
  is still called by the orchestrator. The function just stops being the source for queries.
- **Removing the SQLite /graph fallback without guarding:** Add a guard: if `docId` param is
  present, use Kuzu traversal; if not (list mode), keep the SQLite `document_graph` view query.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --------- | ------------- | ------------- | ----- |
| Directional traversal filtering | Application-side edge direction filter | Kuzu Cypher `->` / `<-` / `-` arrow syntax | Database handles it; no JS needed |
| Multi-hop traversal | Recursive JS loop | Kuzu `*1..N` variable-length path | Database optimizes recursion |
| Result deduplication | Manual Set-based dedup in JS | Kuzu `UNION` (not `UNION ALL`) | Dedup at query level |
| Relationship type label | Parse edge table name from elsewhere | `label(r)` in Cypher RETURN | Built-in Kuzu function |

## Common Pitfalls

### Pitfall 1: label(r) on variable-length paths

**What goes wrong:** `label(r)` returns the label of a single relationship. On variable-length
paths `r*1..N`, `r` is a LIST of relationships — `label(r)` fails or returns unexpected results.

**Why it happens:** Kuzu's `*1..N` returns a path or list of edges, not a single edge.

**How to avoid:** For `kuzuFindRelated` (multi-hop), use a single-hop approach per depth
level via UNION, or extract relationship type differently. Alternative: use `properties(r[0])`
style accessors, or restructure query to get the immediate (depth-1) relationship type and
track depth separately. The simplest correct approach: run the N-hop query for reachability,
return the starting edge relationship type via a 1-hop subquery.

**Recommended approach for get_related:** For the `direction=forward` multi-hop case, use
recursive single-hop UNION in Cypher rather than `*1..N`, OR accept that multi-hop returns
the first-hop relationship_type only (matches SQLite behavior which uses `relationship_type`
from the first-hop join).

**Warning signs:** `TypeError: label is not a function` or empty relationship_type in results.

### Pitfall 2: /graph without docId (graph-list mode)

**What goes wrong:** Replacing the entire `/graph` handler with Kuzu breaks the list mode
(`GET /graph?repo=X`) which currently uses the SQLite `document_graph` view.

**Why it happens:** QUERY-01 adds `direction` support, which only applies when `docId` is set.

**How to avoid:** Keep the existing SQLite path for the list/browse mode. Add Kuzu path only
when `docId` query param is present. Branch on `if (docId)` at the top of the handler.

**Warning signs:** `/graph` returns empty results or errors when called without `docId`.

### Pitfall 3: Kuzu params are positional by name — not `?` placeholders

**What goes wrong:** Using SQLite-style `?` placeholders in Kuzu Cypher queries.

**Why it happens:** Kuzu uses named `$param` style, passed as the second argument object.

**How to avoid:** Always use `$paramName` in Cypher and `{ paramName: value }` as second
arg to `conn.query()`. This is already established in `kuzu-sync.mjs`.

**Warning signs:** `ParameterNotFound` or unexpected query results.

### Pitfall 4: mcp-server.mjs process startup Kuzu open delay

**What goes wrong:** MCP server opens Kuzu on every MCP session spawn. If the daemon is also
writing to Kuzu at that moment (sync), there may be a brief lock contention.

**Why it happens:** Kuzu WAL handles concurrent readers but write locks are exclusive.

**How to avoid:** The MCP server is read-only — it only runs SELECT queries. Kuzu allows
concurrent reads even during non-write periods. No mitigation needed for normal operation.
If a rare contention occurs, `conn.query()` will retry internally. Flag as LOW risk.

### Pitfall 5: Response contract breakage in get_related

**What goes wrong:** Kuzu result column names differ from SQLite `findRelated` output, causing
MCP consumers to break.

**Why it happens:** SQLite `findRelated` returns `{ doc_id, relationship_type, weight, depth,
path, repository, filename, category }`. Kuzu column aliases in RETURN must match exactly.

**How to avoid:** Alias all RETURN columns to match SQLite output exactly. Write the Cypher
RETURN clause first, cross-check against `findRelated` output, then implement.

## Code Examples

### kuzuTraverseGraph (for /graph REST endpoint)

```javascript
// graph/kuzu-queries.mjs
import kuzu from 'kuzu';

/**
 * Traverse document graph from a specific node using Kuzu backend.
 * @param {object} kuzuDb - kuzu.Database singleton
 * @param {number} docId - Source document ID
 * @param {'forward'|'reverse'|'both'} direction - Traversal direction
 * @param {string|null} relType - Optional: single relationship type filter
 * @returns {Promise<Array>} Array of { doc_id, relationship_type, path, repository, filename, category, depth }
 */
export async function kuzuTraverseGraph(kuzuDb, docId, direction = 'forward', relType = null) {
  const conn = new kuzu.Connection(kuzuDb);
  try {
    let cypher;
    const typeFilter = relType ? `:${relType}` : '';

    if (direction === 'forward') {
      cypher = `
        MATCH (src:Document {id: $id})-[r${typeFilter}]->(tgt:Document)
        RETURN tgt.id AS doc_id, label(r) AS relationship_type,
               tgt.path AS path, tgt.repository AS repository,
               tgt.filename AS filename, tgt.category AS category, 1 AS depth
        LIMIT 500
      `;
    } else if (direction === 'reverse') {
      cypher = `
        MATCH (src:Document)-[r${typeFilter}]->(tgt:Document {id: $id})
        RETURN src.id AS doc_id, label(r) AS relationship_type,
               src.path AS path, src.repository AS repository,
               src.filename AS filename, src.category AS category, 1 AS depth
        LIMIT 500
      `;
    } else {
      // both — UNION forward and reverse
      cypher = `
        MATCH (src:Document {id: $id})-[r${typeFilter}]->(tgt:Document)
        RETURN tgt.id AS doc_id, label(r) AS relationship_type,
               tgt.path AS path, tgt.repository AS repository,
               tgt.filename AS filename, tgt.category AS category, 1 AS depth
        UNION
        MATCH (src:Document)-[r${typeFilter}]->(tgt:Document {id: $id})
        RETURN src.id AS doc_id, label(r) AS relationship_type,
               src.path AS path, src.repository AS repository,
               src.filename AS filename, src.category AS category, 1 AS depth
      `;
    }

    const result = await conn.query(cypher, { id: docId });
    const rows = await result.getAll();
    try { result.close(); } catch (_) {}
    return rows;
  } finally {
    try { conn.close(); } catch (_) {}
  }
}
```

### kuzuFindRelated (for get_related MCP tool)

```javascript
/**
 * Multi-hop related document traversal using Kuzu.
 * Response contract matches findRelated() from graph/relations.mjs.
 * @param {object} kuzuDb - kuzu.Database (can be daemon's or mcp-server's own instance)
 * @param {number} docId - Source document ID
 * @param {number} maxDepth - Max hops (1-3)
 * @param {'forward'|'reverse'|'both'} direction - Traversal direction (default: forward)
 * @returns {Promise<Array>} Array matching findRelated output shape
 */
export async function kuzuFindRelated(kuzuDb, docId, maxDepth = 2, direction = 'forward') {
  const conn = new kuzu.Connection(kuzuDb);
  try {
    // Variable-length traversal — relationship_type from first hop via label(r[0])
    // Use 1-hop UNION per depth to get accurate relationship_type at each level
    // Simpler: single-query approach, accept first-hop rel type for depth>1 (matches SQLite behavior)
    let cypher;
    if (direction === 'forward') {
      cypher = `
        MATCH (src:Document {id: $id})-[r*1..$hops]->(tgt:Document)
        RETURN tgt.id AS doc_id, label(r[0]) AS relationship_type,
               1.0 AS weight, length(r) AS depth,
               tgt.path AS path, tgt.repository AS repository,
               tgt.filename AS filename, tgt.category AS category
        ORDER BY depth, tgt.id
        LIMIT 200
      `;
    } else if (direction === 'reverse') {
      cypher = `
        MATCH (src:Document)<-[r*1..$hops]-(tgt:Document {id: $id})
        RETURN src.id AS doc_id, label(r[0]) AS relationship_type,
               1.0 AS weight, length(r) AS depth,
               src.path AS path, src.repository AS repository,
               src.filename AS filename, src.category AS category
        ORDER BY depth, src.id
        LIMIT 200
      `;
    } else {
      cypher = `
        MATCH (src:Document {id: $id})-[r*1..$hops]-(tgt:Document)
        RETURN tgt.id AS doc_id, label(r[0]) AS relationship_type,
               1.0 AS weight, length(r) AS depth,
               tgt.path AS path, tgt.repository AS repository,
               tgt.filename AS filename, tgt.category AS category
        ORDER BY depth, tgt.id
        LIMIT 200
      `;
    }

    const result = await conn.query(cypher, { id: docId, hops: maxDepth });
    const rows = await result.getAll();
    try { result.close(); } catch (_) {}
    return rows;
  } finally {
    try { conn.close(); } catch (_) {}
  }
}
```

### Updated /graph handler in server.mjs (docId-branching pattern)

```javascript
// daemon/server.mjs — updated /graph handler
app.get('/graph', async (req, res) => {
  const { repo, type, depth = 2, docId, direction = 'forward' } = req.query;

  if (docId) {
    // Kuzu path — directional traversal from a specific node
    try {
      const rows = await kuzuTraverseGraph(kuzuDb, parseInt(docId, 10), direction, type || null);
      const nodeSet = new Set(rows.map(r => r.path));
      return res.json({ node_count: nodeSet.size + 1, edge_count: rows.length, edges: rows });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Existing SQLite list/browse mode (unchanged)
  const hasTable = db.prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='doc_relationships'`).get();
  if (!hasTable.count) return res.json({ nodes: [], edges: [] });
  // ... existing SQLite query unchanged
});
```

### Updated get_related handler in mcp-server.mjs

```javascript
// daemon/mcp-server.mjs — updated get_related tool
import kuzu from 'kuzu';
import { KUZU_DIR } from '../config/env.mjs';
import { kuzuFindRelated } from '../graph/kuzu-queries.mjs';

// Near top of file, after db init:
const kuzuDb = new kuzu.Database(KUZU_DIR);

// Updated tool handler:
server.registerTool(
  'get_related',
  {
    description: 'Get documents related to a given document ID via Kuzu graph traversal. Supports reverse traversal.',
    inputSchema: {
      doc_id: z.number().int().describe('Document ID to traverse from'),
      hops: z.number().int().min(1).max(3).default(2).describe('Maximum traversal depth (1-3)'),
      direction: z.enum(['forward', 'reverse', 'both']).default('forward').describe('Traversal direction'),
    },
  },
  async ({ doc_id, hops, direction }) => {
    try {
      const results = await kuzuFindRelated(kuzuDb, doc_id, hops, direction);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ doc_id, hops, total: results.length, related: results }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
        isError: true,
      };
    }
  }
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| -------------- | ------------------ | -------------- | -------- |
| SQLite recursive CTE in findRelated | Kuzu `*1..N` Cypher variable-length path | Phase 18 | Native graph engine; reverse traversal now possible |
| `/graph` SQLite-only, no direction param | `/graph?docId=&direction=` with Kuzu backend | Phase 18 | New capability: reverse + both modes |
| `get_related` forward-only | `get_related` with `direction` param | Phase 18 | Reverse traversal for "who references this doc?" |

**Deprecated/outdated after Phase 18:**

- `findRelated` from `graph/relations.mjs` for query purposes — file stays but the function is no
  longer called by MCP or REST. It can be removed in a future cleanup phase; don't remove now.

## Open Questions

1. **label(r[0]) on variable-length paths in Kuzu 0.11.3**
   - What we know: Kuzu supports `*1..N` paths; `r` in this case is a LIST of edges
   - What's unclear: Whether `label(r[0])` is valid syntax in Kuzu 0.11.3 (confirmed in Neo4j,
     not verified in Kuzu)
   - Recommendation: Include a smoke test in the plan's verify step. If `label(r[0])` fails,
     fall back to a depth-1 single-hop query for relationship_type and a separate reachability
     query for depth — or restructure using UNION per depth level.

2. **Kuzu UNION column ordering requirement**
   - What we know: UNION requires matching column count and types
   - What's unclear: Whether Kuzu 0.11.3 requires identical column names or just types
   - Recommendation: Always alias columns identically in both UNION branches. Already shown
     in examples above.

3. **mcp-server.mjs Kuzu shutdown**
   - What we know: mcp-server.mjs runs in stdio mode; process exits when MCP client disconnects
   - What's unclear: Whether kuzu.Database needs explicit `.close()` on process exit in the
     MCP server process (vs. GC handling it)
   - Recommendation: Add a `process.on('exit', () => { try { kuzuDb.close(); } catch(_) {} })`
     handler in mcp-server.mjs. Non-fatal if omitted but good hygiene.

## Sources

### Primary (HIGH confidence)

- Kuzu `graph/kuzu-sync.mjs` — confirmed `conn.query(cypher, params)` pattern, `result.getAll()`,
  `result.close()`, `conn.close()` lifecycle (Phase 17, commit 4d9817c)
- Kuzu `graph/kuzu-init.mjs` — confirmed frozen schema: 8 REL TABLEs, Document node table,
  property types (Phase 16, commit e775d4a)
- `daemon/mcp-server.mjs` — confirmed `get_related` tool registration, `findRelated` call,
  response shape `{ doc_id, hops, total, related: [...] }` (existing code, read directly)
- `.planning/STATE.md` — confirmed all Phase 16-17 decisions, kuzuDb singleton ownership,
  Connection lifecycle, non-fatal sync pattern

### Secondary (MEDIUM confidence)

- [Kuzu MATCH docs](https://kuzudb.github.io/docs/cypher/query-clauses/match/) — fetched directly;
  confirmed `->` forward, `<-` reverse, `-` undirected syntax; `|` multi-type; `*min..max` for
  variable-length paths
- [Kuzu UNION docs](https://kuzudb.github.io/docs/cypher/query-clauses/union/) — fetched directly;
  confirmed UNION vs UNION ALL behavior

### Tertiary (LOW confidence)

- `label(r[0])` on list-type paths in Kuzu 0.11.3 — inferred from Cypher semantics, not
  directly verified against Kuzu 0.11.3 docs. Flag for smoke test validation.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries already present; no new deps
- Architecture: HIGH — file locations and module boundaries confirmed from source code
- Kuzu Cypher direction syntax: HIGH — confirmed from official docs fetch
- label(r[0]) on variable-length paths: LOW — needs smoke test to validate
- MCP process isolation / separate Kuzu Database: HIGH — standard OS process model

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable Kuzu 0.11.3 pin; no imminent breaking changes)
