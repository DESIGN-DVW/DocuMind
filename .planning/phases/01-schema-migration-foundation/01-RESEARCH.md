# Phase 1: Schema Migration Foundation - Research

**Researched:** 2026-03-15
**Domain:** SQLite schema migration, better-sqlite3, FTS5 backfill
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Migration safety:**

- Auto-backup the .db file before every migration run (copy to `documind.db.bak-{timestamp}`)
- Each migration wrapped in a transaction — all-or-nothing, rollback on failure
- Migration files named sequentially: `001-add-summary.sql`, `002-add-classifications.sql`, etc.
- `schema_migrations` table tracks applied migrations with version and timestamp
- `npm run db:reset` requires `--force` flag and prints a loud warning — no silent corpus destruction

**Summary generation:**

- Extractive hierarchy for summary content: 1st frontmatter `description:` field, 2nd first non-heading paragraph, 3rd title + keywords fallback
- Target length: 1-2 sentences (~100-200 characters)
- Backfill all 8K existing documents during migration (not deferred to scheduler)

**Classification paths:**

- Classification tree organized by function: `engineering/`, `operations/`, `guides/`, `references/`
- Materialized path format stored as TEXT: `engineering/architecture/adrs`
- Path-based classification rules: `docs/api/**` maps to `engineering/api-docs`, `**/CLAUDE.md` maps to `engineering/architecture`
- Docs that don't match any rule assigned `uncategorized` (visible bucket showing where rules need to be added)
- Classification tree shape lives in the context profile, not hardcoded in schema

### Claude's Discretion

- Tag extraction behavior (threshold, max per doc) — not discussed, Claude decides
- Exact classification tree depth and naming below top level
- FTS5 rebuild strategy during migration
- How to handle documents that already have a `category` value (migration from old field)

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
| ---- | ------------- | ----------------- |
| SCHM-01 | Schema migration system with versioned SQL files and a `schema_migrations` table (protects 8K live docs from destructive db:reset) | See Architecture Patterns: Migration Runner pattern; `schema_migrations` DDL; `db:migrate` wiring |
| SCHM-02 | Add `summary TEXT` column to documents table with FTS5 rebuild | See Code Examples: ALTER TABLE + FTS5 rebuild; Pitfall 2 on FTS5 sync |
| SCHM-03 | Add `classification TEXT` column to documents table (materialized path format) | See Code Examples: ALTER TABLE; backfill pattern using path-based rules; `category` migration note |
| SCHM-04 | Create `document_tags` table (document_id, tag, source, confidence) with FTS5 | See Code Examples: new table + FTS5 virtual table + triggers; tag extraction discretion guidance |
| SCHM-05 | Remove hardcoded CHECK constraints from schema that enumerate DVWDesign-specific values | See Architecture Patterns: CHECK constraint removal approach; live DB impact analysis |

</phase_requirements>

---

## Summary

The live DocuMind database contains 8,172 indexed documents in a 125 MB SQLite file. The `documents` table has a `category TEXT` column with DVWDesign-specific values (`readme`, `other`, `documentation`, `claude-instructions`, `architecture`, etc.) but no `summary`, `classification`, or tags structure. The v2.0 tables (`doc_relationships`, `keywords`, `folder_nodes`, `diagrams`) already exist in the schema but are empty. There is no `schema_migrations` table, and the existing `db:reset` npm script runs `rm -f data/documind.db` — destroying all 8K documents without any guard.

Phase 1 must lay the migration infrastructure before touching any columns, then apply three column additions and one new table in sequence, and close with an FTS5 rebuild and summary/classification backfill for all existing documents. The backfill is mandated by the user to happen during migration (not deferred), which means the migration runner must call JavaScript processors, not just execute SQL. This is the key architectural decision: the migration runner is a Node.js script (not a raw SQLite client) so it can call gray-matter parsing and keyword logic inline.

The `db:reset` guard and the `schema_migrations` table are the two deliverables that protect the live corpus. Everything else in this phase (column adds, backfill, FTS5 rebuild) depends on those two existing first.

