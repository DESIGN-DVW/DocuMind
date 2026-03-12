#!/usr/bin/env node

/**
 * DocuMind v2.0 — Background Documentation Intelligence Service
 * Express API on port 9000
 */

import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { initScheduler } from './scheduler.mjs';
import { initWatcher } from './watcher.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PORT = process.env.PORT || 9000;
const DB_PATH = process.env.DOCUMIND_DB || path.join(ROOT, 'data/documind.db');

// --- Database ---
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// --- Express App ---
const app = express();
app.use(express.json({ limit: '10mb' }));

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

  res.json({
    documents: docs.count,
    repositories: repos.count,
    open_issues: issues.count,
    keywords: keywordCount,
    diagrams: diagramCount,
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
  const { repo } = req.body;
  res.json({
    status: 'queued',
    repo: repo || 'all',
    message: 'Scan queued. Check /stats for progress.',
  });
  // Actual scan runs via imported scanner (async, non-blocking)
  // TODO: integrate with existing scan-all-repos.mjs
});

// Trigger index
app.post('/index', (_req, res) => {
  res.json({ status: 'queued', message: 'Re-index queued.' });
  // TODO: integrate with existing index-markdown.mjs
});

// File conversion
app.post('/convert', (req, res) => {
  const { file, format } = req.body;
  if (!file) return res.status(400).json({ error: 'Missing "file" path' });
  res.json({ status: 'queued', file, format: format || 'markdown', message: 'Conversion queued.' });
  // TODO: route to appropriate processor
});

// Claude hook receiver
app.post('/hook', (req, res) => {
  const { event, file, repo } = req.body;
  console.log(`[hook] ${event} — ${file || repo || 'unknown'}`);
  res.json({ status: 'received', event });
  // TODO: trigger appropriate action based on event type
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

// Diagrams
app.get('/diagrams', (req, res) => {
  const { type, stale } = req.query;
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
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY generated_at DESC';

  const results = db.prepare(sql).all(...params);
  res.json({ count: results.length, diagrams: results });
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`DocuMind v2.0 listening on port ${PORT}`);
  console.log(`Database: ${DB_PATH}`);

  // Initialize background services
  initScheduler(db, ROOT);
  initWatcher(db, ROOT);
});

export { app, db };
