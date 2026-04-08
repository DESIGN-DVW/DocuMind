// ESM import: default import works — use throughout Phase 16
// kuzu@0.11.3 ships index.mjs with `export default kuzu` so the ESM default import resolves cleanly.
// No createRequire fallback is needed.

import kuzu from 'kuzu';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, '../data/kuzu-smoke-test');

// Clean up any prior test run
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true });
}

const db = new kuzu.Database(testDir);
const conn = new kuzu.Connection(db);

await conn.query('CREATE NODE TABLE SmokeTest(id INT64, PRIMARY KEY(id))');
await conn.query('CREATE (:SmokeTest {id: 1})');

const result = await conn.query('MATCH (n:SmokeTest) RETURN n.id');
const rows = await result.getAll();
if (!rows.length) throw new Error('No rows returned from smoke query');

console.log('Kuzu smoke test PASSED. Rows:', rows);

// .close() method documentation (for server.mjs shutdown in Plan 03):
//   result.close() — exists; call BEFORE conn.close() to release native result handle
//   conn.close()   — exists and is synchronous; call BEFORE db.close()
//   db.close()     — exists and is synchronous; call last
//   Correct shutdown order: result.close() → conn.close() → db.close()
//   IMPORTANT: Call process.exit(0) explicitly after db.close() — kuzu@0.11.3 native
//   addon segfaults on macOS when V8 GC tries to finalize native objects after the
//   event loop ends. Explicit exit avoids this. In a long-running daemon (Plan 03),
//   this is not an issue since the process stays alive.
try {
  result.close();
} catch (e) {
  console.warn('result.close() warning:', e.message);
}
try {
  conn.close();
} catch (e) {
  console.warn('conn.close() warning:', e.message);
}
try {
  db.close();
} catch (e) {
  console.warn('db.close() warning:', e.message);
}

// Clean up temp directory
fs.rmSync(testDir, { recursive: true });

// Docker verified: node:22-bookworm-slim + kuzu@0.11.3 confirmed working
// Dockerfile changes required: none

process.exit(0);
