#!/usr/bin/env node
/**
 * DocuMind — Standalone Kuzu graph rebuild script
 *
 * IMPORTANT: Stop the DocuMind daemon before running this script.
 * Kuzu is single-writer embedded — the daemon and this script cannot
 * both have the kuzu.Database directory open simultaneously.
 *
 * Usage:
 *   npm run graph:rebuild
 *   DOCUMIND_KUZU_DIR=/custom/path npm run graph:rebuild
 *
 * @module scripts/rebuild-kuzu-graph
 */

import kuzu from 'kuzu';
import Database from 'better-sqlite3';
import { DB_PATH, KUZU_DIR } from '../config/env.mjs';
import { initKuzuSchema } from '../graph/kuzu-init.mjs';
import { rebuildKuzuGraph } from '../graph/kuzu-sync.mjs';

console.log('');
console.log('[graph:rebuild] WARNING: Ensure the DocuMind daemon is stopped before running.');
console.log('[graph:rebuild] Kuzu is single-writer — concurrent access will fail.');
console.log('');
console.log(`[graph:rebuild] SQLite: ${DB_PATH}`);
console.log(`[graph:rebuild] Kuzu:   ${KUZU_DIR}`);
console.log('');

const db = new Database(DB_PATH);
const kuzuDb = new kuzu.Database(KUZU_DIR);

try {
  // Ensure schema exists (idempotent; required for fresh Kuzu dirs)
  await initKuzuSchema(kuzuDb);

  console.log('[graph:rebuild] Dropping all Kuzu nodes and edges...');
  const result = await rebuildKuzuGraph(db, kuzuDb);

  console.log('');
  console.log(`[graph:rebuild] Done: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
  console.log('[graph:rebuild] Kuzu graph rebuild complete.');
} catch (err) {
  console.error('[graph:rebuild] FAILED:', err.message);
  try {
    kuzuDb.close();
  } catch (_) {}
  db.close();
  process.exit(1);
}

// Close in correct order (Kuzu before SQLite) then exit.
// process.exit(0) is required — kuzu@0.11.3 GC segfaults without it (Plan 16-01).
try {
  kuzuDb.close();
} catch (_) {}
db.close();
process.exit(0);
