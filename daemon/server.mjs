#!/usr/bin/env node

/**
 * DocuMind v2.0 — Background Documentation Intelligence Service
 * Express API on port 9000
 */

import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
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
import { loadProfile } from '../context/loader.mjs';
import { commonDir } from '../context/utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PORT = process.env.PORT || 9000;
const DB_PATH = process.env.DOCUMIND_DB || path.join(ROOT, 'data/documind.db');

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
const REPOS_ROOT =
  commonDir(ctx.repoRoots.map(r => r.path)) || '/Users/Shared/htdocs/github/DVWDesign';
const repoRegistry = new Map(ctx.repoRoots.map(r => [r.name, path.relative(REPOS_ROOT, r.path)]));

// --- Database ---
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// --- Express App ---
const app = express();
app.use(express.json({ limit: '10mb' }));

// Dashboard static files
app.use('/dashboard', express.static(path.join(ROOT, 'dashboard')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0', uptime: process.uptime() });
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
app.get('/graph', (req, res) => {
  const { repo, type, depth = 2 } = req.query;
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
  const result = await processHook(db, req.body);
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

// Helper: derive PNG URL from mermaid_path (actual filename) or fallback to name
function pngUrlFor(d) {
  if (d.mermaid_path) {
    const base = path.basename(d.mermaid_path, '.mmd');
    return `/diagrams/png/${d.repository}/${base}.png`;
  }
  return `/diagrams/png/${d.repository}/${d.name}.png`;
}

// Diagrams
app.get('/diagrams', (req, res) => {
  const { type, stale, repository } = req.query;
  const hasTable = db
    .prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='diagrams'`)
    .get();
  if (!hasTable.count) return res.json({ diagrams: [] });

  let sql = 'SELECT * FROM diagrams';
  const conditions = [];
  const params = [];
  if (type) {
    conditions.push('diagram_type = ?');
    params.push(type);
  }
  if (stale === 'true') {
    conditions.push('stale = 1');
  }
  if (repository) {
    conditions.push('repository = ?');
    params.push(repository);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY generated_at DESC';

  const results = db.prepare(sql).all(...params);
  const enriched = results.map(d => ({
    ...d,
    active_url: d.curated_url || d.figjam_url || null,
    png_url: pngUrlFor(d),
    status: computeStatus(d),
  }));
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
  const registryPath = path.join(ROOT, '../RootDispatcher/config/repository-registry.json');
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

  const registryPath = path.join(ROOT, '../RootDispatcher/config/repository-registry.json');
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
app.listen(PORT, () => {
  console.log(`DocuMind v2.0 listening on port ${PORT}`);
  console.log(`Database: ${DB_PATH}`);

  // Initialize background services
  initScheduler(db, ROOT, ctx);
  initWatcher(db, ROOT, ctx);
});

export { app, db };
