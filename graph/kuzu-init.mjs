/**
 * Kuzu graph schema initialization for DocuMind.
 * Creates the Document node table and 8 typed edge tables.
 * Idempotent — uses IF NOT EXISTS; safe to call on every daemon startup.
 *
 * SCHEMA IS FROZEN — do not modify edge table definitions after Phase 16.
 * Phase 17 sync depends on this exact schema.
 *
 * ESM import form confirmed in Plan 16-01: `import kuzu from 'kuzu'`
 * (kuzu@0.11.3 ships index.mjs with `export default kuzu`; no createRequire needed)
 *
 * @module graph/kuzu-init
 */

import kuzu from 'kuzu';

/**
 * Initialize the Kuzu schema for DocuMind.
 * Creates Document node table and 8 typed edge tables.
 * Safe to call on every daemon startup — all DDL uses IF NOT EXISTS.
 *
 * @param {object} kuzuDb - kuzu.Database instance owned by server.mjs
 * @returns {Promise<void>}
 */
export async function initKuzuSchema(kuzuDb) {
  const conn = new kuzu.Connection(kuzuDb);
  try {
    // Document node table — mirrors documents columns needed for graph queries
    await conn.query(`
      CREATE NODE TABLE IF NOT EXISTS Document(
        id INT64,
        path STRING,
        repository STRING,
        filename STRING,
        category STRING,
        PRIMARY KEY(id)
      )
    `);

    // 8 typed edge tables — one per relationship_type in SQLite doc_relationships
    // Properties match the data populated by graph/relations.mjs
    await conn.query(
      `CREATE REL TABLE IF NOT EXISTS imports(FROM Document TO Document, weight DOUBLE, link_text STRING)`
    );
    await conn.query(
      `CREATE REL TABLE IF NOT EXISTS dispatched_to(FROM Document TO Document, target_repo STRING)`
    );
    await conn.query(
      `CREATE REL TABLE IF NOT EXISTS supersedes(FROM Document TO Document, confidence DOUBLE)`
    );
    await conn.query(
      `CREATE REL TABLE IF NOT EXISTS related_to(FROM Document TO Document, weight DOUBLE, reason STRING)`
    );
    await conn.query(`CREATE REL TABLE IF NOT EXISTS parent_of(FROM Document TO Document)`);
    await conn.query(
      `CREATE REL TABLE IF NOT EXISTS variant_of(FROM Document TO Document, similarity_score DOUBLE)`
    );
    await conn.query(`CREATE REL TABLE IF NOT EXISTS depends_on(FROM Document TO Document)`);
    await conn.query(`CREATE REL TABLE IF NOT EXISTS generated_from(FROM Document TO Document)`);

    console.log('[Kuzu] Graph schema initialized — 8 typed edge tables confirmed present');
  } finally {
    // Close the DDL connection — conn.close() confirmed available in Plan 16-01 smoke test
    try {
      conn.close();
    } catch (_) {
      // GC handles cleanup if close() unavailable
    }
  }
}
