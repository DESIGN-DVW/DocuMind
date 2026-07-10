# Phase 16: Kuzu Foundation — Research

**Researched:** 2026-04-07
**Domain:** Kuzu embedded graph DB — Node.js ESM integration, schema initialization, Docker verification
**Confidence:** HIGH (codebase inspected directly; Kuzu API confirmed via prior milestone research; milestone research files loaded)

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
| ---- | ------------- | ----------------- |
| GRAPH-01 | Kuzu DB initializes with document relationship schema on daemon startup | Schema DDL defined below; server.mjs integration pattern confirmed |
| GRAPH-02 | Kuzu database path is configurable via `DOCUMIND_KUZU_DIR` env var | env.mjs pattern established; new export follows existing DB_PATH pattern |
| GRAPH-03 | Docker image builds successfully with Kuzu native addon (Debian bookworm base) | Dockerfile already uses `node:22-bookworm-slim`; Kuzu prebuilts are glibc-compatible; builder stage already has python3/make/g++ |

</phase_requirements>

---

## Summary

Phase 16 establishes the Kuzu embedded graph database as a verified, operational foundation inside the DocuMind daemon. The phase has three discrete deliverables: (1) prove `import kuzu from 'kuzu'` works in Node.js 22 ESM before writing any app code; (2) modify `daemon/server.mjs` to open a `kuzu.Database` and initialize the 8-table schema on startup; (3) add `DOCUMIND_KUZU_DIR` to `config/env.mjs` and confirm the Docker image builds with Kuzu installed.

The milestone research established that Kuzu `0.11.3` is the pinned version (project archived October 2025, no new releases). The npm package ships pre-built binaries for glibc Linux (Node 20/22), so no source compilation occurs on Debian bookworm. The existing Dockerfile already uses `node:22-bookworm-slim` and already installs `python3 make g++` in the builder stage — no Dockerfile changes are needed for Kuzu to install cleanly. The highest-risk item is ESM import behavior: Kuzu's npm package has a known WASM ESM issue (`GitHub Issue #5517`) that may or may not affect the native N-API build. The smoke test must resolve this empirically before any application code is written.

**Primary recommendation:** Pin `kuzu@0.11.3`, run the ESM smoke test first, initialize the schema via a new `graph/kuzu-init.mjs` module called from `server.mjs` startup, and expose the single `kuzu.Database` instance via dependency injection (never re-open it).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
| --------- | --------- | --------- | -------------- |
| `kuzu` | `0.11.3` (exact pin) | Embedded property graph DB with Cypher query language | Only embedded graph DB with a first-class Node.js N-API binary; ships prebuilt binaries for Node 20/22 on glibc Linux; no server process required; runs in-process alongside SQLite |

### Supporting

No additional libraries needed for Phase 16. LangChain packages (`@langchain/core`, `@langchain/openai`) are deferred to Phase 20 (text-to-Cypher).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ------------ | ----------- | ---------- |
| `kuzu@0.11.3` | `kuzu@latest` | `latest` would track the archived upstream or an unverified fork; exact pin is required |
| `kuzu@0.11.3` | LadybugDB / Bighorn forks | Neither has a published npm package as of April 2026 |

#### Installation

```bash

npm install kuzu@0.11.3

```

---

## Architecture Patterns

### Recommended Project Structure Changes (Phase 16 only)

```text

DocuMind/
├── daemon/
│   └── server.mjs          MODIFIED — open kuzuDb after SQLite init; call initKuzuSchema; pass kuzuDb to initScheduler
├── graph/
│   ├── relations.mjs       UNCHANGED
│   └── kuzu-init.mjs       NEW — initKuzuSchema(kuzuDb): creates node table + 8 edge tables; idempotent
├── config/
│   └── env.mjs             MODIFIED — add KUZU_DIR export
├── scripts/
│   └── kuzu-smoke-test.mjs NEW (throwaway) — ESM import verification; run once, delete or keep in scripts/
└── data/
    └── documind.kuzu/      NEW (directory) — Kuzu on-disk store; gitignored

```

### Pattern 1: ESM Smoke Test (Run Before Writing App Code)

**What:** A standalone throwaway script that imports kuzu and opens/closes a database — run before touching server.mjs. Resolves GRAPH-03 risk item.

**When to use:** First task of the phase, before any other code is written.

