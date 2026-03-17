#!/usr/bin/env node

/**
 * DocuMind v3.0 — Central Scan Orchestrator
 *
 * Consolidates the entire scan pipeline into a single callable function
 * with three modes (incremental, full, deep). Every entry point —
 * scheduler, REST endpoint, hooks, and watcher — delegates here.
 *
 * @module orchestrator
 */

import fg from 'fast-glob';
const { glob } = fg;
import fs from 'fs/promises';
import { indexMarkdown } from './processors/markdown-processor.mjs';
import { indexKeywords } from './processors/keyword-processor.mjs';
import { buildRelationships } from './graph/relations.mjs';

// ---------------------------------------------------------------------------
// Intelligence helpers — similarity, staleness, deviation detection
// ---------------------------------------------------------------------------

/**
 * Compute cosine similarity between two keyword score Maps.
 *
 * @param {Map<string,number>} vecA
 * @param {Map<string,number>} vecB
 * @returns {number} cosine similarity in [0, 1]
 */
function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [term, scoreA] of vecA) {
    magA += scoreA * scoreA;
    const scoreB = vecB.get(term);
    if (scoreB !== undefined) dot += scoreA * scoreB;
  }
  for (const [, scoreB] of vecB) {
    magB += scoreB * scoreB;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Detect similar documents within the same repository using TF-IDF cosine similarity.
 * Writes pairs with similarity >= 0.7 to content_similarities.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} ctx
 * @returns {number} count of similar pairs found
 */
function detectSimilarities(db, ctx) {
  const rows = db
    .prepare(
      `SELECT d.id, d.repository, k.keyword, k.score
       FROM documents d JOIN keywords k ON k.document_id = d.id`
    )
    .all();

  // Build keyword vectors per document: docId -> { repo, kws: Map<keyword, score> }
  const vectors = new Map();
  for (const row of rows) {
    if (!vectors.has(row.id)) vectors.set(row.id, { repo: row.repository, kws: new Map() });
    vectors.get(row.id).kws.set(row.keyword, row.score);
  }

  const docIds = [...vectors.keys()];
  let similarCount = 0;
  const now = new Date().toISOString();

  // Clear old auto-detected similarities
  db.prepare("DELETE FROM content_similarities WHERE notes LIKE '%auto_detected%'").run();

  const insert = db.prepare(`
    INSERT INTO content_similarities
      (doc1_id, doc2_id, similarity_score, deviation_type, notes, detected_at)
    VALUES (?, ?, ?, 'duplicate', '{"auto_detected": true}', ?)
  `);

  const batch = db.transaction(() => {
    for (let i = 0; i < docIds.length; i++) {
      for (let j = i + 1; j < docIds.length; j++) {
        const a = vectors.get(docIds[i]);
        const b = vectors.get(docIds[j]);
        if (a.repo !== b.repo) continue; // same-repo pairs only

        const sim = cosineSimilarity(a.kws, b.kws);
        if (sim >= 0.7) {
          // Ensure doc1_id < doc2_id to satisfy CHECK constraint
          const [d1, d2] = docIds[i] < docIds[j] ? [docIds[i], docIds[j]] : [docIds[j], docIds[i]];
          insert.run(d1, d2, Math.round(sim * 1000) / 1000, now);
          similarCount++;
        }
      }
    }
  });

  batch();

  console.log(`[orchestrator] Found ${similarCount} similar document pairs`);
  return similarCount;
}

/**
 * Detect stale documents via the relationship graph (imports/depends_on edges
 * pointing to documents modified after the source was last scanned).
 * Also includes age-based staleness for docs with zero graph edges.
 * Stores count in the statistics table.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {number} count of stale documents
 */
