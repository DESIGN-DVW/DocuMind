#!/usr/bin/env node

/**
 * DocuMind v2.0 — File Watcher
 * Monitors all DVWDesign repositories for markdown changes
 * Evolved from scripts/watch-and-index.mjs for daemon integration
 */

import { watch } from 'chokidar';
import path from 'path';
import { writingNow } from './registry-lock.mjs';

const REPOS_ROOT = '/Users/Shared/htdocs/github/DVWDesign';

const WATCH_PATTERNS = [
  `${REPOS_ROOT}/**/*.md`,
  `${REPOS_ROOT}/**/*.pdf`,
  `${REPOS_ROOT}/**/*.docx`,
  `${REPOS_ROOT}/**/*.rtf`,
];

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.cache/**',
  '**/index/**',
];

const DEBOUNCE_MS = 5000;
let debounceTimer = null;
const pendingChanges = new Set();

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} root - DocuMind root directory
 */
export function initWatcher(db, root) {
  console.log('[watcher] Initializing file watcher...');

  const watcher = watch(WATCH_PATTERNS, {
    ignored: IGNORE_PATTERNS,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  function queueChange(filePath, event) {
    if (writingNow.has(filePath)) {
      console.log(`[watcher] Skipping own write: ${filePath}`);
      return;
    }
    pendingChanges.add(JSON.stringify({ path: filePath, event }));

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      processPendingChanges(db);
    }, DEBOUNCE_MS);
  }

  watcher
    .on('add', filePath => {
      console.log(`[watcher] New file: ${filePath}`);
      queueChange(filePath, 'add');
    })
    .on('change', filePath => {
      console.log(`[watcher] Changed: ${filePath}`);
      queueChange(filePath, 'change');
    })
    .on('unlink', filePath => {
      console.log(`[watcher] Deleted: ${filePath}`);
      queueChange(filePath, 'unlink');
    })
    .on('ready', () => {
      console.log(
        `[watcher] Ready. Monitoring ${WATCH_PATTERNS.length} patterns across ${REPOS_ROOT}`
      );
    })
    .on('error', err => {
      console.error('[watcher] Error:', err.message);
    });

  return watcher;
}

function processPendingChanges(db) {
  const changes = [...pendingChanges].map(s => JSON.parse(s));
  pendingChanges.clear();

  console.log(`[watcher] Processing ${changes.length} change(s)...`);

  for (const change of changes) {
    const ext = path.extname(change.path).toLowerCase();

    if (change.event === 'unlink') {
      // Remove from database
      db.prepare('DELETE FROM documents WHERE path = ?').run(change.path);
      console.log(`[watcher] Removed from index: ${change.path}`);
      continue;
    }

    // Determine repository from path
    const repoMatch = change.path.replace(REPOS_ROOT + '/', '').split('/')[0];

    switch (ext) {
      case '.md':
        // TODO: trigger markdown-processor re-index for this file
        console.log(`[watcher] Queued markdown re-index: ${change.path} (repo: ${repoMatch})`);
        break;
      case '.pdf':
        // TODO: trigger pdf-processor
        console.log(`[watcher] Queued PDF processing: ${change.path}`);
        break;
      case '.docx':
      case '.rtf':
        // TODO: trigger word-processor conversion
        console.log(`[watcher] Queued conversion: ${change.path}`);
        break;
    }
  }
}