```javascript

// scripts/kuzu-smoke-test.mjs
// Source: confirmed pattern from Kuzu Node.js API docs + PITFALLS.md Integration Gotchas
import kuzu from 'kuzu';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, '../data/kuzu-smoke-test');

// Clean up any prior run
if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });

const db = new kuzu.Database(testDir);
const conn = new kuzu.Connection(db);
await conn.query('CREATE NODE TABLE SmokeTest(id INT64, PRIMARY KEY(id))');
await conn.query('CREATE (:SmokeTest {id: 1})');
const result = await conn.query('MATCH (n:SmokeTest) RETURN n.id');
const rows = await result.getAll();
console.log('Kuzu smoke test PASSED. Rows:', rows);

// Cleanup
conn.close();
db.close();
fs.rmSync(testDir, { recursive: true });

```

**If `import kuzu from 'kuzu'` fails** with "package subpath not exported" or similar ESM error, use the `createRequire` fallback:

```javascript

// Fallback: createRequire workaround if ESM default import fails
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const kuzu = require('kuzu');

```

Document which form works and use it consistently throughout the phase.

### Pattern 2: Kuzu Schema Initialization Module

**What:** A single `graph/kuzu-init.mjs` module that creates the Document node table and 8 typed edge tables. Called once at daemon startup. Idempotent — uses `IF NOT EXISTS`.

**When to use:** Called from `server.mjs` after SQLite init, before Express app starts.

```javascript

// graph/kuzu-init.mjs
// Source: ARCHITECTURE.md confirmed patterns + SQLite schema.sql relationship types

/**

 * Initialize the Kuzu schema for DocuMind.

 * Creates Document node table and 8 typed edge tables.

 * Idempotent — safe to call on every daemon startup.

 * @param {import('kuzu').Database} kuzuDb

 */
export async function initKuzuSchema(kuzuDb) {
  const conn = new kuzu.Connection(kuzuDb);
  try {
    // Node table — mirrors documents columns needed for graph queries
    await conn.query(`
      CREATE NODE TABLE IF NOT EXISTS Document(
        id INT64,
        path STRING,
        repository STRING,
        filename STRING,
        category STRING,
        PRIMARY KEY(id)
      )
    `);

    // 8 typed edge tables — one per relationship_type in doc_relationships
    // Each table maps to a relationship_type value used in relations.mjs
    await conn.query(`CREATE REL TABLE IF NOT EXISTS imports(FROM Document TO Document, weight DOUBLE, link_text STRING)`);
    await conn.query(`CREATE REL TABLE IF NOT EXISTS dispatched_to(FROM Document TO Document, target_repo STRING)`);
    await conn.query(`CREATE REL TABLE IF NOT EXISTS supersedes(FROM Document TO Document, confidence DOUBLE)`);
    await conn.query(`CREATE REL TABLE IF NOT EXISTS related_to(FROM Document TO Document, weight DOUBLE, reason STRING)`);
    await conn.query(`CREATE REL TABLE IF NOT EXISTS parent_of(FROM Document TO Document)`);
    await conn.query(`CREATE REL TABLE IF NOT EXISTS variant_of(FROM Document TO Document, similarity_score DOUBLE)`);
    await conn.query(`CREATE REL TABLE IF NOT EXISTS depends_on(FROM Document TO Document)`);
    await conn.query(`CREATE REL TABLE IF NOT EXISTS generated_from(FROM Document TO Document)`);

    console.log('[Kuzu] Graph schema initialized — 8 typed edge tables confirmed present');
  } finally {
    conn.close();
  }
}

```

### Pattern 3: server.mjs Integration Point

**What:** Where and how to open `kuzu.Database` in the existing `server.mjs`.

**When to use:** The `kuzuDb` instance is created once after SQLite init and before Express starts. It is the single owner for the process lifetime.

```javascript

// daemon/server.mjs — additions (simplified)
// Source: ARCHITECTURE.md + direct codebase inspection of server.mjs

import kuzu from 'kuzu';                               // or createRequire fallback
import { KUZU_DIR } from '../config/env.mjs';
import { initKuzuSchema } from '../graph/kuzu-init.mjs';

// After: const db = new Database(DB_PATH); and before Express app setup
const kuzuDb = new kuzu.Database(KUZU_DIR);
await initKuzuSchema(kuzuDb);

// Pass kuzuDb to scheduler alongside db:
initScheduler(db, ROOT, ctx, kuzuDb);   // scheduler.mjs signature will expand in Phase 17

// In shutdown() function — close kuzu BEFORE db.close():
// kuzuDb.close();   (if close() method exists; verify in smoke test)
// db.pragma('wal_checkpoint(TRUNCATE)');
// db.close();

```