function detectStaleness(db) {
  // Graph-based staleness: source doc hasn't been re-scanned since its dependencies changed
  const graphStale = db
    .prepare(
      `SELECT DISTINCT s.id
       FROM documents s
       JOIN doc_relationships dr ON dr.source_doc_id = s.id
       JOIN documents t ON dr.target_doc_id = t.id
       WHERE dr.relationship_type IN ('imports', 'depends_on')
         AND t.modified_at > s.last_scanned`
    )
    .all();

  // Age-based staleness: docs with no graph edges, modified and scanned > 90 days ago
  const ageStale = db
    .prepare(
      `SELECT DISTINCT d.id
       FROM documents d
       WHERE d.modified_at < datetime('now', '-90 days')
         AND d.last_scanned < datetime('now', '-90 days')
         AND d.id NOT IN (
           SELECT source_doc_id FROM doc_relationships
           UNION
           SELECT target_doc_id FROM doc_relationships
         )`
    )
    .all();

  // Deduplicate by id
  const staleIds = new Set([...graphStale.map(r => r.id), ...ageStale.map(r => r.id)]);
  const count = staleIds.size;

  // Persist count to statistics table for /stats endpoint
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO statistics (stat_name, stat_value, updated_at)
     VALUES ('stale_documents', ?, ?)
     ON CONFLICT(stat_name) DO UPDATE SET stat_value = ?, updated_at = ?`
  ).run(String(count), now, String(count), now);

  console.log(`[orchestrator] Found ${count} stale documents`);
  return count;
}

/**
 * Detect deviations across all documents (5 types) and write to deviations table.
 * Clears previous auto-detected records before re-running (idempotent).
 *
 * Deviation types: rule_violation, content_drift, structure_change,
 *                  version_mismatch, metadata_inconsistency
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} ctx
 * @returns {number} count of deviations found
 */
function detectDeviations(db, ctx) {
  // Clear previous auto-detected deviations
  db.prepare("DELETE FROM deviations WHERE resolver = 'auto'").run();

  const now = new Date().toISOString();
  let deviationCount = 0;

  const insertDev = db.prepare(`
    INSERT INTO deviations
      (document_id, related_doc_id, deviation_type, severity, description, detected_at, resolver)
    VALUES (?, ?, ?, ?, ?, ?, 'auto')
  `);

  // --- 1. rule_violation: missing required frontmatter fields (title or created/date) ---
  const allDocs = db.prepare('SELECT id, path, frontmatter FROM documents').all();

  for (const doc of allDocs) {
    let fm = null;
    try {
      fm = doc.frontmatter ? JSON.parse(doc.frontmatter) : null;
    } catch {
      // Unparseable frontmatter counts as missing
    }

    const hasTitle = fm && (fm.title || fm.Title);
    const hasDate = fm && (fm.date || fm.created || fm.created_at || fm.Date);

    if (!hasTitle || !hasDate) {
      const missing = [];
      if (!hasTitle) missing.push('title');
      if (!hasDate) missing.push('date/created');
      insertDev.run(
        doc.id,
        null,
        'rule_violation',
        'minor',
        `Missing required frontmatter fields: ${missing.join(', ')}`,
        now
      );
      deviationCount++;
    }
  }

  // --- 2. content_drift: same-folder docs with same heading count but >50% content length variance ---
  const docsWithMeta = db
    .prepare(
      `SELECT id, path, repository, word_count,
              (length(content) - length(replace(content, '# ', ''))) as heading_count
       FROM documents WHERE content IS NOT NULL`
    )
    .all();

  // Group by (repository, folder)
  const folderMap = new Map();
  for (const doc of docsWithMeta) {
    const folder = doc.path.substring(0, doc.path.lastIndexOf('/'));
    const key = `${doc.repository}::${folder}`;
    if (!folderMap.has(key)) folderMap.set(key, []);
    folderMap.get(key).push(doc);
  }

  for (const [, group] of folderMap) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        // Same heading count (approximate structural similarity)
        if (a.heading_count === b.heading_count && a.heading_count > 0) {
          const wA = a.word_count || 1;
          const wB = b.word_count || 1;
          const ratio = Math.abs(wA - wB) / Math.max(wA, wB);

          if (ratio > 0.5) {
            // Shorter doc is likely the stale/outdated one
            const staleDoc = wA < wB ? a : b;
            const refDoc = wA < wB ? b : a;
            insertDev.run(
              staleDoc.id,
              refDoc.id,
              'content_drift',
              'info',
              `Same folder, same structure (${a.heading_count} headings) but >50% word count variance`,
              now
            );
            deviationCount++;
          }
        }
      }
    }
  }

  // --- 3. structure_change: docs modified in last 7 days with changed heading count ---
  const recentDocs = db
    .prepare(
      `SELECT id, path, repository, content, modified_at
       FROM documents
       WHERE modified_at > datetime('now', '-7 days')
         AND content IS NOT NULL`
    )
    .all();

  for (const doc of recentDocs) {
    // Count headings in content (lines starting with #)
    const headingCount = (doc.content.match(/^#{1,6}\s/gm) || []).length;

    // Compare with previously stored heading count — use word_count as proxy
    // (A sudden change in heading count relative to word count suggests restructuring)
    // Simple heuristic: if heading count is 0 in a doc with >200 words, flag it
    if (headingCount === 0) {
      const wc =
        db.prepare('SELECT word_count FROM documents WHERE id = ?').get(doc.id)?.word_count || 0;
      if (wc > 200) {
        insertDev.run(
          doc.id,
          null,
          'structure_change',
          'info',
          `Recently modified doc (${doc.modified_at}) has no headings but ${wc} words — possible structure loss`,
          now
        );
        deviationCount++;
      }
    }
  }

  // --- 4. version_mismatch: docs with version frontmatter where version != folder peers ---
  const versionedDocs = db
    .prepare(
      `SELECT id, path, repository, frontmatter
       FROM documents WHERE frontmatter LIKE '%version%'`
    )
    .all();

  // Group by folder, collect versions
  const versionFolderMap = new Map();
  for (const doc of versionedDocs) {
    let fm = null;
    try {
      fm = JSON.parse(doc.frontmatter);
    } catch {
      continue;
    }
    const version = fm?.version || fm?.Version;
    if (!version) continue;

    const folder = doc.path.substring(0, doc.path.lastIndexOf('/'));
    const key = `${doc.repository}::${folder}`;
    if (!versionFolderMap.has(key)) versionFolderMap.set(key, []);
    versionFolderMap.get(key).push({ id: doc.id, version });
  }

  for (const [, group] of versionFolderMap) {
    if (group.length < 2) continue;

    // Find the most common version (canonical)
    const versionCounts = new Map();
    for (const item of group) {
      versionCounts.set(item.version, (versionCounts.get(item.version) || 0) + 1);
    }
    const canonicalVersion = [...versionCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    for (const item of group) {
      if (item.version !== canonicalVersion) {
        insertDev.run(
          item.id,
          null,
          'version_mismatch',
          'minor',
          `Version "${item.version}" does not match folder majority version "${canonicalVersion}"`,
          now
        );
        deviationCount++;
      }
    }
  }

  // --- 5. metadata_inconsistency: frontmatter.category disagrees with classification column ---
  const classifiedDocs = db
    .prepare(
      `SELECT id, frontmatter, classification
       FROM documents WHERE classification IS NOT NULL AND frontmatter IS NOT NULL`
    )
    .all();

  for (const doc of classifiedDocs) {
    let fm = null;
    try {
      fm = JSON.parse(doc.frontmatter);
    } catch {
      continue;
    }
    const fmCategory = fm?.category || fm?.Category;
    if (!fmCategory) continue;

    // classification is materialized path like "engineering/architecture/adrs"
    // Check if frontmatter category appears anywhere in the classification path
    const classificationLower = doc.classification.toLowerCase();
    const fmCategoryLower = fmCategory.toLowerCase();

    if (
      !classificationLower.includes(fmCategoryLower) &&
      !fmCategoryLower.includes(classificationLower.split('/')[0])
    ) {
      insertDev.run(
        doc.id,
        null,
        'metadata_inconsistency',
        'info',
        `frontmatter.category "${fmCategory}" disagrees with classification "${doc.classification}"`,
        now
      );
      deviationCount++;
    }
  }

  console.log(`[orchestrator] Found ${deviationCount} deviations`);
  return deviationCount;
}

// ---------------------------------------------------------------------------
// FTS5 helpers
// ---------------------------------------------------------------------------

/**
 * Rebuild the documents FTS5 index.
 * Called once at the end of every scan mode — NOT per file.
 *
 * @param {import('better-sqlite3').Database} db
 */
function rebuildFTS(db) {
  db.prepare("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')").run();
  console.log('[orchestrator] FTS5 documents index rebuilt');
}

/**
 * Rebuild the keywords FTS5 index.
 * Called once at the end of deep scan keyword phase.
 *
 * @param {import('better-sqlite3').Database} db
 */
function rebuildKeywordsFTS(db) {
  db.prepare("INSERT INTO keywords_fts(keywords_fts) VALUES('rebuild')").run();
  console.log('[orchestrator] FTS5 keywords index rebuilt');
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Collect all .md files from the relevant repo roots.
 *
 * @param {object} ctx - Context profile (ctx.repoRoots: Array<{name, path}>)
 * @param {string|null} repo - Filter to a single repo by name, or null for all repos
 * @returns {Promise<Array<{filePath: string, repoName: string}>>}
 */
async function getRepoFiles(ctx, repo) {
  const roots = repo ? ctx.repoRoots.filter(r => r.name === repo) : ctx.repoRoots;

  if (repo && roots.length === 0) {
    throw new Error(`[orchestrator] Unknown repo "${repo}" — not found in ctx.repoRoots`);
  }

  const results = [];

  for (const root of roots) {
    const files = await glob('**/*.md', {
      cwd: root.path,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      absolute: true,
    });

    for (const filePath of files) {
      results.push({ filePath, repoName: root.name });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Scan modes
// ---------------------------------------------------------------------------

/**
 * Incremental scan — only files changed since last scan are re-indexed.
 * Uses mtime vs last_scanned comparison to skip unchanged files.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} ctx
 * @param {string|null} repo
 * @param {number} startMs
 * @returns {Promise<object>} result object
 */
async function runIncrementalScan(db, ctx, repo, startMs) {
  // Load existing doc state from DB keyed by path
  const existingDocs = db.prepare('SELECT path, content_hash, last_scanned FROM documents').all();
  const existingMap = new Map(existingDocs.map(d => [d.path, d]));

  const files = await getRepoFiles(ctx, repo);

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const { filePath, repoName } of files) {
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      // File disappeared between glob and stat — skip silently
      skipped++;
      continue;
    }

    const existing = existingMap.get(filePath);
    const mtime = stat.mtime.toISOString();

    if (existing && existing.last_scanned && mtime <= existing.last_scanned) {
      // File hasn't changed since last scan
      skipped++;
      continue;
    }

    const isNew = !existing;
    await indexMarkdown(db, filePath, repoName, ctx);
    if (isNew) {
      added++;
    } else {
      updated++;
    }
  }

  rebuildFTS(db);

  return {
    mode: 'incremental',
    repo,
    documentsFound: files.length,
    added,
    updated,
    skipped,
    durationMs: Date.now() - startMs,
  };
}

/**
 * Full scan — every file is re-indexed regardless of mtime.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} ctx
 * @param {string|null} repo
 * @param {number} startMs
 * @returns {Promise<object>} result object
 */
async function runFullScan(db, ctx, repo, startMs) {
  const existingDocs = db.prepare('SELECT path FROM documents').all();
  const existingPaths = new Set(existingDocs.map(d => d.path));

  const files = await getRepoFiles(ctx, repo);

  let added = 0;
  let updated = 0;

  for (const { filePath, repoName } of files) {
    const isNew = !existingPaths.has(filePath);
    await indexMarkdown(db, filePath, repoName, ctx);
    if (isNew) {
      added++;
    } else {
      updated++;
    }
  }

  // Deviation analysis
  const deviationCount = detectDeviations(db, ctx);

  rebuildFTS(db);

  return {
    mode: 'full',
    repo,
    documentsFound: files.length,
    added,
    updated,
    deviations: deviationCount,
    durationMs: Date.now() - startMs,
  };
}

/**
 * Deep scan — full index + keyword refresh + graph rebuild.
 * Always runs across ALL repos (no per-repo filtering).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} ctx
 * @param {number} startMs
 * @returns {Promise<object>} result object
 */
async function runDeepScan(db, ctx, startMs) {
  // 1. Full document indexing across all repos
  const fullResult = await runFullScan(db, ctx, null, startMs);

  // 2. Keyword refresh for every indexed document
  const allDocs = db.prepare('SELECT id, content FROM documents').all();
  let keywordCount = 0;

  for (const doc of allDocs) {
    const keywords = indexKeywords(db, doc.id, doc.content || '', ctx);
    keywordCount += Array.isArray(keywords) ? keywords.length : 0;
  }

  rebuildKeywordsFTS(db);
  console.log(
    `[orchestrator] Keywords indexed: ${keywordCount} across ${allDocs.length} documents`
  );

  // 3. Graph rebuild
  const edgeCount = buildRelationships(db);

  // 4. Staleness detection (requires relationship graph to be built first)
  const staleCount = detectStaleness(db);

  // 5. Similarity detection via TF-IDF cosine similarity on keyword vectors
  const similarCount = detectSimilarities(db, ctx);

  // FTS5 rebuild again after graph/keyword changes (documents may have been updated)
  rebuildFTS(db);

  return {
    mode: 'deep',
    repo: null,
    documentsFound: fullResult.documentsFound,
    added: fullResult.added,
    updated: fullResult.updated,
    keywords: keywordCount,
    edges: edgeCount,
    stale: staleCount,
    similarities: similarCount,
    durationMs: Date.now() - startMs,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a scan pipeline in one of three modes.
 *
 * @param {import('better-sqlite3').Database} db - Open better-sqlite3 database
 * @param {object} ctx - Context profile from loadProfile()
 * @param {object} [options]
 * @param {'incremental'|'full'|'deep'} [options.mode='incremental'] - Scan mode
 * @param {string|null} [options.repo=null] - Repo name to limit scan; null = all repos
 * @returns {Promise<object>} Result object with counts and durationMs
 *
 * @example
 * const result = await runScan(db, ctx, { mode: 'incremental', repo: 'DocuMind' });
 * // { mode: 'incremental', repo: 'DocuMind', documentsFound: 42, added: 0, updated: 3, skipped: 39, durationMs: 1200 }
 */
export async function runScan(db, ctx, options = {}) {
  const { mode = 'incremental', repo = null } = options;
  const startMs = Date.now();
  console.log(`[orchestrator] Starting ${mode} scan${repo ? ` for ${repo}` : ''}...`);

  let result;
  try {
    switch (mode) {
      case 'incremental':
        result = await runIncrementalScan(db, ctx, repo, startMs);
        break;
      case 'full':
        result = await runFullScan(db, ctx, repo, startMs);
        break;
      case 'deep':
        result = await runDeepScan(db, ctx, startMs);
        break;
      default:
        throw new Error(`[orchestrator] Unknown scan mode: ${mode}`);
    }
  } catch (err) {
    console.error(`[orchestrator] ${mode} scan failed:`, err.message);
    throw err;
  }

  console.log(`[orchestrator] ${mode} scan complete in ${result.durationMs}ms`);
  return result;
}
