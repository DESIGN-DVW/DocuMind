#!/usr/bin/env node

/**
 * DocuMind v2.0 — Background Documentation Intelligence Service
 * Express API on port 9000
 */

import express from 'express';
import helmet from 'helmet';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
import { initScheduler } from './scheduler.mjs';
import { initWatcher } from './watcher.mjs';
import { runScan } from '../orchestrator.mjs';
import {
  relinkDiagram,
  propagateRelink,
  propagateRelinkAllRepos,
  syncRegistryFromDb,
  reverseSyncFromRegistry,
  bulkRelink,
  computeStatus,
} from '../processors/relink-processor.mjs';
import { processHook } from './hooks.mjs';
import { initIngestion } from './ingestion.mjs';
import { loadProfile } from '../context/loader.mjs';
import { commonDir } from '../context/utils.mjs';
import { ROOT, PORT, DB_PATH, REPOS_DIR, MCP_MODE, KUZU_DIR } from '../config/env.mjs';
import kuzu from 'kuzu';
import { initKuzuSchema } from '../graph/kuzu-init.mjs';
import { syncToKuzu, rebuildKuzuGraph } from '../graph/kuzu-sync.mjs';
import { kuzuTraverseGraph } from '../graph/kuzu-queries.mjs';
import { LOCAL_BASE_PATH } from '../config/constants.mjs';

// --- Repository Ingestion (clone mode) ---
// No-op in mount mode; clones repos from GitHub in clone mode.
// Must run before loadProfile() so REPOS_DIR already points to cloned repos.
await initIngestion();