**Placement in server.mjs:** After line 53 (`const db = new Database(DB_PATH);`) and before line 58 (`const app = express();`).

### Pattern 4: env.mjs KUZU_DIR Export

**What:** New env export for the Kuzu database directory path, following the exact pattern of `DB_PATH`.

```javascript

// config/env.mjs addition
// Source: direct inspection of env.mjs existing DB_PATH pattern

/**

 * Absolute path to the Kuzu graph database directory.

 * Kuzu stores data as a directory (not a single file).

 * @constant {string}

 */
export const KUZU_DIR = path.resolve(ROOT, process.env.DOCUMIND_KUZU_DIR ?? 'data/documind.kuzu');

```

**Note on variable naming:** The REQUIREMENTS.md uses `DOCUMIND_KUZU_DIR` as the env var name. The config export should be named `KUZU_DIR` (following existing `DB_PATH`, `REPOS_DIR` pattern) mapping to `process.env.DOCUMIND_KUZU_DIR`.

### Anti-Patterns to Avoid

- **Multiple `new kuzu.Database()` calls:** Kuzu enforces single-writer ownership per path. Only `server.mjs` opens `kuzu.Database`. All other modules receive `kuzuDb` as a parameter and create `Connection` objects from it.

- **`IF NOT EXISTS` omitted from DDL:** Phase 17 sync will call the same schema init path. Without `IF NOT EXISTS`, startup fails on second run.

- **Using `kuzu@latest`:** The project is archived. Latest could resolve to a fork with unknown file format compatibility. Always use `kuzu@0.11.3`.

- **Opening Kuzu before ESM import is verified:** The smoke test must succeed before any app code imports kuzu.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --------- | ------------- | ------------- | ----- |
| Kuzu schema idempotency | Manual "if table exists" checks via query | `CREATE NODE TABLE IF NOT EXISTS` / `CREATE REL TABLE IF NOT EXISTS` | Kuzu supports these DDL guards natively in 0.11.3 |
| Kuzu database directory creation | `fs.mkdirSync(KUZU_DIR)` before open | Pass the path to `new kuzu.Database(path)` — Kuzu creates the directory | Kuzu creates its own directory structure on first open |

**Key insight:** Kuzu's setup surface is deliberately minimal. The `Database` constructor + `IF NOT EXISTS` DDL handles all initialization concerns.

---

## Common Pitfalls

### Pitfall 1: ESM Import May Require `createRequire` Fallback

**What goes wrong:** `import kuzu from 'kuzu'` in a `.mjs` file throws "package subpath not exported" or "ERR_PACKAGE_PATH_NOT_EXPORTED" depending on how Kuzu's `package.json` `exports` field is configured.

**Why it happens:** The Kuzu npm package (`0.11.3`) may expose only a CJS entry point in its `exports` map. GitHub Issue #5517 on the kuzu repo confirms an ESM-related issue (filed against kuzu-wasm but the exports behavior may affect the native package too). This is the highest-uncertainty item in Phase 16.

**How to avoid:** Run the smoke test script as the FIRST action. If default import works, use it throughout. If it fails, use `createRequire`:

```javascript

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const kuzu = require('kuzu');

```

**Warning signs:** Smoke test exits with non-zero code; error mentions `ERR_PACKAGE_PATH_NOT_EXPORTED` or `SyntaxError: The requested module 'kuzu' does not provide an export named 'default'`.

### Pitfall 2: Kuzu Single-Writer Constraint Violated by CLI Scripts

**What goes wrong:** A developer runs `node scripts/db/init-database.mjs` or any scan CLI while the PM2 daemon is running. If that script tries to open Kuzu, it will fail with "Failed to open the database file" — the daemon already holds an exclusive READ_WRITE lock.

**How to avoid:** `graph/kuzu-init.mjs` is only called from `server.mjs`. No CLI script opens Kuzu. Document in `CLAUDE.md`: "Stop the daemon before running any Kuzu maintenance commands."

**Warning signs:** `.lock` file present in `data/documind.kuzu/` that does not clear after daemon restart.

### Pitfall 3: Dockerfile Cleanup Line May Delete Kuzu Data Directory

