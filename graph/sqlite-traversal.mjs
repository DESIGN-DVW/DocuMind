/**
 * SQLite-based graph traversal — replaces the former Kuzu traversal layer.
 *
 * DocuMind's authoritative relationship store is `doc_relationships` in SQLite
 * (184 k+ edges). These helpers expose single-hop and multi-hop traversal
 * directly against that table, eliminating the separate Kuzu mirror.
 *
 * Both functions match the response contract previously fulfilled by
 * kuzuTraverseGraph and kuzuFindRelated in graph/kuzu-queries.mjs.
 *
 * @module graph/sqlite-traversal
 */

/**
 * Single-hop directional traversal.
 * Used by the /graph REST endpoint (docId query-param branch).
 *
 * Returns columns: doc_id, relationship_type, path, repository, filename, category, depth
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} docId
 * @param {'forward'|'reverse'|'both'} direction
 * @param {string|null} relType  - Optional relationship_type filter
 * @returns {Array<object>}
 */
export function traverseGraph(db, docId, direction = 'forward', relType = null) {
  const typeClause = relType ? 'AND dr.relationship_type = ?' : '';

  const forwardSql = `
    SELECT d.id AS doc_id, dr.relationship_type, d.path, d.repository, d.filename,
           d.category, 1 AS depth
    FROM doc_relationships dr
    JOIN documents d ON d.id = dr.target_doc_id
    WHERE dr.source_doc_id = ? ${typeClause}
    LIMIT 500
  `;

  const reverseSql = `
    SELECT d.id AS doc_id, dr.relationship_type, d.path, d.repository, d.filename,
           d.category, 1 AS depth
    FROM doc_relationships dr
    JOIN documents d ON d.id = dr.source_doc_id
    WHERE dr.target_doc_id = ? ${typeClause}
    LIMIT 500
  `;

  const args = relType ? [docId, relType] : [docId];

  if (direction === 'forward') return db.prepare(forwardSql).all(...args);
  if (direction === 'reverse') return db.prepare(reverseSql).all(...args);

  // both — UNION via JS to avoid SQL UNION complexity with optional type clause
  const fwd = db.prepare(forwardSql).all(...args);
  const rev = db.prepare(reverseSql).all(...args);
  const seen = new Set(fwd.map(r => r.doc_id));
  return [...fwd, ...rev.filter(r => !seen.has(r.doc_id))].slice(0, 500);
}

/**
 * Multi-hop traversal using a recursive CTE.
 * Used by the get_related MCP tool.
 *
 * Returns columns: doc_id, relationship_type, weight, depth, path, repository, filename, category
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} docId
 * @param {number} maxDepth   - Max hops (1–5)
 * @param {'forward'|'reverse'|'both'} direction
 * @returns {Array<object>}
 */
export function findRelated(db, docId, maxDepth = 2, direction = 'forward') {
  const forwardSql = `
    WITH RECURSIVE traverse(doc_id, relationship_type, depth) AS (
      SELECT target_doc_id, relationship_type, 1
      FROM doc_relationships WHERE source_doc_id = ?
      UNION
      SELECT dr.target_doc_id, dr.relationship_type, t.depth + 1
      FROM traverse t
      JOIN doc_relationships dr ON dr.source_doc_id = t.doc_id
      WHERE t.depth < ?
    )
    SELECT t.doc_id, t.relationship_type, 1.0 AS weight, t.depth,
           d.path, d.repository, d.filename, d.category
    FROM traverse t
    JOIN documents d ON d.id = t.doc_id
    ORDER BY t.depth, t.doc_id
    LIMIT 200
  `;

  const reverseSql = `
    WITH RECURSIVE traverse(doc_id, relationship_type, depth) AS (
      SELECT source_doc_id, relationship_type, 1
      FROM doc_relationships WHERE target_doc_id = ?
      UNION
      SELECT dr.source_doc_id, dr.relationship_type, t.depth + 1
      FROM traverse t
      JOIN doc_relationships dr ON dr.target_doc_id = t.doc_id
      WHERE t.depth < ?
    )
    SELECT t.doc_id, t.relationship_type, 1.0 AS weight, t.depth,
           d.path, d.repository, d.filename, d.category
    FROM traverse t
    JOIN documents d ON d.id = t.doc_id
    ORDER BY t.depth, t.doc_id
    LIMIT 200
  `;

  if (direction === 'forward') return db.prepare(forwardSql).all(docId, maxDepth);
  if (direction === 'reverse') return db.prepare(reverseSql).all(docId, maxDepth);

  const fwd = db.prepare(forwardSql).all(docId, maxDepth);
  const rev = db.prepare(reverseSql).all(docId, maxDepth);
  const seen = new Set(fwd.map(r => r.doc_id));
  return [...fwd, ...rev.filter(r => !seen.has(r.doc_id))]
    .sort((a, b) => a.depth - b.depth || a.doc_id - b.doc_id)
    .slice(0, 200);
}
