/**
 * Kuzu graph traversal queries for DocuMind.
 *
 * Exports two async functions for directional graph traversal over the Kuzu graph:
 *   - kuzuTraverseGraph  — single-hop directional traversal (used by /graph REST endpoint)
 *   - kuzuFindRelated    — multi-hop traversal (used by get_related MCP tool)
 *
 * Connection lifecycle: new kuzu.Connection(kuzuDb) per call, closed in finally block.
 * Named params: { paramName: value } — NOT ? placeholders.
 *
 * label(r[0]) validated by scripts/smoke-test-kuzu-queries.mjs — see commit notes if fallback was applied.
 *
 * @module graph/kuzu-queries
 */

import kuzu from 'kuzu';

// ---------------------------------------------------------------------------
// Internal helper — run a Cypher query with named params, return all rows.
// Opens and closes its own Connection. Never holds multiple connections.
// ---------------------------------------------------------------------------

/**
 * Run a Cypher query with optional named params.
 *
 * Kuzu 0.11.3 API:
 *   - conn.query(cypher)               — no params (second arg is progressCallback, not params)
 *   - conn.prepare(cypher)             — returns PreparedStatement
 *   - conn.execute(stmt, params)       — executes with { paramName: value } object
 *
 * When params is non-empty, use prepare+execute to pass named parameters.
 * When params is empty ({}), use plain query() for better performance.
 *
 * @param {import('kuzu').Database} kuzuDb
 * @param {string} cypher
 * @param {Record<string, unknown>} params
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function runQuery(kuzuDb, cypher, params = {}) {
  const conn = new kuzu.Connection(kuzuDb);
  let result;
  try {
    const hasParams = params && Object.keys(params).length > 0;
    if (hasParams) {
      const stmt = await conn.prepare(cypher);
      result = await conn.execute(stmt, params);
    } else {
      result = await conn.query(cypher);
    }
    const rows = await result.getAll();
    try {
      result.close();
    } catch (_) {}
    return rows;
  } finally {
    try {
      conn.close();
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// kuzuTraverseGraph
// ---------------------------------------------------------------------------

/**
 * Single-hop directional traversal of the Kuzu document graph.
 *
 * Used by the /graph REST endpoint. Returns direct neighbours of a document
 * node, with optional relationship-type filter.
 *
 * Return columns (match REST contract exactly):
 *   doc_id, relationship_type, path, repository, filename, category, depth
 *
 * @param {import('kuzu').Database} kuzuDb - Kuzu Database instance (caller-owned)
 * @param {number|string} docId - Source document id (matches Document.id)
 * @param {'forward'|'reverse'|'both'} [direction='forward'] - Traversal direction
 * @param {string|null} [relType=null] - Optional relationship type filter (e.g. 'imports')
 * @returns {Promise<Array<{doc_id: number, relationship_type: string, path: string, repository: string, filename: string, category: string, depth: number}>>}
 */
export async function kuzuTraverseGraph(kuzuDb, docId, direction = 'forward', relType = null) {
  const relClause = relType ? `[r:${relType}]` : '[r]';

  const forwardCypher = `
    MATCH (src:Document {id: $id})-${relClause}->(tgt:Document)
    RETURN tgt.id AS doc_id,
           label(r) AS relationship_type,
           tgt.path AS path,
           tgt.repository AS repository,
           tgt.filename AS filename,
           tgt.category AS category,
           1 AS depth
    LIMIT 500
  `;

  const reverseCypher = `
    MATCH (src:Document)-${relClause}->(tgt:Document {id: $id})
    RETURN src.id AS doc_id,
           label(r) AS relationship_type,
           src.path AS path,
           src.repository AS repository,
           src.filename AS filename,
           src.category AS category,
           1 AS depth
    LIMIT 500
  `;

  const params = { id: docId };

  if (direction === 'forward') {
    return runQuery(kuzuDb, forwardCypher, params);
  }

  if (direction === 'reverse') {
    return runQuery(kuzuDb, reverseCypher, params);
  }

  // direction === 'both': UNION (deduplicates) of forward + reverse.
  // Undirected `-[r]-` syntax is avoided because label(r) reliability on
  // undirected patterns is uncertain in Kuzu 0.11.3.
  const bothCypher = `
    MATCH (src:Document {id: $id})-${relClause}->(tgt:Document)
    RETURN tgt.id AS doc_id,
           label(r) AS relationship_type,
           tgt.path AS path,
           tgt.repository AS repository,
           tgt.filename AS filename,
           tgt.category AS category,
           1 AS depth
    LIMIT 500
    UNION
    MATCH (src:Document)-${relClause}->(tgt:Document {id: $id})
    RETURN src.id AS doc_id,
           label(r) AS relationship_type,
           src.path AS path,
           src.repository AS repository,
           src.filename AS filename,
           src.category AS category,
           1 AS depth
    LIMIT 500
  `;

  return runQuery(kuzuDb, bothCypher, params);
}