**What goes wrong:** `server.mjs` line 47 in the Dockerfile runs: `RUN rm -f data/documind.db data/*.db-wal data/*.db-shm .env`. If `data/documind.kuzu/` is pre-created during build (it should NOT be), it would be ignored by `-f` (which only removes files, not directories). But if a future Dockerfile step adds `rm -rf data/`, the Kuzu directory disappears.

**How to avoid:** The `data/documind.kuzu/` directory is created at runtime by Kuzu when the daemon first starts. It is not pre-created in the Docker build. Verify after the Docker build that `data/` in the image is empty (only the `mkdir /app/data` step runs at build time).

### Pitfall 4: Daemon Startup Log "Kuzu graph initialized" Requires Correct Placement

**What goes wrong:** Success criterion 4 requires the log line "Kuzu graph initialized" with 8 tables confirmed. If `initKuzuSchema` is called before the process is verified to have exited 0 on the schema queries, the log prints prematurely.

**How to avoid:** The log line in `initKuzuSchema` must only print AFTER all 8 `CREATE REL TABLE IF NOT EXISTS` queries have awaited successfully. The example in Pattern 2 above places it after all queries.

---

## Code Examples

### The 8 Relationship Types — SQLite to Kuzu Mapping

From direct inspection of `graph/relations.mjs` and `scripts/db/schema.sql`:

| SQLite `relationship_type` value | Kuzu Edge Table Name | Properties |
| ---------------------------------- | ---------------------- | ----------- |
| `imports` | `imports` | `weight DOUBLE, link_text STRING` |
| `dispatched_to` | `dispatched_to` | `target_repo STRING` |
| `supersedes` | `supersedes` | `confidence DOUBLE` |
| `related_to` | `related_to` | `weight DOUBLE, reason STRING` |
| `parent_of` | `parent_of` | (none beyond FROM/TO) |
| `variant_of` | `variant_of` | `similarity_score DOUBLE` |
| `depends_on` | `depends_on` | (none beyond FROM/TO) |
| `generated_from` | `generated_from` | (none beyond FROM/TO) |

**Important:** `relations.mjs` currently generates only `imports`, `dispatched_to`, `supersedes`, and `related_to` in its auto-detection logic. The other 4 types (`parent_of`, `variant_of`, `depends_on`, `generated_from`) exist in the schema but are not yet auto-generated. All 8 tables must be created in Phase 16 regardless — the schema is frozen now so Phase 17 sync does not need a schema migration.

### Kuzu Connection Lifecycle

```javascript

// Source: Kuzu Node.js API docs via ARCHITECTURE.md
// Connections are lightweight — create per-operation, close when done
// Except: algorithm queries need a DEDICATED connection (see ARCHITECTURE.md Phase 19 concern)

const conn = new kuzu.Connection(kuzuDb);
try {
  const result = await conn.query('MATCH (n:Document) RETURN count(n)');
  const rows = await result.getAll();    // returns Array<plain object>
  return rows;
} finally {
  conn.close();   // always close; verify close() method exists in smoke test
}

```

### Health Check Extension (GRAPH-01 Verification)

