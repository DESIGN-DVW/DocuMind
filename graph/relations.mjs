#!/usr/bin/env node

/**
 * DocuMind v2.0 — Document Relationship Builder
 * Detects and stores relationships between documents (graph edges)
 */

import path from 'path';

/**
 * Build relationships for all documents in the database
 * @param {import('better-sqlite3').Database} db
 */
export function buildRelationships(db) {
  console.log('[graph] Building document relationships...');
  const now = new Date().toISOString();

  const docs = db.prepare('SELECT id, path, repository, content, category FROM documents').all();
  const docMap = new Map(docs.map(d => [d.path, d]));
  const docById = new Map(docs.map(d => [d.id, d]));

  let edgeCount = 0;

  const insertRel = db.prepare(`
    INSERT OR IGNORE INTO doc_relationships
      (source_doc_id, target_doc_id, relationship_type, weight, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const batch = db.transaction(() => {
    for (const doc of docs) {
      // 1. Detect markdown links to other docs
      const linkPattern = /\[([^\]]*)\]\(([^)]+\.md)\)/g;
      let match;
      while ((match = linkPattern.exec(doc.content || '')) !== null) {
        const linkPath = match[2];
        // Resolve relative paths
        const resolvedPath = linkPath.startsWith('/')
          ? linkPath
          : path.resolve(path.dirname(doc.path), linkPath);

        const targetDoc = docMap.get(resolvedPath);
        if (targetDoc && targetDoc.id !== doc.id) {
          insertRel.run(
            doc.id,
            targetDoc.id,
            'imports',
            1.0,
            JSON.stringify({ link_text: match[1], auto_detected: true }),
            now
          );
          edgeCount++;
        }
      }

      // 2. Detect dispatch relationships
      if (doc.category === 'dispatch' && doc.content) {
        const targetRepoPattern = /targets?:\s*\[([^\]]+)\]/i;
        const repoMatch = targetRepoPattern.exec(doc.content);
        if (repoMatch) {
          const repos = repoMatch[1].split(',').map(r => r.trim().replace(/['"]/g, ''));
          for (const repo of repos) {
            // Find CLAUDE.md or README.md in target repo
            const targetDocs = docs.filter(
              d =>
                d.repository === repo &&
                (d.category === 'claude-instructions' || d.category === 'readme')
            );
            for (const target of targetDocs) {
              insertRel.run(
                doc.id,
                target.id,
                'dispatched_to',
                1.0,
                JSON.stringify({ auto_detected: true, target_repo: repo }),
                now
              );
              edgeCount++;
            }
          }
        }
      }

      // 3. Detect supersedes relationships (version patterns)
      if (doc.content) {
        const supersedesPattern = /supersedes|replaces|deprecated.*in favor of/i;
        if (supersedesPattern.test(doc.content)) {
          // Find docs with similar names in same repo
          const basename = path.basename(doc.path, '.md');
          const similarDocs = docs.filter(
            d =>
              d.id !== doc.id &&
              d.repository === doc.repository &&
              path.basename(d.path, '.md').includes(basename.replace(/-v?\d+$/, ''))
          );
          for (const similar of similarDocs) {
            insertRel.run(
              doc.id,
              similar.id,
              'supersedes',
              0.7,
              JSON.stringify({ auto_detected: true, confidence: 0.7 }),
              now
            );
            edgeCount++;
          }
        }
      }

      // 4. Same-folder siblings = related_to (weak relationship)
      const dirPath = path.dirname(doc.path);
      const siblings = docs.filter(
        d =>
          d.id !== doc.id &&
          d.id > doc.id && // prevent duplicate pairs
          path.dirname(d.path) === dirPath
      );
      for (const sibling of siblings) {
        insertRel.run(
          doc.id,
          sibling.id,
          'related_to',
          0.3,
          JSON.stringify({ reason: 'same_folder', auto_detected: true }),
          now
        );
        edgeCount++;
      }
    }
  });

  batch();
  console.log(`[graph] Built ${edgeCount} relationships across ${docs.length} documents`);
  return edgeCount;
}

/**
 * Find all documents related to a given document (up to N hops)
 * @param {import('better-sqlite3').Database} db
 * @param {number} docId
 * @param {number} [maxDepth=2]
 */
export function findRelated(db, docId, maxDepth = 2) {
  return db
    .prepare(
      `
    WITH RECURSIVE related AS (
      SELECT target_doc_id as doc_id, relationship_type, weight, 1 as depth
      FROM doc_relationships WHERE source_doc_id = ?
      UNION ALL
      SELECT dr.target_doc_id, dr.relationship_type, dr.weight, r.depth + 1
      FROM doc_relationships dr
      JOIN related r ON dr.source_doc_id = r.doc_id
      WHERE r.depth < ?
    )
    SELECT DISTINCT
      r.doc_id, r.relationship_type, r.weight, r.depth,
      d.path, d.repository, d.filename, d.category
    FROM related r
    JOIN documents d ON r.doc_id = d.id
    ORDER BY r.depth, r.weight DESC
  `
    )
    .all(docId, maxDepth);
}
