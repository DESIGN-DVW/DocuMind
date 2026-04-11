/**
 * Kuzu graph sync bridge for DocuMind.
 * Mirrors SQLite doc_relationships data into the Kuzu graph.
 *
 * Two exported functions:
 *   - syncToKuzu(db, kuzuDb)    — MERGE nodes + drop/recreate edges (incremental)
 *   - rebuildKuzuGraph(db, kuzuDb) — full wipe then delegates to syncToKuzu
 *
 * Both functions:
 *   - Accept (db: better-sqlite3 Database, kuzuDb: kuzu.Database)
 *   - Open their own short-lived kuzu.Connection; never reopen the Database
 *   - Return { nodeCount, edgeCount }
 *   - Never call process.exit() — daemon-safe
 *
 * Node-before-edge ordering is mandatory; edges are dropped before nodes on full rebuild.
 *
 * @module graph/kuzu-sync
 */

import kuzu from 'kuzu';

/**
 * All 8 edge table names — must match kuzu-init.mjs schema exactly (frozen Phase 16).
 * Order matters for deletion: edges first, then nodes (referential integrity).
 */
const REL_TYPES = [
  'imports',
  'dispatched_to',
  'supersedes',
  'related_to',
  'parent_of',
  'variant_of',
  'depends_on',
  'generated_from',
];

/**
 * Insert a single typed edge into Kuzu.
 * Dispatches on relationship_type to build a correctly-typed Cypher CREATE.
 * Parses edge.metadata as JSON (defaults to {} on null/empty).
 *
 * @param {object} conn - kuzu.Connection (caller-owned, already open)
 * @param {object} edge - Row from doc_relationships: { source_doc_id, target_doc_id, relationship_type, weight, metadata }
 * @returns {Promise<void>}
 */
async function insertEdge(conn, edge) {
  let meta = {};
  try {
    if (edge.metadata) meta = JSON.parse(edge.metadata);
  } catch (_) {
    // Malformed metadata — use empty object
  }

  const type = edge.relationship_type;
  const src = edge.source_doc_id;
  const tgt = edge.target_doc_id;

  let cypher;
  let params;

  switch (type) {
    case 'imports': {
      cypher = `
        MATCH (src:Document {id: $src}), (tgt:Document {id: $tgt})
        CREATE (src)-[:imports {weight: $w, link_text: $lt}]->(tgt)
      `;
      params = {
        src,
        tgt,
        w: edge.weight ?? 1.0,
        lt: meta.link_text ?? '',
      };
      break;
    }
    case 'dispatched_to': {
      cypher = `
        MATCH (src:Document {id: $src}), (tgt:Document {id: $tgt})
        CREATE (src)-[:dispatched_to {target_repo: $repo}]->(tgt)
      `;
      params = {
        src,
        tgt,
        repo: meta.target_repo ?? '',
      };
      break;
    }
    case 'supersedes': {
      cypher = `
        MATCH (src:Document {id: $src}), (tgt:Document {id: $tgt})
        CREATE (src)-[:supersedes {confidence: $conf}]->(tgt)
      `;
      params = {
        src,
        tgt,
        conf: meta.confidence ?? edge.weight ?? 0.7,
      };
      break;
    }
    case 'related_to': {
      cypher = `
        MATCH (src:Document {id: $src}), (tgt:Document {id: $tgt})
        CREATE (src)-[:related_to {weight: $w, reason: $reason}]->(tgt)
      `;
      params = {
        src,
        tgt,
        w: edge.weight ?? 0.3,
        reason: meta.reason ?? '',
      };
      break;
    }
    case 'variant_of': {
      cypher = `
        MATCH (src:Document {id: $src}), (tgt:Document {id: $tgt})
        CREATE (src)-[:variant_of {similarity_score: $score}]->(tgt)
      `;
      params = {
        src,
        tgt,
        score: meta.similarity_score ?? edge.weight ?? 0.0,
      };
      break;
    }
    case 'parent_of': {
      cypher = `
        MATCH (src:Document {id: $src}), (tgt:Document {id: $tgt})
        CREATE (src)-[:parent_of]->(tgt)
      `;
      params = { src, tgt };
      break;
    }
    case 'depends_on': {
      cypher = `
        MATCH (src:Document {id: $src}), (tgt:Document {id: $tgt})
        CREATE (src)-[:depends_on]->(tgt)
      `;
      params = { src, tgt };
      break;
    }
    case 'generated_from': {
      cypher = `
        MATCH (src:Document {id: $src}), (tgt:Document {id: $tgt})
        CREATE (src)-[:generated_from]->(tgt)
      `;
      params = { src, tgt };
      break;
    }
    default:
      // Unknown relationship type — skip silently
      return;
  }

  await conn.query(cypher, params);
}

