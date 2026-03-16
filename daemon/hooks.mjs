#!/usr/bin/env node

/**
 * DocuMind v2.0 — Claude Hook Handlers
 * Processes events from Claude Code hooks (post-write, post-commit, diagram-curated)
 */

import fs from 'fs/promises';
import path from 'path';
import {
  relinkDiagram,
  propagateRelinkAllRepos,
  syncRegistryFromDb,
} from '../processors/relink-processor.mjs';

/**
 * Process an incoming hook event
 * @param {import('better-sqlite3').Database} db
 * @param {object} event - Hook event payload
 * @param {string} event.event - Event type
 * @param {string} [event.file] - File path that triggered the event
 * @param {string} [event.repo] - Repository name
 * @param {string[]} [event.files] - Multiple files (for post-commit)
 * @param {string} [event.name] - Diagram name (for diagram-curated)
 * @param {string} [event.curatedUrl] - Curated FigJam URL (for diagram-curated)
 * @param {string} [event.registryPath] - Path to repository-registry.json
 */
export async function processHook(db, event) {
  const { event: type, file, repo, files, name, curatedUrl, registryPath } = event;

  switch (type) {
    case 'post-write':
      if (file && file.endsWith('.md')) {
        console.log(`[hooks] post-write: re-indexing ${file}`);
        // TODO: trigger single-file re-index + lint check
      }
      break;

    case 'post-commit':
      const mdFiles = (files || []).filter(f => f.endsWith('.md'));
      if (mdFiles.length > 0) {
        console.log(`[hooks] post-commit: re-indexing ${mdFiles.length} markdown file(s)`);
        // TODO: trigger batch re-index
      }
      break;

    case 'scan':
      console.log(`[hooks] manual scan trigger for ${repo || 'all repos'}`);
      // TODO: trigger scan-all-repos or single-repo scan
      break;

    case 'convert':
      console.log(`[hooks] conversion requested: ${file}`);
      // TODO: route to appropriate processor based on file extension
      break;

    case 'diagram-curated': {
      if (!name || !curatedUrl) {
        console.error('[hooks] diagram-curated: missing name or curatedUrl');
        return { status: 'error', error: 'Missing name or curatedUrl' };
      }

      console.log(`[hooks] diagram-curated: relinking "${name}" → ${curatedUrl}`);
      const result = relinkDiagram(db, name, curatedUrl);
      if (!result) {
        console.error(`[hooks] diagram-curated: diagram "${name}" not found`);
        return { status: 'error', error: `Diagram "${name}" not found` };
      }

      let propagated = {};
      if (result.oldUrl && registryPath) {
        try {
          propagated = await propagateRelinkAllRepos(db, result.oldUrl, curatedUrl, registryPath);
          console.log(
            `[hooks] diagram-curated: propagated to ${Object.keys(propagated).length} repo(s)`
          );
        } catch (err) {
          console.error('[hooks] diagram-curated: propagation error:', err.message);
        }
      }

      // Sync registry file for the affected repo
      if (registryPath && result.repository) {
        try {
          const registryJson = JSON.parse(await fs.readFile(registryPath, 'utf-8'));
          const repoEntry = registryJson.repositories.find(
            r => r.name === result.repository && r.active !== false
          );
          if (repoEntry) {
            await syncRegistryFromDb(
              db,
              result.repository,
              path.join(registryJson.basePath, repoEntry.path)
            );
          }
        } catch (err) {
          console.error('[hooks] diagram-curated: registry sync error:', err.message);
        }
      }

      return { status: 'relinked', oldUrl: result.oldUrl, propagated };
    }

    case 'stale-check': {
      console.log('[hooks] stale-check: scanning for stale diagrams...');
      const hasTable = db
        .prepare(
          `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='diagrams'`
        )
        .get();
      if (!hasTable.count) return { status: 'ok', stale: 0 };

      const stale = db
        .prepare('SELECT id, name, repository, mermaid_path FROM diagrams WHERE stale = 1')
        .all();
      if (stale.length > 0) {
        console.log(`[hooks] stale-check: ${stale.length} stale diagram(s) found:`);
        for (const d of stale) {
          console.log(`  - "${d.name}" (${d.repository || 'unknown'})`);
        }
      } else {
        console.log('[hooks] stale-check: all diagrams up to date');
      }
      return { status: 'ok', stale: stale.length, diagrams: stale };
    }

    default:
      console.log(`[hooks] Unknown event type: ${type}`);
  }
}
