/**
 * obsolescence-detector.mjs
 *
 * Scores every indexed document on four heuristic signals and upserts results
 * into the obsolescence_signals table.
 *
 * Signals:
 *   - age      : document not modified in >180 days
 *   - link     : zero inbound Kuzu graph edges
 *   - keyword  : path/filename matches deprecated/archive/old-/todo-delete patterns
 *   - similarity: max similarity score >= 0.7 (redundant content)
 *
 * Exported: detectObsolescence(db, kuzuDb) -> { scanned, flagged, cleared }
 */

import kuzu from 'kuzu';

const KEYWORD_RE = /deprecated|archive|old[-_]|todo[:\s]*delete/i;
const AGE_THRESHOLD_DAYS = 180;
const SIM_THRESHOLD = 0.7;

/**
 * Run obsolescence detection over all indexed documents.
 *
 * @param {import('better-sqlite3').Database} db     - SQLite DB instance
 * @param {import('kuzu').Database|null}      kuzuDb - Kuzu DB instance (may be null)
 * @returns {{ scanned: number, flagged: number, cleared: number }}
 */
export async function detectObsolescence(db, kuzuDb) {
  // 1. Guard: ensure migration has run
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='obsolescence_signals'")
    .get();
  if (!tableExists) {
    throw new Error(
      '[obsolescence-detector] obsolescence_signals table not found — run `node scripts/db/migrate.mjs` first'
    );
  }

  // 2. Load similarity map: MAX(similarity_score) per document
  const simRows = db
    .prepare(
      `SELECT doc_id, MAX(similarity_score) as max_score
       FROM (
         SELECT doc1_id AS doc_id, similarity_score FROM content_similarities
         UNION ALL
         SELECT doc2_id AS doc_id, similarity_score FROM content_similarities
       )
       GROUP BY doc_id`
    )
    .all();
  const simMap = new Map(simRows.map(r => [r.doc_id, r.max_score]));

  // 3. Load inbound-link counts from Kuzu graph
  const inboundMap = new Map();
  if (kuzuDb) {
    const conn = new kuzu.Connection(kuzuDb);
    try {
      const cypher =
        'MATCH (src:Document)-[r]->(tgt:Document) RETURN tgt.id AS doc_id, count(r) AS cnt';
      const result = await conn.query(cypher);
      const rows = await result.getAll();
      try {
        result.close();
      } catch (_) {}
      for (const row of rows) {
        inboundMap.set(row.doc_id, Number(row.cnt));
      }
    } catch (err) {
      console.warn(
        '[obsolescence-detector] Kuzu query failed — using inbound count = 0 for all docs:',
        err.message
      );
    } finally {
      try {
        conn.close();
      } catch (_) {}
    }
  } else {
    console.warn('[obsolescence-detector] No kuzuDb provided — inbound link counts unavailable');
  }

  // 4. Load all documents
  const docs = db.prepare('SELECT id, path, filename, modified_at FROM documents').all();

  // 5. Score each document
  const toUpsert = [];
  const docIdsScored = new Set();
  const now = Date.now();

  for (const doc of docs) {
    const modifiedMs = doc.modified_at ? new Date(doc.modified_at).getTime() : 0;
    const ageDays =
      modifiedMs > 0 ? Math.floor((now - modifiedMs) / (1000 * 60 * 60 * 24)) : Infinity;

    const haystack = `${doc.path ?? ''} ${doc.filename ?? ''}`;
    const ageSignal = ageDays > AGE_THRESHOLD_DAYS ? 1 : 0;
    const inboundCount = inboundMap.get(doc.id) ?? 0;
    const linkSignal = inboundCount === 0 ? 1 : 0;
    const keywordSignal = KEYWORD_RE.test(haystack) ? 1 : 0;
    const maxSimilarity = simMap.get(doc.id) ?? 0;
    const simSignal = maxSimilarity >= SIM_THRESHOLD ? maxSimilarity : 0;

    // Score / label determination
    const obsoleteScore = ageSignal * 0.35 + linkSignal * 0.35 + keywordSignal * 0.3;

    let confidence, label;

    if (obsoleteScore >= 0.8) {
      confidence = Math.min(obsoleteScore, 1.0);
      label = 'obsolete';
    } else if (simSignal >= SIM_THRESHOLD) {
      confidence = simSignal;
      label = 'redundant';
    } else if (ageSignal && linkSignal) {
      confidence = 0.55;
      label = 'stale';
    } else if (keywordSignal) {
      confidence = 0.45;
      label = 'needs-update';
    } else {
      // Below threshold — skip
      continue;
    }

    toUpsert.push({
      document_id: doc.id,
      confidence_score: confidence,
      flag_label: label,
      age_days: Number.isFinite(ageDays) ? ageDays : 99999,
      inbound_link_count: inboundCount,
      keyword_matched: keywordSignal,
      similarity_score: maxSimilarity > 0 ? maxSimilarity : null,
    });
    docIdsScored.add(doc.id);
  }

  // 6a. Load archived document IDs — skip upsert for these to prevent overwriting archived_at
  const archivedDocIds = new Set(
    db
      .prepare(`SELECT document_id FROM obsolescence_signals WHERE archived_at IS NOT NULL`)
      .all()
      .map(r => r.document_id)
  );
  const toUpsertFiltered = toUpsert.filter(r => !archivedDocIds.has(r.document_id));

  // 6. Upsert scored rows in a single transaction
  //    CRITICAL: dismissed_until is NOT in the SET clause — preserves user dismissals
  //    CRITICAL: archived documents are excluded — preserves archived_at state
  const upsertStmt = db.prepare(
    `INSERT INTO obsolescence_signals
       (document_id, confidence_score, flag_label, age_days, inbound_link_count,
        keyword_matched, similarity_score, detected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(document_id) DO UPDATE SET
       confidence_score   = excluded.confidence_score,
       flag_label         = excluded.flag_label,
       age_days           = excluded.age_days,
       inbound_link_count = excluded.inbound_link_count,
       keyword_matched    = excluded.keyword_matched,
       similarity_score   = excluded.similarity_score,
       detected_at        = excluded.detected_at`
  );

  const upsertMany = db.transaction(rows => {
    for (const row of rows) {
      upsertStmt.run(
        row.document_id,
        row.confidence_score,
        row.flag_label,
        row.age_days,
        row.inbound_link_count,
        row.keyword_matched,
        row.similarity_score
      );
    }
  });

  upsertMany(toUpsertFiltered);

  // 7. Clean up stale signals (documents that no longer qualify or were removed)
  //    CRITICAL: archived signals are never deleted — archived_at IS NOT NULL rows preserved
  let deletedCount = 0;
  if (docIdsScored.size > 0) {
    const placeholders = Array.from(docIdsScored)
      .map(() => '?')
      .join(', ');
    const deleteResult = db
      .prepare(
        `DELETE FROM obsolescence_signals WHERE document_id NOT IN (${placeholders}) AND archived_at IS NULL`
      )
      .run(...Array.from(docIdsScored));
    deletedCount = deleteResult.changes;
  } else {
    // No documents scored — clear all signals
    const deleteResult = db.prepare('DELETE FROM obsolescence_signals').run();
    deletedCount = deleteResult.changes;
  }

  // 8. Return summary
  return {
    scanned: docs.length,
    flagged: toUpsert.length,
    cleared: deletedCount,
  };
}