/**
 * Incremental sync: MERGE all Document nodes from SQLite, then drop and recreate
 * all edges from doc_relationships. SQLite is the source of truth.
 *
 * Steps:
 *   1. Open a short-lived Connection
 *   2. SELECT all documents and MERGE each as a Document node
 *   3. Drop all existing edges across the 8 typed tables
 *   4. SELECT all doc_relationships and CREATE each as a typed edge
 *   5. Close Connection in finally
 *   6. Return { nodeCount, edgeCount }
 *
 * @param {import('better-sqlite3').Database} db - SQLite database
 * @param {object} kuzuDb - kuzu.Database singleton (owned by server.mjs)
 * @returns {Promise<{nodeCount: number, edgeCount: number}>}
 */
export async function syncToKuzu(db, kuzuDb) {
  const conn = new kuzu.Connection(kuzuDb);
  try {
    // Step 1: Upsert all Document nodes (MERGE = insert-or-update)
    const docs = db.prepare('SELECT id, path, repository, filename, category FROM documents').all();

    for (const doc of docs) {
      await conn.query(
        `MERGE (d:Document {id: $id})
         SET d.path = $path, d.repository = $repo, d.filename = $filename, d.category = $cat`,
        {
          id: doc.id,
          path: doc.path ?? '',
          repo: doc.repository ?? '',
          filename: doc.filename ?? '',
          cat: doc.category ?? '',
        }
      );
    }

    // Step 2: Drop all existing edges across all 8 typed tables (idempotent re-sync)
    for (const rel of REL_TYPES) {
      await conn.query(`MATCH ()-[r:${rel}]->() DELETE r`);
    }

    // Step 3: Recreate edges from SQLite doc_relationships
    const edges = db
      .prepare(
        'SELECT source_doc_id, target_doc_id, relationship_type, weight, metadata FROM doc_relationships'
      )
      .all();

    for (const edge of edges) {
      await insertEdge(conn, edge);
    }

    const nodeCount = docs.length;
    const edgeCount = edges.length;

    console.log(`[kuzu-sync] Sync complete: ${nodeCount} nodes, ${edgeCount} edges mirrored`);

    return { nodeCount, edgeCount };
  } finally {
    try {
      conn.close();
    } catch (_) {
      // GC handles cleanup if close() unavailable
    }
  }
}

/**
 * Full rebuild: delete all Kuzu nodes and edges, then re-populate from SQLite.
 * Use this when schema changes or data integrity is in question.
 *
 * Steps:
 *   1. Open a short-lived Connection
 *   2. Delete all edges across the 8 typed tables (edges before nodes — referential integrity)
 *   3. Delete all Document nodes
 *   4. Close Connection in finally
 *   5. Delegate re-population to syncToKuzu(db, kuzuDb)
 *
 * @param {import('better-sqlite3').Database} db - SQLite database
 * @param {object} kuzuDb - kuzu.Database singleton (owned by server.mjs)
 * @returns {Promise<{nodeCount: number, edgeCount: number}>}
 */
export async function rebuildKuzuGraph(db, kuzuDb) {
  console.log('[kuzu-sync] Full rebuild: dropping all Kuzu nodes and edges...');

  const conn = new kuzu.Connection(kuzuDb);
  try {
    // Delete edges first (referential integrity — Kuzu requires edges deleted before nodes)
    for (const rel of REL_TYPES) {
      await conn.query(`MATCH ()-[r:${rel}]->() DELETE r`);
    }

    // Delete all Document nodes
    await conn.query('MATCH (d:Document) DELETE d');
  } finally {
    try {
      conn.close();
    } catch (_) {
      // GC handles cleanup if close() unavailable
    }
  }

  // Re-populate via syncToKuzu (opens its own fresh Connection)
  return syncToKuzu(db, kuzuDb);
}