// ---------------------------------------------------------------------------
// kuzuFindRelated
// ---------------------------------------------------------------------------

/**
 * Multi-hop traversal of the Kuzu document graph.
 *
 * Used by the get_related MCP tool. Returns documents reachable within
 * maxDepth hops, ordered by depth then doc id.
 *
 * Response contract (must match daemon/mcp-server.mjs findRelated):
 *   [{ doc_id, relationship_type, weight, depth, path, repository, filename, category }]
 *
 * Implementation notes:
 * - Uses label(r[0]) on variable-length paths to extract the first hop's
 *   relationship type. This was validated empirically by
 *   scripts/smoke-test-kuzu-queries.mjs — see commit notes.
 * - If label(r[0]) is unavailable (smoke test detected fallback needed), this
 *   function is replaced by a JS-level BFS over kuzuTraverseGraph per-hop calls.
 *
 * @param {import('kuzu').Database} kuzuDb - Kuzu Database instance (caller-owned)
 * @param {number|string} docId - Source document id
 * @param {number} [maxDepth=2] - Maximum traversal hops (1–5 recommended)
 * @param {'forward'|'reverse'|'both'} [direction='forward'] - Traversal direction
 * @returns {Promise<Array<{doc_id: number, relationship_type: string, weight: number, depth: number, path: string, repository: string, filename: string, category: string}>>}
 */
export async function kuzuFindRelated(kuzuDb, docId, maxDepth = 2, direction = 'forward') {
  const params = { id: docId, hops: maxDepth };

  const forwardCypher = `
    MATCH (src:Document {id: $id})-[r*1..$hops]->(tgt:Document)
    RETURN tgt.id AS doc_id,
           label(r[0]) AS relationship_type,
           1.0 AS weight,
           length(r) AS depth,
           tgt.path AS path,
           tgt.repository AS repository,
           tgt.filename AS filename,
           tgt.category AS category
    ORDER BY depth, tgt.id
    LIMIT 200
  `;

  const reverseCypher = `
    MATCH (src:Document)<-[r*1..$hops]-(tgt:Document {id: $id})
    RETURN src.id AS doc_id,
           label(r[0]) AS relationship_type,
           1.0 AS weight,
           length(r) AS depth,
           src.path AS path,
           src.repository AS repository,
           src.filename AS filename,
           src.category AS category
    ORDER BY depth, src.id
    LIMIT 200
  `;

  if (direction === 'forward') {
    return runQuery(kuzuDb, forwardCypher, params);
  }

  if (direction === 'reverse') {
    return runQuery(kuzuDb, reverseCypher, params);
  }

  // direction === 'both': UNION of forward + reverse variable-length queries.
  const bothCypher = `
    MATCH (src:Document {id: $id})-[r*1..$hops]->(tgt:Document)
    RETURN tgt.id AS doc_id,
           label(r[0]) AS relationship_type,
           1.0 AS weight,
           length(r) AS depth,
           tgt.path AS path,
           tgt.repository AS repository,
           tgt.filename AS filename,
           tgt.category AS category
    UNION
    MATCH (src:Document)<-[r*1..$hops]-(tgt:Document {id: $id})
    RETURN src.id AS doc_id,
           label(r[0]) AS relationship_type,
           1.0 AS weight,
           length(r) AS depth,
           src.path AS path,
           src.repository AS repository,
           src.filename AS filename,
           src.category AS category
    ORDER BY depth, doc_id
    LIMIT 200
  `;

  return runQuery(kuzuDb, bothCypher, params);
}
