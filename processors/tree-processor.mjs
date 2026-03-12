#!/usr/bin/env node

/**
 * DocuMind v2.0 — Folder Hierarchy Analyzer
 * Walks repo directories, classifies folders, stores in folder_nodes table,
 * generates Mermaid .mmd files for visualization
 */

import fs from 'fs/promises';
import path from 'path';

const REPOS_ROOT = '/Users/Shared/htdocs/github/DVWDesign';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  '.turbo',
  '.output',
  '__pycache__',
]);

const CLASSIFICATION_MAP = {
  docs: 'docs',
  doc: 'docs',
  documentation: 'docs',
  src: 'source',
  lib: 'source',
  components: 'source',
  pages: 'source',
  views: 'source',
  hooks: 'source',
  contexts: 'source',
  config: 'config',
  configs: 'config',
  '.claude': 'config',
  tests: 'tests',
  test: 'tests',
  __tests__: 'tests',
  scripts: 'scripts',
  tools: 'scripts',
  assets: 'assets',
  public: 'assets',
  images: 'assets',
  icons: 'assets',
  server: 'source',
  client: 'source',
  packages: 'source',
  memory: 'docs',
  dispatches: 'docs',
  proposals: 'docs',
};

/**
 * Analyze a repository's folder hierarchy
 * @param {import('better-sqlite3').Database} db
 * @param {string} repoName
 * @param {number} [maxDepth=4]
 */
export async function analyzeRepo(db, repoName, maxDepth = 4) {
  const repoPath = path.join(REPOS_ROOT, repoName);
  const now = new Date().toISOString();

  // Clear existing folder nodes for this repo
  db.prepare('DELETE FROM folder_nodes WHERE repository = ?').run(repoName);

  const insert = db.prepare(`
    INSERT INTO folder_nodes (path, repository, parent_path, depth, doc_count,
                             total_size, classification, last_scanned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const folders = [];
  await walkDir(repoPath, repoName, 0, maxDepth, null, folders);

  const batch = db.transaction(items => {
    for (const f of items) {
      insert.run(
        f.path,
        repoName,
        f.parentPath,
        f.depth,
        f.docCount,
        f.totalSize,
        f.classification,
        now
      );
    }
  });

  batch(folders);
  console.log(`[tree] Analyzed ${repoName}: ${folders.length} folders`);
  return folders;
}

async function walkDir(dirPath, repoName, depth, maxDepth, parentPath, results) {
  if (depth > maxDepth) return;

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  const dirName = path.basename(dirPath);
  if (IGNORE_DIRS.has(dirName) && depth > 0) return;

  let docCount = 0;
  let totalSize = 0;

  for (const entry of entries) {
    if (entry.isFile()) {
      try {
        const stat = await fs.stat(path.join(dirPath, entry.name));
        totalSize += stat.size;
        if (entry.name.endsWith('.md') || entry.name.endsWith('.pdf')) {
          docCount++;
        }
      } catch {
        /* skip */
      }
    }
  }

  const classification = CLASSIFICATION_MAP[dirName.toLowerCase()] || null;

  results.push({
    path: dirPath,
    parentPath,
    depth,
    docCount,
    totalSize,
    classification,
  });

  for (const entry of entries) {
    if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
      await walkDir(
        path.join(dirPath, entry.name),
        repoName,
        depth + 1,
        maxDepth,
        dirPath,
        results
      );
    }
  }
}

/**
 * Generate a Mermaid .mmd file for a repo's folder hierarchy
 * @param {import('better-sqlite3').Database} db
 * @param {string} repoName
 * @param {string} outputDir - Where to write .mmd file
 * @returns {string} Path to generated .mmd file
 */
export async function generateTreeMermaid(db, repoName, outputDir) {
  const folders = db
    .prepare('SELECT * FROM folder_nodes WHERE repository = ? AND depth <= 3 ORDER BY depth, path')
    .all(repoName);

  if (folders.length === 0) return null;

  const lines = ['flowchart LR'];
  const nodeIds = new Map();
  let nodeCounter = 0;

  for (const folder of folders) {
    const name = path.basename(folder.path);
    const id = `n${nodeCounter++}`;
    nodeIds.set(folder.path, id);

    const label = folder.classification ? `${name} (${folder.classification})` : name;

    lines.push(`    ${id}["${label}"]`);

    if (folder.parent_path) {
      const parentId = nodeIds.get(folder.parent_path);
      if (parentId) {
        lines.push(`    ${parentId} --> ${id}`);
      }
    }

    // Color by classification
    if (folder.classification) {
      const colors = {
        docs: 'fill:#4A90D9,color:#fff',
        source: 'fill:#27AE60,color:#fff',
        config: 'fill:#F39C12,color:#fff',
        tests: 'fill:#9B59B6,color:#fff',
        scripts: 'fill:#E74C3C,color:#fff',
        assets: 'fill:#1ABC9C,color:#fff',
      };
      if (colors[folder.classification]) {
        lines.push(`    style ${id} ${colors[folder.classification]}`);
      }
    }
  }

  const mermaidContent = lines.join('\n') + '\n';
  const outputPath = path.join(outputDir, `${repoName}-tree.mmd`);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, mermaidContent, 'utf-8');

  return outputPath;
}
