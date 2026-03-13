#!/usr/bin/env node

/**
 * DocuMind v2.0 — Diagram Relink Processor
 * Propagates FigJam URL changes when diagrams are curated into the central board.
 * DIAGRAM-REGISTRY.md is the source of truth for diagram paths & URL mapping.
 */

import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Registry path relative to a repo root
// ---------------------------------------------------------------------------
const REGISTRY_REL = 'docs/diagrams/DIAGRAM-REGISTRY.md';

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
    .prepare('SELECT id, figjam_url, curated_url FROM diagrams WHERE name = ?')
    .get(name);

  if (!row) return null;

  const now = new Date().toISOString();
  db.prepare('UPDATE diagrams SET curated_url = ?, curated_at = ? WHERE id = ?').run(
    curatedUrl,
    now,
    row.id
  );

  return { id: row.id, oldUrl: row.figjam_url };
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
    status: d.curated_url ? 'curated' : d.stale ? 'stale' : 'generated',
    updated: (d.curated_at || d.generated_at || '').slice(0, 10),
  }));

  const registryPath = path.join(repoPath, REGISTRY_REL);
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await writeRegistryMarkdown(registryPath, rows, `# Diagram Registry — ${repository}`);

  return { path: registryPath, count: rows.length };
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