**Primary recommendation:** Build `scripts/db/migrate.mjs` as the migration runner before writing any migration SQL files. The runner applies the `schema_migrations` table itself on first run (bootstrapping), then applies numbered SQL files in order, each in a transaction. Backfill logic for summary and classification is called from JavaScript after the SQL migrations complete, using gray-matter + existing processors.

---

## Live Database State (Verified)

Confirmed by direct inspection of `/Users/Shared/htdocs/github/DVWDesign/DocuMind/data/documind.db`:

| Fact | Value |
| ------ | ------- |
| Document count | 8,172 rows |
| DB file size | 125 MB |
| `summary` column on `documents` | Does not exist |
| `classification` column on `documents` | Does not exist |
| `document_tags` table | Does not exist |
| `schema_migrations` table | Does not exist |
| `category` column populated | Yes — 5,021 `readme`, 1,926 `other`, 1,203 `documentation`, 7 `claude-instructions`, etc. |
| v2.0 tables (doc_relationships, keywords, folder_nodes, diagrams) | Tables exist, all 0 rows |

The `category` values are DVWDesign-specific string labels, not materialized path format. They come from the markdown-processor's path-detection heuristic (line pattern matching). The new `classification` column is a separate addition — `category` is NOT being renamed; both fields coexist, with `classification` being the canonical new field from Phase 2+ profile rules.

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Notes |
| --------- | --------- | --------- | ------- |
| `better-sqlite3` | 12.6.2 | Synchronous SQLite access — ALTER TABLE, transactions, FTS5 rebuild | Already in dependencies |
| Node.js `fs` | built-in | File backup (`fs.copyFileSync`), migration file reading | No new dependency |
| `gray-matter` | 4.0.3 | Parse frontmatter `description:` field for summary extraction | Already in dependencies |
| `chalk` | 5.3.0 | CLI output in migration runner | Already in dependencies |

**No new dependencies required for Phase 1.** All needed libraries are already installed.

### Alternatives Considered

| Instead of | Could Use | Why Rejected |
| ------------ | ----------- | -------------- |
| Hand-written migration runner | `db-migrate`, `knex migrations`, `typeorm migrations` | Project is ESM + better-sqlite3 + no ORM; adding a migration framework adds abstraction with no benefit for a single-DB project |
| SQL-only migration files | Node.js migration scripts (`.mjs`) | Backfill requires gray-matter parsing and path logic — pure SQL cannot extract frontmatter `description:` fields |
| `VACUUM INTO 'backup.db'` for backup | `fs.copyFileSync` | VACUUM INTO creates a clean compacted copy but requires opening the DB; pre-migration backup should be file-level copy BEFORE the DB is opened (simpler, faster, no risk of partial write) |

---

## Architecture Patterns

### Migration Runner Structure

```text
scripts/db/
├── migrate.mjs           # Migration runner (new — Phase 1 deliverable)
├── migrations/           # Numbered SQL + JS migration files (new)
│   ├── 001-schema-migrations-table.sql   # Bootstraps the migrations system
│   ├── 002-add-summary.sql               # SCHM-02
│   ├── 003-add-classification.sql        # SCHM-03
│   ├── 004-add-document-tags.sql         # SCHM-04
│   └── 005-remove-check-constraints.sql  # SCHM-05
├── backfill/             # JavaScript backfill scripts (new)
│   ├── backfill-summaries.mjs
│   └── backfill-classifications.mjs
├── init-database.mjs     # Existing — update to delegate to migrate.mjs
├── schema.sql            # Existing — update to remove DVW CHECK constraints
└── ...
```

### Pattern 1: Migration Runner (Bootstrap + Apply)

**What:** A Node.js script that (1) backs up the DB file, (2) bootstraps the `schema_migrations` table if absent, (3) reads migration files in numeric order, (4) skips already-applied ones, (5) applies each in a transaction with rollback on failure.

**When to use:** Every `npm run db:migrate` invocation — idempotent by design.

```javascript
// scripts/db/migrate.mjs — core pattern
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = 'data/documind.db';
const MIGRATIONS_DIR = 'scripts/db/migrations';

// Step 1: Backup before opening
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.copyFileSync(DB_PATH, `${DB_PATH}.bak-${timestamp}`);

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Step 2: Bootstrap schema_migrations
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL,
    description TEXT
  )
`);

