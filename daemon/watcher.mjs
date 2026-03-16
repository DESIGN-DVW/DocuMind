#!/usr/bin/env node

/**
 * DocuMind v2.0 — File Watcher
 * Monitors all DVWDesign repositories for markdown changes
 * Evolved from scripts/watch-and-index.mjs for daemon integration
 */

import { watch } from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import { writingNow } from './registry-lock.mjs';
import {
  reverseSyncFromRegistry,
  propagateRelinkAllRepos,
} from '../processors/relink-processor.mjs';

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
let ROOT = null;
let debounceTimer = null;
const pendingChanges = new Set();

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} root - DocuMind root directory
 */
export function initWatcher(db, root) {
  ROOT = root;
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

async function processPendingChanges(db) {
  try {
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

      // Determine repository from path (used for non-registry .md files)
      const repoMatch = change.path.replace(REPOS_ROOT + '/', '').split('/')[0];

      switch (ext) {
        case '.md': {
          if (path.basename(change.path) === 'DIAGRAM-REGISTRY.md') {
            // Resolve repo from repository-registry.json (handles compound paths like FigmaAPI/FigmailAPP)
            const registryJsonPath = path.join(
              ROOT,
              '../RootDispatcher/config/repository-registry.json'
            );
            const registryJson = JSON.parse(await fs.readFile(registryJsonPath, 'utf-8'));
            const repoEntry = registryJson.repositories.find(
              r =>
                r.active === true &&
                change.path.startsWith(path.join(registryJson.basePath, r.path) + '/')
            );
            if (!repoEntry) {
              console.log(`[watcher] DIAGRAM-REGISTRY.md change in unknown repo: ${change.path}`);
              break;
            }
            const repoName = repoEntry.name;
            const repoPath = path.join(registryJson.basePath, repoEntry.path);

            console.log(
              `[watcher] DIAGRAM-REGISTRY.md changed in ${repoName} — starting reverse sync`
            );

            // Snapshot: diagrams with no curated_url before reverse sync (for WATCH-03)
            const prevNoCurated = db
              .prepare(
                'SELECT name, figjam_url FROM diagrams WHERE repository = ? AND curated_url IS NULL'
              )
              .all(repoName);

            // Reverse sync: file -> DB
            const result = await reverseSyncFromRegistry(db, repoName, repoPath);
            console.log(
              `[watcher] Reverse sync complete for ${repoName}: ${result.synced} synced, ${result.created} created, ${result.updated} updated`
            );

            // WATCH-03: Detect newly-curated URLs and propagate
            if (prevNoCurated.length > 0) {
              const newlyCurated = prevNoCurated.filter(row => {
                const updated = db
                  .prepare('SELECT curated_url FROM diagrams WHERE name = ? AND repository = ?')
                  .get(row.name, repoName);
                return updated?.curated_url != null;
              });

              if (newlyCurated.length > 0) {
                console.log(
                  `[watcher] ${newlyCurated.length} newly-curated diagram(s) — propagating`
                );
                for (const diagram of newlyCurated) {
                  if (diagram.figjam_url) {
                    const curatedUrl = db
                      .prepare('SELECT curated_url FROM diagrams WHERE name = ? AND repository = ?')
                      .get(diagram.name, repoName)?.curated_url;
                    try {
                      await propagateRelinkAllRepos(
                        db,
                        diagram.figjam_url,
                        curatedUrl,
                        registryJsonPath
                      );
                    } catch (err) {
                      console.error(
                        `[watcher] Propagation error for ${diagram.name}:`,
                        err.message
                      );
                    }
                  }
                }
              }
            }
          } else {
            // TODO: trigger markdown-processor re-index for this file
            console.log(`[watcher] Queued markdown re-index: ${change.path} (repo: ${repoMatch})`);
          }
          break;
        }
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
  } catch (err) {
    console.error('[watcher] processPendingChanges error:', err.message);
  }
}