// --- Context Profile ---
let ctx;
try {
  ctx = await loadProfile();
  console.log(`[DocuMind] Loaded profile: ${ctx.profileId}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// --- Repository Registry (for PNG serving) ---
// registryPath is still needed directly by diagram relink endpoints
const registryPath = path.join(ROOT, '../RootDispatcher/config/repository-registry.json');
const REPOS_ROOT = commonDir(ctx.repoRoots.map(r => r.path)) || REPOS_DIR || LOCAL_BASE_PATH;
const repoRegistry = new Map(ctx.repoRoots.map(r => [r.name, path.relative(REPOS_ROOT, r.path)]));

// --- Database ---
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// --- Kuzu Graph Database ---
// Single kuzu.Database instance — never re-open elsewhere.
// All other modules receive kuzuDb as a parameter and create their own connections.
const kuzuDb = new kuzu.Database(KUZU_DIR);
await initKuzuSchema(kuzuDb);
console.log(`[Kuzu] Database path: ${KUZU_DIR}`);

// Startup backfill: if Kuzu graph is empty, populate from SQLite before serving requests
{
  const checkConn = new kuzu.Connection(kuzuDb);
  let kuzuNodeCount = 0;
  try {
    const res = await checkConn.query('MATCH (d:Document) RETURN COUNT(d) AS cnt');
    const rows = await res.getAll();
    kuzuNodeCount = rows[0]?.cnt ?? 0;
    try {
      res.close();
    } catch (_) {}
  } finally {
    try {
      checkConn.close();
    } catch (_) {}
  }
  if (kuzuNodeCount === 0) {
    console.log('[Kuzu] Empty graph detected — backfilling from SQLite...');
    try {
      const backfillResult = await rebuildKuzuGraph(db, kuzuDb);
      console.log(
        `[Kuzu] Backfill complete: ${backfillResult.nodeCount} nodes, ${backfillResult.edgeCount} edges`
      );
    } catch (backfillErr) {
      console.error('[Kuzu] Backfill failed (non-fatal):', backfillErr.message);
    }
  }
}

// --- Diagram source-doc lookup ---
// Cache: diagram id → absolute markdown path (or null). Invalidated on restart.
const sourceDocCache = new Map();

/**
 * Find the markdown file that contains/references a diagram.
 *
 * Search strategy:
 *   1. Grep the repo's docs/ folder for .md files that reference the .mmd
 *      basename (e.g. "dispatch-005-workflow"). This finds files that embed
 *      the diagram via a link or code block reference.
 *   2. If docs/ doesn't exist, fall back to grepping the repo root.
 *   3. Returns null (show "—") when no markdown references the diagram —
 *      i.e., the .mmd was generated standalone by an agent with no source doc.
 *
 * Deliberately does NOT search by diagram display name: that string appears
 * in session logs, READMEs, and memory files, producing false positives.
 *
 * @param {string} repoRoot  Absolute path to the repository root
 * @param {string} mmdBase   .mmd filename without extension, e.g. "dispatch-005-workflow"
 * @returns {Promise<string|null>}
 */
async function findMarkdownSource(repoRoot, mmdBase) {
  // Guard: repoRoot must be within REPOS_ROOT (same check as PNG endpoint)
  if (!repoRoot.startsWith(REPOS_ROOT)) return null;

  // Prefer searching only docs/ to avoid session/memory/dispatch noise
  const docsDir = path.join(repoRoot, 'docs');
  // Guard: docsDir must still be within repoRoot
  if (!docsDir.startsWith(repoRoot)) return null;

  let searchRoot;
  try {
    await fs.access(docsDir);
    searchRoot = docsDir;
  } catch {
    searchRoot = repoRoot;
  }

  try {
    const { stdout } = await execFileAsync(
      'grep',
      ['-rl', '--include=*.md', '--', mmdBase, searchRoot],
      { timeout: 4000 }
    );
    const first = stdout.trim().split('\n')[0];
    // Guard: result must stay within searchRoot
    if (!first || !first.startsWith(searchRoot)) return null;
    return first;
  } catch {
    // grep exits 1 when no match — not an error
    return null;
  }
}

// --- Express App ---
const app = express();
// Internal API server — no TLS, no public exposure.
// CSP disabled: dashboard uses inline scripts.
// HSTS disabled: plain HTTP only, HSTS would make browsers refuse HTTP connections.
app.use(helmet({ contentSecurityPolicy: false, hsts: false }));
app.use(express.json({ limit: '10mb' }));

// Dashboard static files
app.use('/dashboard', express.static(path.join(ROOT, 'dashboard')));

// Health check — includes DB liveness probe for Docker HEALTHCHECK
app.get('/health', async (_req, res) => {
  try {
    db.prepare('SELECT 1').get(); // SQLite probe

    // Count SQLite edges (source of truth)
    const sqliteEdges = db.prepare('SELECT COUNT(*) as count FROM doc_relationships').get().count;

    // Kuzu liveness + edge count
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
    const kuzuConn = new kuzu.Connection(kuzuDb);
    let kuzuEdges = 0;
    try {
      const probeRes = await kuzuConn.query('RETURN 1');
      await probeRes.getAll();
      try {
        probeRes.close();
      } catch (_) {}

      for (const rel of REL_TYPES) {
        const r = await kuzuConn.query(`MATCH ()-[e:${rel}]->() RETURN COUNT(e) AS cnt`);
        const rows = await r.getAll();
        kuzuEdges += rows[0]?.cnt ?? 0;
        try {
          r.close();
        } catch (_) {}
      }
    } finally {
      try {
        kuzuConn.close();
      } catch (_) {}
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
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

// Stats dashboard
app.get('/stats', (_req, res) => {
  const docs = db.prepare('SELECT COUNT(*) as count FROM documents').get();
  const repos = db.prepare('SELECT COUNT(DISTINCT repository) as count FROM documents').get();
  const issues = db
    .prepare('SELECT COUNT(*) as count FROM linting_issues WHERE fixed_at IS NULL')
    .get();
  const keywords = db
    .prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='keywords'`)
    .get();
  const hasKeywords = keywords.count > 0;
  const keywordCount = hasKeywords
    ? db.prepare('SELECT COUNT(*) as count FROM keywords').get().count
    : 0;
  const diagrams_exist = db
    .prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='diagrams'`)
    .get();
  const diagramCount =
    diagrams_exist.count > 0 ? db.prepare('SELECT COUNT(*) as count FROM diagrams').get().count : 0;
  const lastScan = db
    .prepare('SELECT scan_completed FROM scan_history ORDER BY scan_completed DESC LIMIT 1')
    .get();

  // Stale documents count (written by detectStaleness during deep scan)
  const staleRow = db
    .prepare("SELECT stat_value FROM statistics WHERE stat_name = 'stale_documents'")
    .get();
  const staleDocuments = staleRow ? Number(staleRow.stat_value) : 0;

  // Pending relinks + stale diagrams
  let pendingRelinks = 0;
  let staleDiagrams = 0;
  if (diagrams_exist.count > 0) {
    const hasRelinksView = db
      .prepare(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='view' AND name='pending_relinks'`
      )
      .get();
    if (hasRelinksView.count) {
      pendingRelinks = db.prepare('SELECT COUNT(*) as count FROM pending_relinks').get().count;
    }
    staleDiagrams = db
      .prepare('SELECT COUNT(*) as count FROM diagrams WHERE stale = 1')
      .get().count;
  }

  res.json({
    documents: docs.count,
    repositories: repos.count,
    open_issues: issues.count,
    keywords: keywordCount,
    diagrams: diagramCount,
    pending_relinks: pendingRelinks,
    stale_diagrams: staleDiagrams,
    stale_documents: staleDocuments,
    last_scan: lastScan?.scan_completed || null,
    uptime: process.uptime(),
  });
});

