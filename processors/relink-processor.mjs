#!/usr/bin/env node

/**
 * DocuMind v2.0 — Diagram Relink Processor
 * Propagates FigJam URL changes when diagrams are curated into the central board.
 * DIAGRAM-REGISTRY.md is the source of truth for diagram paths & URL mapping.
 */

import fs from 'fs/promises';
import path from 'path';
import { writingNow } from '../daemon/registry-lock.mjs';

// ---------------------------------------------------------------------------
// Registry path relative to a repo root
// ---------------------------------------------------------------------------
const REGISTRY_REL = 'docs/diagrams/DIAGRAM-REGISTRY.md';

// ---------------------------------------------------------------------------
// Status derivation — single source of truth
// ---------------------------------------------------------------------------

/**
 * Canonical status derivation for a diagram row.
 * Single source of truth — called by all sync paths.
 * @param {{ curated_url?: string|null, stale?: number|boolean }} diagram
 * @returns {'curated' | 'stale' | 'generated'}
 */
export function computeStatus(diagram) {
  if (diagram.curated_url) return 'curated';
  if (diagram.stale) return 'stale';
  return 'generated';
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

/**
 * Set curated URL for a diagram in the database
 * @param {import('better-sqlite3').Database} db
 * @param {string} name - Diagram name
 * @param {string} curatedUrl - New curated FigJam URL
 * @returns {{ id: number, oldUrl: string|null } | null}
 */
export function relinkDiagram(db, name, curatedUrl) {
  const row = db
    .prepare('SELECT id, figjam_url, curated_url, repository FROM diagrams WHERE name = ?')
    .get(name);

  if (!row) return null;

  const now = new Date().toISOString();
  db.prepare('UPDATE diagrams SET curated_url = ?, curated_at = ?, stale = 0 WHERE id = ?').run(
    curatedUrl,
    now,
    row.id
  );

  return { id: row.id, oldUrl: row.figjam_url, repository: row.repository };
}

// ---------------------------------------------------------------------------
// Markdown find-replace
// ---------------------------------------------------------------------------

/**
 * Replace all occurrences of oldUrl with newUrl in .md files under repoPath
 * @param {string} oldUrl
 * @param {string} newUrl
 * @param {string} repoPath
 * @returns {Promise<string[]>} List of modified file paths
 */
export async function propagateRelink(oldUrl, newUrl, repoPath) {
  const modified = [];
  await walkAndReplace(repoPath, oldUrl, newUrl, modified);
  return modified;
}

/**
 * Propagate relink across all repos listed in repository-registry.json
 * @param {import('better-sqlite3').Database} db
 * @param {string} oldUrl
 * @param {string} newUrl
 * @param {string} registryPath - Path to repository-registry.json
 * @returns {Promise<Record<string, string[]>>} Map of repo → modified files
 */
export async function propagateRelinkAllRepos(db, oldUrl, newUrl, registryPath) {
  const registry = JSON.parse(await fs.readFile(registryPath, 'utf-8'));
  const results = {};

  for (const repo of registry.repositories) {
    if (repo.status !== 'active') continue;
    try {
      const modified = await propagateRelink(oldUrl, newUrl, repo.path);
      if (modified.length) results[repo.name] = modified;
    } catch {
      // Repo path may not exist on this machine — skip silently
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Registry markdown I/O (7-column format)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} RegistryRow
 * @property {string} diagram
 * @property {string} mmd
 * @property {string} png
 * @property {string} generatedUrl
 * @property {string} curatedUrl
 * @property {string} status
 * @property {string} updated
 */

/**
 * Parse a DIAGRAM-REGISTRY.md table into structured rows.
 * Supports both 5-column (legacy) and 7-column (v2) formats.
 * @param {string} filePath
 * @returns {Promise<{ header: string, rows: RegistryRow[] }>}
 */
export async function parseRegistryMarkdown(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  const header = lines.find(l => l.startsWith('# ')) || '# Diagram Registry';
  const rows = [];

  for (const line of lines) {
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = line
      .split('|')
      .map(c => c.trim())
      .filter(Boolean);

    // Skip header row
    if (cells[0] === 'Diagram') continue;

    if (cells.length >= 7) {
      // 7-column format
      rows.push({
        diagram: cells[0],
        mmd: cells[1],
        png: cells[2],
        generatedUrl: cells[3],
        curatedUrl: cells[4],
        status: cells[5],
        updated: cells[6],
      });
    } else if (cells.length >= 5) {
      // Legacy 5-column format
      rows.push({
        diagram: cells[0],
        mmd: cells[1],
        png: cells[2],
        generatedUrl: cells[3],
        curatedUrl: '',
        status: 'generated',
        updated: cells[4],
      });
    }
  }

  return { header, rows };
}

/**
 * Write rows back to DIAGRAM-REGISTRY.md in 7-column format
 * @param {string} filePath
 * @param {RegistryRow[]} rows
 * @param {string} [header]
 */
export async function writeRegistryMarkdown(filePath, rows, header) {
  const title = header || '# Diagram Registry';
  const lines = [
    title,
    '',
    '| Diagram | .mmd | .png | Generated URL | Curated URL | Status | Updated |',
    '| ------- | ---- | ---- | ------------- | ----------- | ------ | ------- |',
  ];

  for (const r of rows) {
    lines.push(
      `| ${r.diagram} | ${r.mmd} | ${r.png} | ${r.generatedUrl} | ${r.curatedUrl || ''} | ${r.status} | ${r.updated} |`
    );
  }

  lines.push('');
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
}

/**
 * Regenerate DIAGRAM-REGISTRY.md for a repo from the database
 * @param {import('better-sqlite3').Database} db
 * @param {string} repository - Repository name
 * @param {string} repoPath - Filesystem path to the repo root
 */
export async function syncRegistryFromDb(db, repository, repoPath) {
  const diagrams = db
    .prepare('SELECT * FROM diagrams WHERE repository = ? ORDER BY generated_at')
    .all(repository);

  const rows = diagrams.map(d => ({
    diagram: d.name,
    mmd: d.mermaid_path ? path.basename(d.mermaid_path) : '',
    png: d.mermaid_path ? path.basename(d.mermaid_path, '.mmd') + '.png' : '',
    generatedUrl: d.figjam_url || '',
    curatedUrl: d.curated_url || '',
    status: computeStatus(d),
    updated: (d.curated_at || d.generated_at || '').slice(0, 10),
  }));

  const registryPath = path.join(repoPath, REGISTRY_REL);
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await safeWriteRegistry(registryPath, rows, `# Diagram Registry — ${repository}`);

  return { path: registryPath, count: rows.length };
}

/**
 * Write registry markdown with in-flight guard.
 * Prevents watcher from re-processing our own writes.
 * @param {string} filePath
 * @param {RegistryRow[]} rows
 * @param {string} header
 */
export async function safeWriteRegistry(filePath, rows, header) {
  writingNow.add(filePath);
  try {
    await writeRegistryMarkdown(filePath, rows, header);
  } finally {
    setTimeout(() => writingNow.delete(filePath), 3000);
  }
}

// ---------------------------------------------------------------------------
// Reverse sync: registry markdown → DB
// ---------------------------------------------------------------------------

/**
 * Parse DIAGRAM-REGISTRY.md and upsert rows into the database.
 * Used when users manually edit the registry file.
 * @param {import('better-sqlite3').Database} db
 * @param {string} repository - Repository name
 * @param {string} repoPath - Filesystem path to the repo root
 * @returns {Promise<{ synced: number, created: number, updated: number }>}
 */
export async function reverseSyncFromRegistry(db, repository, repoPath) {
  const registryPath = path.join(repoPath, REGISTRY_REL);
  const { rows } = await parseRegistryMarkdown(registryPath);

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = db
      .prepare('SELECT id FROM diagrams WHERE name = ? AND repository = ?')
      .get(row.diagram, repository);

    const now = new Date().toISOString();

    if (existing) {
      db.prepare(
        `UPDATE diagrams
         SET curated_url = CASE WHEN ? != '' THEN ? ELSE curated_url END,
             curated_at = CASE WHEN ? != '' THEN ? ELSE curated_at END,
             stale = CASE WHEN ? = 'stale' THEN 1 ELSE 0 END
         WHERE id = ?`
      ).run(row.curatedUrl, row.curatedUrl, row.curatedUrl, now, row.status, existing.id);
      updated++;
    } else {
      // Infer diagram type from file name or default to flowchart
      db.prepare(
        `INSERT INTO diagrams (name, diagram_type, mermaid_path, figjam_url, curated_url,
                               curated_at, repository, generated_at, source_hash, stale)
         VALUES (?, 'flowchart', ?, ?, ?, ?, ?, ?, '', 0)`
      ).run(
        row.diagram,
        row.mmd ? path.join(repoPath, 'docs/diagrams', row.mmd) : null,
        row.generatedUrl || null,
        row.curatedUrl || null,
        row.curatedUrl ? now : null,
        repository,
        row.updated || now
      );
      created++;
    }
  }

  return { synced: rows.length, created, updated };
}

// ---------------------------------------------------------------------------
// Bulk relink: multiple diagrams at once
// ---------------------------------------------------------------------------

/**
 * Relink multiple diagrams in a single operation.
 * @param {import('better-sqlite3').Database} db
 * @param {Record<string, string>} mappings - Map of diagram name → curated URL
 * @param {string} [registryPath] - Path to repository-registry.json for propagation
 * @returns {Promise<{ results: Array<{name: string, status: string, oldUrl?: string}>, propagated: Record<string, string[]> }>}
 */
export async function bulkRelink(db, mappings, registryPath) {
  const results = [];
  const allPropagations = {};

  for (const [name, curatedUrl] of Object.entries(mappings)) {
    const result = relinkDiagram(db, name, curatedUrl);
    if (!result) {
      results.push({ name, status: 'not_found' });
      continue;
    }

    results.push({ name, status: 'relinked', oldUrl: result.oldUrl });

    // Propagate URL change
    if (result.oldUrl && registryPath) {
      try {
        const propagated = await propagateRelinkAllRepos(
          db,
          result.oldUrl,
          curatedUrl,
          registryPath
        );
        for (const [repo, files] of Object.entries(propagated)) {
          if (!allPropagations[repo]) allPropagations[repo] = [];
          allPropagations[repo].push(...files);
        }
      } catch {
        // Continue with other mappings on propagation error
      }
    }
  }

  return { results, propagated: allPropagations };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function walkAndReplace(dir, oldUrl, newUrl, modified) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    // Skip hidden dirs, node_modules, .git
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    if (entry.isDirectory()) {
      await walkAndReplace(full, oldUrl, newUrl, modified);
    } else if (entry.name.endsWith('.md')) {
      const content = await fs.readFile(full, 'utf-8');
      if (content.includes(oldUrl)) {
        await fs.writeFile(full, content.replaceAll(oldUrl, newUrl), 'utf-8');
        modified.push(full);
      }
    }
  }
}