// Step 3: Read + apply pending migrations
const applied = new Set(
  db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
);

const files = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort(); // lexicographic order preserves numeric prefix ordering

for (const file of files) {
  const version = file.replace('.sql', '');
  if (applied.has(version)) continue;

  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');

  // Each migration is atomic
  const runMigration = db.transaction(() => {
    db.exec(sql);
    db.prepare(
      'INSERT INTO schema_migrations (version, applied_at, description) VALUES (?, ?, ?)'
    ).run(version, new Date().toISOString(), file);
  });

  runMigration(); // throws on failure → transaction auto-rolls back
}

db.close();
```

### Pattern 2: SQLite ALTER TABLE for New Nullable Columns

**What:** `ALTER TABLE documents ADD COLUMN summary TEXT` is safe in SQLite — adds the column as NULL for all existing rows. No table rebuild needed because the column is nullable with no default constraint.

**When to use:** SCHM-02 (summary), SCHM-03 (classification). Both columns are TEXT nullable — straight ALTER TABLE.

```sql
-- 002-add-summary.sql
ALTER TABLE documents ADD COLUMN summary TEXT;

-- 003-add-classification.sql
ALTER TABLE documents ADD COLUMN classification TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_classification ON documents(classification);
```

**Critical:** SQLite's `ALTER TABLE ADD COLUMN` is limited. You cannot:

- Add a column with a non-constant DEFAULT (e.g., `DEFAULT (datetime('now'))`)
- Add a NOT NULL column without a default value
- Add a column that is part of a UNIQUE or PRIMARY KEY constraint

`summary TEXT` and `classification TEXT` are both nullable with no constraint — completely safe.

### Pattern 3: New Table + FTS5 Virtual Table (SCHM-04)

```sql
-- 004-add-document-tags.sql
CREATE TABLE IF NOT EXISTS document_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('extracted', 'manual', 'inferred')),
  confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0.0 AND 1.0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT unique_doc_tag UNIQUE (document_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_doc_tags_document ON document_tags(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_tags_tag ON document_tags(tag);
CREATE INDEX IF NOT EXISTS idx_doc_tags_confidence ON document_tags(confidence DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS document_tags_fts USING fts5(
  tag,
  content='document_tags',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS doc_tags_ai AFTER INSERT ON document_tags BEGIN
  INSERT INTO document_tags_fts(rowid, tag) VALUES (new.id, new.tag);
END;

CREATE TRIGGER IF NOT EXISTS doc_tags_ad AFTER DELETE ON document_tags BEGIN
  INSERT INTO document_tags_fts(document_tags_fts, rowid, tag)
  VALUES('delete', old.id, old.tag);
END;
```

**Discretion choices made (Claude's Discretion from CONTEXT.md):**

- `source CHECK IN ('extracted', 'manual', 'inferred')` — three-value enum matching keywords table pattern
- `confidence REAL 0.0–1.0` — matching existing schema pattern
- `UNIQUE (document_id, tag)` — prevents duplicate tags per document; use `INSERT OR REPLACE` for upsert
- Tag threshold for extraction: minimum TF-IDF score of 0.1; maximum 15 tags per document — balances signal vs. noise for 8K-doc corpus

### Pattern 4: CHECK Constraint Removal (SCHM-05)

SQLite does NOT support `ALTER TABLE DROP CONSTRAINT` or `ALTER TABLE MODIFY COLUMN`. Removing a CHECK constraint requires the full 12-step table rebuild procedure.

**However:** A simpler approach is available. The offending constraint is in `doc_relationships.relationship_type CHECK (... IN ('imports', 'parent_of', ..., 'dispatched_to'))`. Rather than removing the enum, the strategy is:

1. Remove `dispatched_to` from the CHECK (it is DVWDesign-specific) — but this requires a full table rebuild
2. OR: Keep the existing relationship types as a starter set (they are reasonably generic: `imports`, `parent_of`, `variant_of`, `supersedes`, `depends_on`, `related_to`, `generated_from`) and only remove `dispatched_to`

**Confirmed DVWDesign-specific CHECK values to remove:**

- `doc_relationships.relationship_type`: `'dispatched_to'` is DVWDesign-specific; the other 7 types are generic
- `diagrams.diagram_type`: the enum is generic (folder_tree, relationship_graph, etc.) — no removal needed
- `deviations.deviation_type`: values are generic content classification terms — no removal needed
- `linting_issues.severity`: `error`, `warning`, `info` — generic; no removal needed
- `scan_history.status`: `running`, `completed`, `failed`, `cancelled` — generic; no removal needed
- `keywords.source`: `extracted`, `manual`, `inferred` — generic; no removal needed

**The only table requiring a rebuild is `doc_relationships`** — removing `'dispatched_to'` from its CHECK constraint.

Since `doc_relationships` currently has 0 rows, the 12-step rebuild is zero-risk.

**12-Step Rebuild for doc_relationships (in migration 005):**

```sql
-- 005-remove-check-constraints.sql
PRAGMA foreign_keys = OFF;

CREATE TABLE doc_relationships_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_doc_id INTEGER NOT NULL,
  target_doc_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_doc_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (target_doc_id) REFERENCES documents(id) ON DELETE CASCADE
);

INSERT INTO doc_relationships_new SELECT * FROM doc_relationships;

DROP TABLE doc_relationships;

ALTER TABLE doc_relationships_new RENAME TO doc_relationships;

CREATE INDEX IF NOT EXISTS idx_rel_source ON doc_relationships(source_doc_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON doc_relationships(target_doc_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON doc_relationships(relationship_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_unique
  ON doc_relationships(source_doc_id, target_doc_id, relationship_type);

PRAGMA foreign_keys = ON;
```

**Note:** Running `PRAGMA foreign_keys = OFF` inside a migration SQL file works when the runner uses `db.exec()`. The better-sqlite3 `pragma()` call sets it at connection level, but in-SQL PRAGMA inside a transaction also works in SQLite.

**Also:** Update `schema.sql` to reflect the removed constraint so future `db:reset --force` creates the generic version.

### Pattern 5: FTS5 Rebuild After Bulk Writes

After the backfill of 8K documents with summary/classification values:

```javascript
// After all UPDATE documents SET summary = ... backfill completes:
db.exec("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')");
```

This is safe, idempotent, and completes in seconds on 8K rows. It is the mandated approach from prior research (CONTEXT.md notes this explicitly). Do NOT rely on triggers for bulk updates — triggers fire per-row for INSERT, but the backfill will use batch UPDATE statements.

**FTS5 columns indexed:** `path`, `filename`, `category`, `content` — these are the columns configured in the existing `documents_fts` virtual table. `summary` and `classification` are NOT in the FTS5 index by default. Adding them to FTS5 would require a full FTS5 rebuild with a new column list — which is a more complex operation (DROP + CREATE virtual table). **Recommendation:** Keep FTS5 indexed columns as-is for Phase 1. The planner can decide in the task whether to add summary/classification to FTS5.

### Pattern 6: Summary Backfill Logic

```javascript
// backfill/backfill-summaries.mjs
import matter from 'gray-matter';
import Database from 'better-sqlite3';

// Extractive hierarchy:
// 1. frontmatter.description
// 2. First non-heading paragraph (first <p> text block)
// 3. filename + top keywords fallback

function extractSummary(content, frontmatter) {
  // Priority 1: frontmatter description
  if (frontmatter?.description) {
    const desc = String(frontmatter.description).trim();
    if (desc.length > 20) return desc.slice(0, 200);
  }

  // Priority 2: first non-heading paragraph
  const lines = content.split('\n');
  let para = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('|') || trimmed.startsWith('```')) continue;
    if (trimmed.length > 30) { para = trimmed; break; }
  }
  if (para) return para.slice(0, 200);

  // Priority 3: fallback (handled by caller using filename + keywords)
  return null;
}

// Batch update in chunks of 500 to avoid holding write lock too long
const docs = db.prepare('SELECT id, path, frontmatter, content FROM documents WHERE summary IS NULL').all();
const update = db.prepare('UPDATE documents SET summary = ? WHERE id = ?');

const batchUpdate = db.transaction((batch) => {
  for (const doc of batch) {
    const fm = doc.frontmatter ? JSON.parse(doc.frontmatter) : {};
    const summary = extractSummary(doc.content || '', fm) || doc.path.split('/').pop();
    update.run(summary, doc.id);
  }
});

for (let i = 0; i < docs.length; i += 500) {
  batchUpdate(docs.slice(i, i + 500));
}
```

### Pattern 7: Classification Backfill Logic

```javascript
// backfill/backfill-classifications.mjs
// Path-based rules (starter set — full set defined in context profile Phase 2)
const CLASSIFICATION_RULES = [
  { pattern: /\/docs\/api\//,        classification: 'engineering/api-docs' },
  { pattern: /CLAUDE\.md$/,          classification: 'engineering/architecture' },
  { pattern: /\/\.planning\//,       classification: 'engineering/architecture' },
  { pattern: /ADR[-_]/i,             classification: 'engineering/architecture/adrs' },
  { pattern: /README\.md$/i,         classification: 'references/readme' },
  { pattern: /CHANGELOG/i,           classification: 'operations/changelog' },
  { pattern: /\/scripts\//,          classification: 'engineering/scripts' },
  { pattern: /\/config\//,           classification: 'engineering/config' },
];

function classifyPath(filePath) {
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.pattern.test(filePath)) return rule.classification;
  }
  return 'uncategorized';
}
```

**Handling existing `category` values (Claude's Discretion from CONTEXT.md):** Leave `category` in place — do not remove or migrate it. The new `classification` column is populated independently. Downstream phases (Context Profiles, Phase 2) will define the definitive classification rules. The `uncategorized` bucket makes visible which documents lack a rule match.

### Pattern 8: db:reset Guard

Current `package.json`:

```json
"db:reset": "rm -f data/documind.db && npm run db:init"
```

Must become:

```json
"db:reset": "node scripts/db/reset-database.mjs"
```

Where `reset-database.mjs` checks for `--force` argument and prints a loud warning if absent:

```javascript
// scripts/db/reset-database.mjs
if (!process.argv.includes('--force')) {
  console.error('ERROR: db:reset requires --force flag.');
  console.error('This will DESTROY all indexed documents in data/documind.db.');
  console.error('Run: npm run db:reset -- --force');
  process.exit(1);
}
// Proceed with reset only if --force
```

### Anti-Patterns to Avoid

- **Running bare `db.exec(schema)` against existing DB:** This re-runs `CREATE TABLE IF NOT EXISTS` silently on all tables, doing nothing for schema evolution. The existing `init-database.mjs` does this — do not call it for migrations.
- **Using `better-sqlite3` `.backup()` instead of `fs.copyFileSync` for pre-migration backup:** `.backup()` is async and more complex; a pre-migration backup only needs to be a fast file copy before the DB is opened.
- **Committing to FTS5 column list changes in this phase:** Adding `summary` or `classification` to `documents_fts` requires dropping and recreating the virtual table + all triggers. Keep it deferred unless the planner decides the benefit justifies the rebuild complexity.
- **Running `PRAGMA foreign_keys = OFF` at connection level during table rebuild:** better-sqlite3 pragma applies at connection level. In `migrate.mjs`, set `db.pragma('foreign_keys = OFF')` before the rebuild migration, then `db.pragma('foreign_keys = ON')` after.
- **Applying migrations in parallel:** Migrations must run sequentially in version order. No concurrency.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --------- | ------------- | ------------- | ----- |
| Gray-matter frontmatter parsing in backfill | Custom YAML parser | `gray-matter` (already installed) | Handles edge cases: multi-line values, colons in strings, nested objects |
| Batch transaction pattern | Ad-hoc loop with individual commits | `db.transaction(fn)` from better-sqlite3 | Atomic, auto-rollback, dramatically faster than per-row commits (100x+ on 8K rows) |
| File-level backup | Custom copy logic | `fs.copyFileSync()` | WAL mode files need all three files copied (.db, .db-shm, .db-wal) if WAL is active; but for a pre-migration backup, opening the DB first (which checkpoints WAL) then copying is also valid |

---

## Common Pitfalls

### Pitfall 1: FTS5 Out of Sync After Bulk UPDATE

**What goes wrong:** The `documents_fts` FTS5 virtual table uses `content='documents'` (external content table). Its INSERT/UPDATE/DELETE triggers only fire on row-level DML. A batch `UPDATE documents SET summary = ?` does fire the `documents_au` trigger per row, which DOES keep FTS5 in sync for per-row updates. **However**, if the backfill runs direct `db.exec('UPDATE ...')` statements outside the trigger path (bypassing the ORM layer), triggers still fire in SQLite — they're table-level, not application-level.

**Real risk:** The `documents_au` trigger updates FTS5 when `summary` changes, but `summary` is NOT currently in the FTS5 column list (`path`, `filename`, `category`, `content`). So no data issue arises from the trigger — it updates the existing FTS5 columns only. **But** if the backfill also changes `content` or `category` (it shouldn't in this phase), the trigger handles it.

**Mandatory step:** After all backfill UPDATE operations complete, run `INSERT INTO documents_fts(documents_fts) VALUES('rebuild')` as a final safety step. This is cheap (seconds on 8K docs) and catches any edge case.

### Pitfall 2: WAL Files Must Be Included in Backup

**What goes wrong:** If the DB is already open (daemon running), copying `documind.db` without the `.db-shm` and `.db-wal` files produces a corrupt backup.

**How to avoid:** The migration runner should check if the WAL file exists alongside the main DB file and copy all three. OR: require the daemon to be stopped before running migrations, and document this requirement in the runner's output.

```javascript
// In migrate.mjs backup step
const walPath = `${DB_PATH}-wal`;
const shmPath = `${DB_PATH}-shm`;
fs.copyFileSync(DB_PATH, `${DB_PATH}.bak-${timestamp}`);
if (fs.existsSync(walPath)) fs.copyFileSync(walPath, `${walPath}.bak-${timestamp}`);
if (fs.existsSync(shmPath)) fs.copyFileSync(shmPath, `${shmPath}.bak-${timestamp}`);
```

**Warning sign:** Migration completes but some documents are missing from `/stats` response.

### Pitfall 3: Transaction Wrapping Doc Rebuilds Holds Write Lock

**What goes wrong:** Wrapping the entire 8K document backfill in a single transaction holds the SQLite write lock for the entire duration. On a 125 MB database, this could take 30-60 seconds, blocking the daemon entirely.

**How to avoid:** Use batch transactions of 500 rows:

```javascript
const batchUpdate = db.transaction((batch) => {
  for (const doc of batch) { update.run(...); }
});
for (let i = 0; i < docs.length; i += 500) {
  batchUpdate(docs.slice(i, i + 500));
}
```

**Warning sign:** Daemon API requests return 500 or timeout during backfill.

### Pitfall 4: doc_relationships Rebuild Drops Existing Data

**What goes wrong:** Migration 005 drops `doc_relationships` and recreates it. The current DB has 0 rows there — this is safe. But the migration must verify this before executing:

```sql
-- Safety check comment in 005 migration file:
-- doc_relationships must be empty before this rebuild.
-- Verified: 0 rows at time of migration authoring (2026-03-15).
-- If rows exist when this runs, they will be preserved via INSERT INTO ... SELECT *.
```

The INSERT INTO new_table SELECT * from old preserves any existing data.

### Pitfall 5: npm db:migrate Currently Points to init-database.mjs

**What goes wrong:** `package.json` has `"db:migrate": "node scripts/db/init-database.mjs"` — this is the same as `db:init`. After Phase 1, `db:migrate` must point to the new `migrate.mjs` runner. The existing mapping is incorrect and must be updated.

---

## Code Examples

Verified patterns from codebase + better-sqlite3 synchronous API:

### Migration Bootstrapping (schema_migrations table)

```javascript
// Source: better-sqlite3 synchronous API + SQLite CREATE TABLE IF NOT EXISTS
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL,
    description TEXT
  )
`);
```

### Idempotent Migration Check

```javascript
// Source: pattern from migrate-relink.sql + better-sqlite3
const applied = new Set(
  db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
);
if (applied.has('002-add-summary')) {
  console.log('  Skipping 002-add-summary — already applied');
  continue;
}
```

### Batch Transaction (500-row chunks)

```javascript
// Source: better-sqlite3 transaction API
const runBatch = db.transaction((rows) => {
  for (const row of rows) {
    stmt.run(row.value, row.id);
  }
});
for (let i = 0; i < allRows.length; i += 500) {
  runBatch(allRows.slice(i, i + 500));
}
```

### FTS5 Rebuild

```javascript
// Source: SQLite FTS5 documentation + confirmed in CONTEXT.md
db.exec("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')");
```

### ALTER TABLE (safe for nullable columns)

```sql
-- Source: SQLite ALTER TABLE documentation — safe for nullable TEXT columns
ALTER TABLE documents ADD COLUMN summary TEXT;
ALTER TABLE documents ADD COLUMN classification TEXT;
```

---

## State of the Art

| Old Approach | Current Approach | Impact for Phase 1 |
| -------------- | ------------------ | ------------------- |
| `db.exec(schema)` on every init | Numbered migration files + `schema_migrations` | Phase 1 builds the new approach |
| `rm -f data/documind.db` for reset | `--force` flag guard + loud warning | Phase 1 adds the guard |
| Single `schema.sql` with all DDL | `schema.sql` + `migrations/` directory | Both maintained: schema.sql reflects target state; migrations are the diffs |
| `init-database.mjs` handles both init and migrate | `init-database.mjs` (fresh DB) + `migrate.mjs` (evolve existing DB) | Phase 1 separates these concerns |

---

## Open Questions

1. **Should `summary` and `classification` be added to the FTS5 index?**
   - What we know: Currently `documents_fts` indexes `path`, `filename`, `category`, `content`. Adding `summary` would improve search relevance (summaries are concise and high signal).
   - What's unclear: Adding columns to an FTS5 external content table requires dropping and recreating the virtual table + triggers — a significant operation on a 125 MB DB.
   - Recommendation: Defer to planner. If planner wants it, add it as migration step 006 (separate, clearly scoped). Default recommendation is to leave FTS5 columns unchanged in Phase 1.

2. **Should the daemon be stopped before running migrations?**
   - What we know: better-sqlite3 is synchronous; the daemon holds an open connection in WAL mode. A second writer (migrate.mjs) will contend for the write lock.
   - What's unclear: WAL mode supports concurrent readers and one writer — migrations can run while the daemon is active, but they'll block until the daemon's current write completes.
   - Recommendation: Add a note to `migrate.mjs` output recommending daemon stop before migration, but do not enforce it. WAL mode makes this safe; it's advisory, not required.

3. **Tag extraction threshold and max count**
   - Claude's Discretion from CONTEXT.md — decided in this research: minimum TF-IDF score 0.1, maximum 15 tags per document. However, tag backfill is NOT required in Phase 1 (only the `document_tags` table must be created — SCHM-04 says "create table", not "backfill"). Tag population is a processor-level concern wired in Phase 3 (INTL-03).

---

## Sources

### Primary (HIGH confidence)

- Live database inspection: `sqlite3 /Users/Shared/htdocs/github/DVWDesign/DocuMind/data/documind.db` — 8,172 rows confirmed, no schema_migrations, no summary/classification columns
- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/scripts/db/schema.sql` — full schema read; CHECK constraints identified
- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/scripts/db/init-database.mjs` — current migration behavior confirmed (hardcoded version '1.0.0', no migration table)
- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/package.json` — confirmed `db:reset` runs `rm -f` without guard; `db:migrate` incorrectly aliases `init-database.mjs`
- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/.planning/codebase/CONCERNS.md` — confirmed "No database backup mechanism" and "Non-idempotent migration" bugs
- SQLite ALTER TABLE docs: <https://www.sqlite.org/lang_altertable.html> — nullable column ADD COLUMN is safe

### Secondary (MEDIUM confidence)

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/.planning/research/PITFALLS.md` — FTS5 sync pitfall verified against live schema; 12-step rebuild procedure documented
- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/scripts/db/migrate-relink.sql` — existing migration pattern (ALTER TABLE columns, DROP/CREATE VIEW) — confirms project already has migration SQL precedent

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all dependencies already installed; no new libraries needed
- Architecture: HIGH — patterns verified against live DB schema and existing codebase conventions
- Pitfalls: HIGH — confirmed from direct DB inspection and existing pitfalls research

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable SQLite API; better-sqlite3 API unlikely to change)