// Full-text search
app.get('/search', (req, res) => {
  const { q, repo, category, limit = 20 } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter "q"' });

  let sql = `
    SELECT d.id, d.path, d.repository, d.filename, d.category,
           snippet(documents_fts, 3, '<mark>', '</mark>', '...', 32) as snippet
    FROM documents_fts
    JOIN documents d ON documents_fts.rowid = d.id
    WHERE documents_fts MATCH ?
  `;
  const params = [q];

  if (repo) {
    sql += ' AND d.repository = ?';
    params.push(repo);
  }
  if (category) {
    sql += ' AND d.category = ?';
    params.push(category);
  }
  sql += ` ORDER BY rank LIMIT ?`;
  params.push(Number(limit));

  const results = db.prepare(sql).all(...params);
  res.json({ query: q, count: results.length, results });
});

// Document graph
app.get('/graph', async (req, res) => {
  const { repo, type, docId, direction = 'forward' } = req.query;

  if (docId) {
    // Kuzu path — directional traversal from a specific node
    const validDirections = ['forward', 'reverse', 'both'];
    const resolvedDirection = validDirections.includes(direction) ? direction : 'forward';
    try {
      const rows = await kuzuTraverseGraph(
        kuzuDb,
        parseInt(docId, 10),
        resolvedDirection,
        type || null
      );
      const nodeSet = new Set(rows.map(r => r.path));
      return res.json({
        node_count: nodeSet.size + 1, // +1 for source node
        edge_count: rows.length,
        edges: rows,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Existing SQLite list/browse mode — unchanged
  const hasTable = db
    .prepare(
      `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='doc_relationships'`
    )
    .get();
  if (!hasTable.count) return res.json({ nodes: [], edges: [] });

  let edgeSql = 'SELECT * FROM document_graph';
  const conditions = [];
  const params = [];

  if (repo) {
    conditions.push('(source_repo = ? OR target_repo = ?)');
    params.push(repo, repo);
  }
  if (type) {
    conditions.push('relationship_type = ?');
    params.push(type);
  }
  if (conditions.length) edgeSql += ' WHERE ' + conditions.join(' AND ');
  edgeSql += ' LIMIT 500';

  const edges = db.prepare(edgeSql).all(...params);

  const nodeSet = new Set();
  edges.forEach(e => {
    nodeSet.add(e.source_path);
    nodeSet.add(e.target_path);
  });

  res.json({
    node_count: nodeSet.size,
    edge_count: edges.length,
    edges,
  });
});

// Folder tree
app.get('/tree/:repo', (req, res) => {
  const { repo } = req.params;
  const hasTable = db
    .prepare(
      `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='folder_nodes'`
    )
    .get();
  if (!hasTable.count) return res.json({ repository: repo, folders: [] });

  const folders = db
    .prepare('SELECT * FROM folder_nodes WHERE repository = ? ORDER BY depth, path')
    .all(repo);
  res.json({ repository: repo, folder_count: folders.length, folders });
});

// Trigger scan
app.post('/scan', async (req, res) => {
  const { repo, mode = 'incremental' } = req.body;
  res.json({ status: 'queued', repo: repo || 'all', mode });
  // Non-blocking: run after response is sent
  setImmediate(async () => {
    try {
      const result = await runScan(db, ctx, { mode, repo: repo || null });
      console.log(`[server] /scan complete:`, result);
    } catch (err) {
      console.error('[server] /scan error:', err.message);
    }
  });
});

// Trigger index
app.post('/index', (_req, res) => {
  res.json({ status: 'queued', message: 'Re-index queued.' });
  setImmediate(async () => {
    try {
      const result = await runScan(db, ctx, { mode: 'incremental' });
      console.log(`[server] /index complete:`, result);
    } catch (err) {
      console.error('[server] /index error:', err.message);
    }
  });
});

// File conversion
app.post('/convert', (req, res) => {
  const { file, format } = req.body;
  if (!file) return res.status(400).json({ error: 'Missing "file" path' });
  res.json({ status: 'queued', file, format: format || 'markdown', message: 'Conversion queued.' });
  // TODO: route to appropriate processor
});

// Claude hook receiver
app.post('/hook', async (req, res) => {
  const { event, file, repo } = req.body;
  console.log(`[hook] ${event} — ${file || repo || 'unknown'}`);
  const result = await processHook(db, req.body, ctx);
  res.json({ status: 'received', event, ...(result || {}) });
});

// Keywords
app.get('/keywords', (req, res) => {
  const { repo, category, limit = 50 } = req.query;
  const hasTable = db
    .prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='keywords'`)
    .get();
  if (!hasTable.count) return res.json({ keywords: [] });

  let sql = `
    SELECT k.keyword, k.category, k.score, d.repository, d.path
    FROM keywords k JOIN documents d ON k.document_id = d.id
  `;
  const conditions = [];
  const params = [];
  if (repo) {
    conditions.push('d.repository = ?');
    params.push(repo);
  }
  if (category) {
    conditions.push('k.category = ?');
    params.push(category);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ` ORDER BY k.score DESC LIMIT ?`;
  params.push(Number(limit));

  const results = db.prepare(sql).all(...params);
  res.json({ count: results.length, keywords: results });
});

// Obsolescence signals — paginated, filterable
app.get('/obsolete', (req, res) => {
  try {
    // Guard: table must exist (migration may not have run on fresh install)
    const hasTable = db
      .prepare(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='obsolescence_signals'`
      )
      .get();
    if (!hasTable.count) return res.json({ total: 0, count: 0, offset: 0, rows: [] });

    const { repo, flag, limit = 50, offset = 0, include_dismissed = 'false' } = req.query;
    const now = new Date().toISOString();
    const conditions = [];
    const params = [];

    conditions.push('obs.archived_at IS NULL');
    if (include_dismissed !== 'true') {
      conditions.push('(obs.dismissed_until IS NULL OR obs.dismissed_until < ?)');
      params.push(now);
    }
    if (repo) {
      conditions.push('d.repository = ?');
      params.push(repo);
    }
    if (flag) {
      conditions.push('obs.flag_label = ?');
      params.push(flag);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const sql = `
      SELECT obs.id, obs.document_id, obs.confidence_score, obs.flag_label,
             obs.age_days, obs.inbound_link_count, obs.keyword_matched,
             obs.similarity_score, obs.detected_at, obs.dismissed_until,
             d.path, d.repository, d.filename, d.modified_at
      FROM obsolescence_signals obs
      JOIN documents d ON obs.document_id = d.id
      ${where}
      ORDER BY obs.confidence_score DESC
      LIMIT ? OFFSET ?
    `;
    const rowParams = [...params, Number(limit), Number(offset)];
    const rows = db.prepare(sql).all(...rowParams);

    const countSql = `
      SELECT COUNT(*) as cnt
      FROM obsolescence_signals obs
      JOIN documents d ON obs.document_id = d.id
      ${where}
    `;
    const total = db.prepare(countSql).get(...params).cnt;

    res.json({ total, count: rows.length, offset: Number(offset), rows });
  } catch (err) {
    console.error('[server] /obsolete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Batch dismiss — registered BEFORE /:id/dismiss to avoid route capture
app.post('/obsolete/batch-dismiss', (req, res) => {
  try {
    const hasTable = db
      .prepare(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='obsolescence_signals'`
      )
      .get();
    if (!hasTable.count) return res.status(404).json({ error: 'No signals table' });

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const stmt = db.prepare(`UPDATE obsolescence_signals SET dismissed_until = ? WHERE id = ?`);
    const batchDismiss = db.transaction(idList => {
      let updated = 0;
      for (const id of idList) {
        const result = stmt.run(expiry, Number(id));
        updated += result.changes;
      }
      return updated;
    });
    const updated = batchDismiss(ids);
    res.json({ status: 'dismissed', count: updated, dismissed_until: expiry });
  } catch (err) {
    console.error('[server] /obsolete/batch-dismiss error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Single dismiss — registered AFTER batch-dismiss
app.post('/obsolete/:id/dismiss', (req, res) => {
  try {
    const hasTable = db
      .prepare(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='obsolescence_signals'`
      )
      .get();
    if (!hasTable.count) return res.status(404).json({ error: 'Signal not found' });

    const { id } = req.params;
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = db
      .prepare(`UPDATE obsolescence_signals SET dismissed_until = ? WHERE id = ?`)
      .run(expiry, Number(id));
    if (result.changes === 0) return res.status(404).json({ error: 'Signal not found' });
    res.json({ status: 'dismissed', id: Number(id), dismissed_until: expiry });
  } catch (err) {
    console.error('[server] /obsolete/:id/dismiss error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Batch archive — permanent suppression; registered BEFORE /:id routes
app.post('/obsolete/batch-archive', (req, res) => {
  try {
    const hasTable = db
      .prepare(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='obsolescence_signals'`
      )
      .get();
    if (!hasTable.count) return res.status(404).json({ error: 'No signals table' });

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }
    const now = new Date().toISOString();
    const stmt = db.prepare(`UPDATE obsolescence_signals SET archived_at = ? WHERE id = ?`);
    const batchArchive = db.transaction(idList => {
      let updated = 0;
      for (const id of idList) {
        const result = stmt.run(now, Number(id));
        updated += result.changes;
      }
      return updated;
    });
    const updated = batchArchive(ids);
    res.json({ status: 'archived', count: updated, archived_at: now });
  } catch (err) {
    console.error('[server] /obsolete/batch-archive error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Single archive — permanent suppression for one row
app.post('/obsolete/:id/archive', (req, res) => {
  try {
    const hasTable = db
      .prepare(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='obsolescence_signals'`
      )
      .get();
    if (!hasTable.count) return res.status(404).json({ error: 'Signal not found' });

    const { id } = req.params;
    const now = new Date().toISOString();
    const result = db
      .prepare(`UPDATE obsolescence_signals SET archived_at = ? WHERE id = ?`)
      .run(now, Number(id));
    if (result.changes === 0) return res.status(404).json({ error: 'Signal not found' });
    res.json({ status: 'archived', id: Number(id), archived_at: now });
  } catch (err) {
    console.error('[server] /obsolete/:id/archive error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Single delete — permanently removes signal row from DB
app.delete('/obsolete/:id', (req, res) => {
  try {
    const hasTable = db
      .prepare(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='obsolescence_signals'`
      )
      .get();
    if (!hasTable.count) return res.status(404).json({ error: 'Signal not found' });

    const { id } = req.params;
    const result = db.prepare(`DELETE FROM obsolescence_signals WHERE id = ?`).run(Number(id));
    if (result.changes === 0) return res.status(404).json({ error: 'Signal not found' });
    res.json({ status: 'deleted', id: Number(id) });
  } catch (err) {
    console.error('[server] DELETE /obsolete/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper: derive PNG URL from mermaid_path (actual filename) or fallback to name
function pngUrlFor(d) {
  if (d.mermaid_path) {
    const base = path.basename(d.mermaid_path, '.mmd');
    return `/diagrams/png/${d.repository}/${base}.png`;
  }
  return `/diagrams/png/${d.repository}/${d.name}.png`;
}

// Diagrams
app.get('/diagrams', async (req, res) => {
  const { type, stale, repository } = req.query;
  const hasTable = db
    .prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='diagrams'`)
    .get();
  if (!hasTable.count) return res.json({ diagrams: [] });

  let sql = `
    SELECT d.*, doc.path AS source_path
    FROM diagrams d
    LEFT JOIN documents doc ON d.document_id = doc.id
  `;
  const conditions = [];
  const params = [];
  if (type) {
    conditions.push('d.diagram_type = ?');
    params.push(type);
  }
  if (stale === 'true') {
    conditions.push('d.stale = 1');
  }
  if (repository) {
    conditions.push('d.repository = ?');
    params.push(repository);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY d.generated_at DESC';

  const results = db.prepare(sql).all(...params);

  // Resolve source_path for each diagram in parallel.
  // source_path comes from the document JOIN (document_id → documents.path).
  // If that's null, grep the repo filesystem for the .mmd basename or diagram name.
  const enriched = await Promise.all(
    results.map(async d => {
      let source_path = d.source_path || null;

      if (!source_path && d.mermaid_path && d.repository) {
        const cacheKey = d.id;
        if (sourceDocCache.has(cacheKey)) {
          source_path = sourceDocCache.get(cacheKey);
        } else {
          const repoRelPath = repoRegistry.get(d.repository);
          if (repoRelPath !== undefined) {
            const repoRoot = path.resolve(REPOS_ROOT, repoRelPath);
            // Guard: resolved path must stay within REPOS_ROOT
            if (repoRoot.startsWith(REPOS_ROOT)) {
              const mmdBase = path.basename(d.mermaid_path, '.mmd');
              source_path = await findMarkdownSource(repoRoot, mmdBase);
            }
            sourceDocCache.set(cacheKey, source_path);
          }
        }
      }

      return {
        ...d,
        source_path,
        active_url: d.curated_url || d.figjam_url || null,
        png_url: pngUrlFor(d),
        status: computeStatus(d),
      };
    })
  );

  res.json({ count: enriched.length, diagrams: enriched });
});

// Flat map of all diagram active URLs — agent consumption
app.get('/diagrams/active-urls', (_req, res) => {
  const hasTable = db
    .prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='diagrams'`)
    .get();
  if (!hasTable.count) return res.json({});

  const rows = db.prepare('SELECT name, figjam_url, curated_url FROM diagrams').all();
  const urlMap = {};
  for (const row of rows) {
    urlMap[row.name] = row.curated_url || row.figjam_url || null;
  }
  res.json(urlMap);
});

// PNG file serving — path traversal guarded
app.get('/diagrams/png/:repo/:filename', (req, res) => {
  const { repo, filename } = req.params;

  // 1. Allowlist: repo name must be a known active repository
  if (!repoRegistry.has(repo)) {
    return res.status(400).json({ error: 'Unknown repository' });
  }

  // 2. Filename sanity: no path separators or traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  // 3. Must end in .png
  if (!filename.endsWith('.png')) {
    return res.status(400).json({ error: 'Only PNG files served' });
  }

  // 4. Resolve absolute path using registry's path field (handles nested repos like FigmaAPI/FigmailAPP)
  const repoDir = path.resolve(REPOS_ROOT, repoRegistry.get(repo));
  const filePath = path.resolve(repoDir, 'docs', 'diagrams', filename);

  // 5. Prefix guard: resolved path must stay within the repo directory
  if (!filePath.startsWith(repoDir)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  // 6. Serve with error callback
  res.sendFile(filePath, err => {
    if (err && err.code === 'ENOENT') return res.status(404).json({ error: 'PNG not found' });
    if (err) return res.status(500).json({ error: 'File serve error' });
  });
});

// Single diagram lookup — agent-facing, returns active URL + PNG URL + markdown snippet
app.get('/diagrams/lookup/:name', (req, res) => {
  const { name } = req.params;
  const hasTable = db
    .prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='diagrams'`)
    .get();
  if (!hasTable.count) return res.status(404).json({ error: `Diagram "${name}" not found` });

  const row = db.prepare('SELECT * FROM diagrams WHERE name = ?').get(name);
  if (!row) return res.status(404).json({ error: `Diagram "${name}" not found` });

  const activeUrl = row.curated_url || row.figjam_url || null;
  const pngUrl = pngUrlFor(row);
  const markdownSnippet = activeUrl
    ? `[![${row.name}](${pngUrl})](${activeUrl})`
    : `![${row.name}](${pngUrl})`;

  res.json({
    name: row.name,
    repository: row.repository,
    active_url: activeUrl,
    png_url: pngUrl,
    figjam_url: row.figjam_url || null,
    curated_url: row.curated_url || null,
    status: computeStatus(row),
    markdown_snippet: markdownSnippet,
  });
});

// Diagram relinking — set curated URL and propagate across markdown
app.post('/diagrams/relink', async (req, res) => {
  const { name, curatedUrl } = req.body;
  if (!name || !curatedUrl) {
    return res.status(400).json({ error: 'Missing "name" or "curatedUrl"' });
  }

  const result = relinkDiagram(db, name, curatedUrl);
  if (!result) {
    return res.status(404).json({ error: `Diagram "${name}" not found` });
  }

  // Propagate URL change across all repos
  let propagated = {};
  if (result.oldUrl) {
    try {
      propagated = await propagateRelinkAllRepos(db, result.oldUrl, curatedUrl, registryPath);
    } catch (err) {
      console.error('[relink] propagation error:', err.message);
    }
  }

  // Sync registry file for the affected repo
  const registryJson = JSON.parse(await fs.readFile(registryPath, 'utf-8'));
  const repoEntry = registryJson.repositories.find(
    r => r.name === result.repository && r.active !== false
  );
  if (repoEntry) {
    try {
      await syncRegistryFromDb(
        db,
        result.repository,
        path.join(registryJson.basePath, repoEntry.path)
      );
    } catch (err) {
      console.error('[relink] registry sync error:', err.message);
      // Non-fatal — relink succeeded, registry sync is best-effort
    }
  }

  res.json({
    status: 'relinked',
    diagram: name,
    oldUrl: result.oldUrl,
    curatedUrl,
    propagated,
  });

  // Re-index propagated files so DocuMind search reflects the new curated URL
  setImmediate(async () => {
    try {
      await runScan(db, ctx, { mode: 'incremental', repo: result.repository || null });
    } catch (err) {
      console.error('[relink] post-curate scan error:', err.message);
    }
  });
});

// List diagrams awaiting curation
app.get('/diagrams/pending-relinks', (_req, res) => {
  const hasView = db
    .prepare(
      `SELECT COUNT(*) as count FROM sqlite_master WHERE type='view' AND name='pending_relinks'`
    )
    .get();
  if (!hasView.count) return res.json({ pending: [] });

  const pending = db.prepare('SELECT * FROM pending_relinks').all();
  res.json({ count: pending.length, pending });
});

// Regenerate DIAGRAM-REGISTRY.md from database for a repo
app.post('/diagrams/sync-registry', async (req, res) => {
  const { repository, repoPath } = req.body;
  if (!repository || !repoPath) {
    return res.status(400).json({ error: 'Missing "repository" or "repoPath"' });
  }

  try {
    const result = await syncRegistryFromDb(db, repository, repoPath);
    res.json({ status: 'synced', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk relink — multiple diagrams in one call
app.post('/diagrams/bulk-relink', async (req, res) => {
  const { mappings } = req.body;
  if (!mappings || typeof mappings !== 'object' || Object.keys(mappings).length === 0) {
    return res.status(400).json({ error: 'Missing "mappings" object { diagramName: curatedUrl }' });
  }

  try {
    const result = await bulkRelink(db, mappings, registryPath);
    res.json({ status: 'completed', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reverse sync — parse DIAGRAM-REGISTRY.md and upsert into DB
app.post('/diagrams/reverse-sync', async (req, res) => {
  const { repository, repoPath } = req.body;
  if (!repository || !repoPath) {
    return res.status(400).json({ error: 'Missing "repository" or "repoPath"' });
  }

  try {
    const result = await reverseSyncFromRegistry(db, repository, repoPath);
    res.json({ status: 'synced', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Start ---
const server = app.listen(PORT, () => {
  console.log(`DocuMind v2.0 listening on port ${PORT}`);
  console.log(`Database: ${DB_PATH}`);

  // Initialize background services
  initScheduler(db, ROOT, ctx, kuzuDb);
  initWatcher(db, ROOT, ctx);
});

// --- Graceful Shutdown ---
function shutdown(signal) {
  console.error(`[DocuMind] ${signal} received — shutting down gracefully`);
  server.close(() => {
    try {
      try {
        kuzuDb.close();
      } catch (_) {
        /* Kuzu GC handles if close() unavailable */
      }
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    } catch (_err) {
      // Ignore errors during cleanup
    }
    process.exit(0);
  });
  // Safety valve: force exit after 5 seconds
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, db, kuzuDb, server };
