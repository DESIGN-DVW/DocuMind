#!/usr/bin/env node

/**
 * DocuMind v2.0 — Claude Hook Handlers
 * Processes events from Claude Code hooks (post-write, post-commit)
 */

/**
 * Process an incoming hook event
 * @param {import('better-sqlite3').Database} db
 * @param {object} event - Hook event payload
 * @param {string} event.event - Event type: 'post-write', 'post-commit', 'manual'
 * @param {string} [event.file] - File path that triggered the event
 * @param {string} [event.repo] - Repository name
 * @param {string[]} [event.files] - Multiple files (for post-commit)
 */
export async function processHook(db, event) {
  const { event: type, file, repo, files } = event;

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

    default:
      console.log(`[hooks] Unknown event type: ${type}`);
  }
}