```javascript

// daemon/server.mjs /health endpoint — add kuzuDb liveness check
// Source: existing /health pattern in server.mjs lines 65-72
app.get('/health', async (_req, res) => {
  try {
    db.prepare('SELECT 1').get();                     // SQLite probe (existing)
    const conn = new kuzu.Connection(kuzuDb);
    const result = await conn.query('RETURN 1');      // Kuzu probe
    await result.getAll();
    conn.close();
    res.json({ status: 'ok', version: '2.0.0', uptime: process.uptime(), mcp_mode: MCP_MODE });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| -------------- | ------------------ | -------------- | -------- |
| All graph queries via SQLite recursive CTEs | Kuzu typed edge tables + Cypher (Phase 17+) | v3.3 | Phase 16 only initializes; CTE queries remain active until Phase 17 sync |
| Single database (`documind.db`) | Dual-DB: SQLite (FTS5 + metadata) + Kuzu (graph) | v3.3 | Two `data/` subdirectories; named Docker volume already covers both |

### Deprecated/outdated

- Flat `doc_relationship` node model (single edge table with `type` property): Never use. Design typed edge tables from day one. See Pitfall 4 in PITFALLS.md.

---

## Open Questions

1. **Does `import kuzu from 'kuzu'` work in Node.js 22 `.mjs` without a workaround?**

   - What we know: STACK.md states "Both `import` (ESM) and `require` (CJS) are fully supported per Kuzu Node.js docs." PITFALLS.md flags GitHub Issue #5517 (ESM issue on kuzu-wasm) as potentially relevant but not confirmed for the native package.

   - What's unclear: The exact `exports` field in `kuzu@0.11.3/package.json` is unverified. The smoke test resolves this empirically.

   - Recommendation: Smoke test is task 1. If default import fails, use `createRequire`. Document which form works in a code comment in `server.mjs`.

2. **Does `kuzu.Connection` have a `.close()` method?**

   - What we know: ARCHITECTURE.md references `conn.close()` but this is inferred from pattern, not confirmed from official docs directly.

   - What's unclear: If `.close()` does not exist, connection cleanup is a no-op (Kuzu GC handles it) or uses a different method.

   - Recommendation: Verify in smoke test. If absent, use `delete conn` or let GC handle it.

3. **Does `kuzu.Database` have a `.close()` method for graceful shutdown?**

   - What we know: Kuzu flushes WAL on close per ARCHITECTURE.md. The method name is assumed to be `db.close()`.

   - What's unclear: The actual method name in Node.js API. Could be `db.close()`, `db.shutdown()`, or automatic on GC.

   - Recommendation: Verify in smoke test. Add to `shutdown()` function in `server.mjs` before `db.pragma('wal_checkpoint(TRUNCATE)')`.

---

## Validation Architecture

> (workflow.nyquist_validation not configured — skip formal test framework section)

### Manual verification gates for Phase 16

| Requirement | Verification Command | Expected Result |
| ------------- | --------------------- | ----------------- |
| ESM import works (GRAPH-03 precursor) | `node scripts/kuzu-smoke-test.mjs` | Exits 0, prints "Kuzu smoke test PASSED" |
| Docker build with Kuzu (GRAPH-03) | `docker build -t documind-test .` | Exits 0, no "building from source" messages for kuzu |
| Docker Kuzu open/close (GRAPH-03) | `docker run --rm documind-test node scripts/kuzu-smoke-test.mjs` | Exits 0 |
| Daemon starts with Kuzu init (GRAPH-01) | `npm run daemon:dev` | Log shows "Kuzu graph initialized — 8 typed edge tables confirmed present" |
| KUZU_DIR env var works (GRAPH-02) | `DOCUMIND_KUZU_DIR=/tmp/test-kuzu npm run daemon:dev` | Startup log confirms `/tmp/test-kuzu` as active path |

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection: `daemon/server.mjs` (startup sequence, shutdown handler, /health endpoint), `config/env.mjs` (DB_PATH pattern), `graph/relations.mjs` (4 active relationship types: imports, dispatched_to, supersedes, related_to), `scripts/db/schema.sql` (doc_relationships table, relationship_type column), `Dockerfile` (bookworm-slim base, builder apt-get install python3/make/g++)

- `.planning/research/ARCHITECTURE.md` — Kuzu Node.js API patterns, schema DDL, server.mjs integration point, single-writer constraint

- `.planning/research/STACK.md` — kuzu@0.11.3 pinned version, ESM/CJS support claim, pre-built binary behavior

- `.planning/research/PITFALLS.md` — ESM integration gotcha (createRequire fallback), single-writer pitfall, Alpine glibc pitfall, schema-freeze requirement

### Secondary (MEDIUM confidence)

- Kuzu Node.js API docs (via ARCHITECTURE.md research): `new Database(path)`, `new Connection(db)`, `conn.query()`, `result.getAll()` — async API confirmed

- kuzu@0.11.3 npm: pre-built binaries ship inside the package (no node-gyp/download step); Node 20/22 glibc confirmed

### Tertiary (LOW confidence)

- ESM `import kuzu from 'kuzu'` default import behavior in Node.js 22 — LOW confidence; unverified empirically; smoke test resolves this

- `Connection.close()` and `Database.close()` method names — LOW confidence; inferred from architecture research; verify in smoke test

---

## Metadata

### Confidence breakdown

- Standard stack: HIGH — kuzu@0.11.3 pinned version confirmed; pre-built binary behavior confirmed; no alternatives exist

- Architecture: HIGH — codebase directly inspected; server.mjs startup sequence, env.mjs pattern, and schema DDL all based on real code

- Pitfalls: HIGH — ESM risk, single-writer constraint, Docker glibc all confirmed from prior milestone research

- ESM import behavior: LOW — empirical verification required; smoke test is the gate

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable — Kuzu is archived, no upstream changes possible)
