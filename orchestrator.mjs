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

  // Deviation analysis placeholder (Plan 04 will implement)
  console.log('[orchestrator] Deviation analysis: not yet implemented');

  rebuildFTS(db);

  return {
    mode: 'full',
    repo,
    documentsFound: files.length,
    added,
    updated,
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

  // 4. Staleness and similarity detection placeholders (Plan 04)
  console.log('[orchestrator] Staleness detection: not yet implemented');
  console.log('[orchestrator] Similarity detection: not yet implemented');

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
