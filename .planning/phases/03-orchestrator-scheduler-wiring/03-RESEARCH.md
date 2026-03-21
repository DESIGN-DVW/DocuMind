# Phase 3: Orchestrator & Scheduler Wiring — Research

**Researched:** 2026-03-17
**Domain:** Node.js daemon orchestration — wiring existing processors into a unified pipeline callable from scheduler, REST, and hooks
**Confidence:** HIGH (all findings from direct codebase inspection; no external library research required — all dependencies are already installed and in use)

---

## Summary

Phase 3 is primarily a **wiring phase**, not a feature-building phase. Every processor (markdown indexer, keyword extractor, relationship builder, similarity detector, deviation analyzer) already exists as implemented code. The gap is that nothing calls them. The `scheduler.mjs` has five cron jobs, three of which are pure TODO stubs. The `hooks.mjs` has four TODO stubs. The `watcher.mjs` has three TODO stubs. The `/scan` REST endpoint returns a static `"queued"` response and never calls anything.

The solution is a single `orchestrator.mjs` module that sequences all processor calls for each scan mode (incremental, full, deep), then has every entry point (scheduler, REST, hooks, watcher) call into that orchestrator instead of implementing their own logic.

The most important implementation constraint is the **sibling edge cap** in `buildRelationships()`: with 8,172 documents currently indexed, the existing same-folder sibling loop in `graph/relations.mjs` lines 111–128 will generate millions of low-value edges. This must be fixed before `buildRelationships()` is ever called. This is the only piece that requires modifying an existing file before calling it.

**Primary recommendation:** Create `orchestrator.mjs` first, fix the sibling edge cap inside `buildRelationships()` before calling it, then wire scheduler → orchestrator, watcher → orchestrator, hooks → orchestrator, and REST `/scan` → orchestrator in sequence. Add FTS5 rebuild at the end of every bulk write.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
| ---- | ------------- | ----------------- |
| ORCH-01 | `orchestrator.mjs` consolidates scan pipeline (markdown indexing, keyword extraction, graph population, staleness detection) into a single callable function | Orchestrator pattern: each entry point calls one of three modes (incremental/full/deep); all processor imports centralized here |
| ORCH-02 | Scheduler hourly cron calls orchestrator for incremental scan (changed files only via content_hash) | Hourly cron at line 32 of scheduler.mjs has a TODO stub; content_hash delta detection needs a `WHERE content_hash != ?` or `WHERE last_scanned < modified_at` approach |
| ORCH-03 | Scheduler daily cron calls orchestrator for full scan + deviation analysis | Daily cron at line 66 of scheduler.mjs is a pure TODO stub; full scan = scan all repos regardless of hash; deviation = populate deviations table |
| ORCH-04 | Scheduler weekly cron calls orchestrator for keyword refresh + graph rebuild | Weekly cron at line 73 of scheduler.mjs is a pure TODO stub; keyword refresh = DELETE all keywords, re-extract; graph rebuild = DELETE doc_relationships, re-run buildRelationships() with sibling cap |
| ORCH-05 | `/scan` REST endpoint calls orchestrator (not a separate implementation) | `/scan` POST at server.mjs line 208 returns static `"queued"` with TODO comment; must call orchestrator.runScan(db, ctx, { repo }) |
| ORCH-06 | FTS5 explicit rebuild after every bulk write operation | `INSERT INTO documents_fts(documents_fts) VALUES('rebuild')` must run after any batch upsert to documents; after keyword batch inserts, `keywords_fts` needs equivalent rebuild |
| INTL-01 | Auto-generate document summary from frontmatter description > first paragraph > title+keywords fallback | `summary TEXT` column exists in documents table (Phase 1); `processMarkdown()` in markdown-processor.mjs does not yet populate it; summary extraction logic must be added |
| INTL-02 | Auto-classify documents using context profile classification rules (path match + frontmatter field match) | `classification TEXT` column exists in documents table (Phase 1); markdown-processor.mjs uses hardcoded `detectCategory()` function instead of `ctx.classificationRules`; must replace with ctx-based classification |
| INTL-03 | Auto-extract tags via TF-IDF keyword processor with confidence scores | `document_tags` table exists (Phase 1); `indexKeywords()` in keyword-processor.mjs populates `keywords` table not `document_tags`; either use `document_tags` for per-doc tags or pipe keyword extraction through document_tags |
| INTL-04 | Populate document relationship graph via `buildRelationships()` with sibling edge cap (max 10 per folder) | `doc_relationships` table has 0 rows; `buildRelationships()` exists but is never called; sibling loop at lines 111–128 of graph/relations.mjs must be capped before first call |
| INTL-05 | Detect similar/duplicate documents across repos (Levenshtein + cosine, threshold 0.7) | `content_similarities` table exists (columns: doc1_id, doc2_id, similarity_score, detected_at, deviation_type, notes, reviewed, resolution); no similarity computation runs today |
| INTL-06 | Detect stale documents (content_hash changed in linked files but doc not updated) | `documents` table has `content_hash` column; no `freshness_score` column exists — staleness must be detected relationally (linked doc changed but this doc didn't); stale count must appear in `/stats` |
| INTL-07 | Detect convention deviations (5 types: content_drift, structure_change, rule_violation, version_mismatch, metadata_inconsistency) | `deviations` table exists (columns: id, document_id, related_doc_id, deviation_type, severity, description, detected_at, resolved_at, resolution_action, resolver); deviation scripts exist in scripts/ but are not called from scheduler |
</phase_requirements>

---

## Standard Stack

### Core (All Already Installed)

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| `better-sqlite3` | installed | Synchronous SQLite — all DB operations | Already in use throughout daemon and processors; WAL mode already configured |
| `node-cron` | installed | Cron job scheduler | Already imported in scheduler.mjs; handles all periodic triggers |
| `natural` | installed | TF-IDF keyword extraction | Already used in keyword-processor.mjs; `extractKeywords()` and `indexKeywords()` are ready |
| `fast-glob` | installed | File pattern matching for incremental scans | Already used in index-markdown.mjs and scan-all-repos.mjs |
| `gray-matter` | installed | Frontmatter parsing | Already used in markdown-processor.mjs `processMarkdown()` |

### No New Dependencies Needed

Phase 3 requires zero new npm packages. All required libraries are already installed and in use. The phase is purely wiring and incremental logic additions to existing processor functions.

## Architecture Patterns

### Pattern 1: Three-Mode Orchestrator

The orchestrator exposes three named scan modes that callers choose from:

```javascript
// orchestrator.mjs
export async function runScan(db, ctx, options = {}) {
  const { mode = 'incremental', repo = null } = options;
  switch (mode) {
    case 'incremental': return runIncrementalScan(db, ctx, repo);
    case 'full':        return runFullScan(db, ctx, repo);
    case 'deep':        return runDeepScan(db, ctx);
  }
}
```

- **incremental**: scan files where `modified_at > last_scanned` or `content_hash` changed; call `indexMarkdown`; no graph rebuild; no keyword refresh
- **full**: scan all repos (all files); call `indexMarkdown` for each; run deviation analysis; rebuild FTS5; update scan_history
- **deep**: same as full + keyword refresh (`indexKeywords` for all docs) + graph rebuild (`buildRelationships` with sibling cap)

### Pattern 2: Scheduler Passes ctx

The scheduler currently receives only `(db, root)`. Phase 3 requires it to also receive `ctx` because processors need `ctx.keywordTaxonomy` and `ctx.classificationRules`. Scheduler signature must become `initScheduler(db, root, ctx)`.

In `server.mjs` at line 509, the call is currently `initScheduler(db, ROOT)` — this must become `initScheduler(db, ROOT, ctx)`.

### Pattern 3: Sibling Edge Cap (Mandatory Before Graph Build)

The existing sibling block in `graph/relations.mjs` lines 111–128 must be modified to cap at 10 edges per folder before `buildRelationships()` is ever called against the live 8K doc corpus:

```javascript
// BEFORE calling any siblings loop, group docs by directory
const siblingsByDir = new Map();
for (const doc of docs) {
  const dir = path.dirname(doc.path);
  if (!siblingsByDir.has(dir)) siblingsByDir.set(dir, []);
  siblingsByDir.get(dir).push(doc);
}

// In the per-doc loop, replace the current sibling filter with:
const dirPath = path.dirname(doc.path);
const siblings = (siblingsByDir.get(dirPath) || [])
  .filter(d => d.id !== doc.id && d.id > doc.id)
  .slice(0, 10); // cap: max 10 sibling edges per doc
```

Additionally, skip sibling edges for folders with more than 50 docs (dispatch dirs):

```javascript
const siblingsInDir = siblingsByDir.get(dirPath) || [];
if (siblingsInDir.length > 50) continue; // skip bulk-dispatch directories
```

### Pattern 4: FTS5 Rebuild After Bulk Writes (ORCH-06)

Must be called at the end of every bulk document upsert:

```javascript
db.prepare("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')").run();
db.prepare("INSERT INTO keywords_fts(keywords_fts) VALUES('rebuild')").run();
```

This is safe on 8K documents (completes in < 5 seconds). It must run after `indexMarkdown` batch operations in the orchestrator, not inside `indexMarkdown` itself (which is a single-file function called in a loop — rebuilding FTS5 per file is prohibitively expensive).

### Pattern 5: Staleness Detection Without freshness_score Column

The `documents` table has no `freshness_score` column. Staleness must be computed relationally via the `doc_relationships` table: a document is stale if it has `imports` or `depends_on` edges to documents whose `content_hash` or `modified_at` changed after the source doc's `last_scanned`.

```sql
-- Stale document detection query
SELECT DISTINCT s.id, s.path, s.repository, s.last_scanned
FROM documents s
JOIN doc_relationships dr ON dr.source_doc_id = s.id
JOIN documents t ON dr.target_doc_id = t.id
WHERE dr.relationship_type IN ('imports', 'depends_on')
  AND t.modified_at > s.last_scanned
```

This requires the graph to be populated first (INTL-04 before INTL-06). An alternative simpler staleness heuristic for docs with zero graph edges: `modified_at` more than 90 days ago with no recent scan.

The `/stats` endpoint must be updated to report stale count (success criterion #3).

### Pattern 6: Summary Extraction (INTL-01)

The `summary TEXT` column in `documents` exists but `indexMarkdown()` never populates it. Add `extractSummary()` to `markdown-processor.mjs`:

```javascript
function extractSummary(frontmatter, content) {
  // Priority 1: frontmatter.description
  if (frontmatter.description) return frontmatter.description.slice(0, 500);
  // Priority 2: first non-heading paragraph
  const lines = content.split('\n');
  const firstPara = lines.find(l => l.trim() && !l.startsWith('#'));
  if (firstPara?.trim().length > 20) return firstPara.trim().slice(0, 500);
  // Priority 3: title + top keywords (no ctx needed — uses raw content)
  return null; // caller writes NULL if no summary found
}
```

Then in `indexMarkdown()`, populate `summary` in the UPSERT.

### Pattern 7: ctx-Based Classification (INTL-02)

`markdown-processor.mjs` currently has a hardcoded `detectCategory()` function (lines 109–131) that uses DVWDesign-specific path patterns. Phase 2 added `ctx.classificationRules` (an array of compiled RegExp rules with their target classifications). The `detectCategory()` call in `processMarkdown()` must be replaced by a `classifyPath(filePath, ctx)` function that iterates `ctx.classificationRules`:

```javascript
function classifyPath(filePath, frontmatter, ctx) {
  if (frontmatter.classification) return frontmatter.classification;
  if (frontmatter.category) return frontmatter.category; // backward compat
  for (const rule of ctx.classificationRules) {
    if (rule.pattern.test(filePath)) return rule.classification;
  }
  return 'other';
}
```

This means `indexMarkdown(db, filePath, repository)` must become `indexMarkdown(db, filePath, repository, ctx)` — a signature change that all callers (watcher, hooks, orchestrator) must propagate.

### Pattern 8: Document Tags vs Keywords Table (INTL-03)

The requirements specify populating `document_tags` (per-document flat tag list with confidence scores). The current `indexKeywords()` in `keyword-processor.mjs` populates the `keywords` table, not `document_tags`. The distinction:

- `keywords` table: repo-level TF-IDF scores, used for the `/keywords` cloud endpoint
- `document_tags` table: per-document tags with confidence, used for filtering in search

The orchestrator should call both: `indexKeywords()` for the keywords cloud, and a new `indexDocumentTags()` function that writes the same extracted keywords to `document_tags`. Alternatively, `indexKeywords()` can be extended to write to both tables in one pass. The simpler approach: extend `indexKeywords()` to also upsert to `document_tags` with `source='extracted'` and `confidence=normalized_tfidf_score`.

### Recommended Project Structure

```text
DocuMind/
├── orchestrator.mjs            # NEW — three-mode scan pipeline
├── daemon/
│   ├── server.mjs              # MODIFY — /scan endpoint calls orchestrator
│   ├── scheduler.mjs           # MODIFY — fill 3 TODO stubs; accept ctx param
│   ├── watcher.mjs             # MODIFY — fill markdown TODO stub; call orchestrator.indexSingle()
│   └── hooks.mjs               # MODIFY — fill post-write, post-commit, scan TODOs
├── processors/
│   └── markdown-processor.mjs  # MODIFY — add summary extraction; add ctx-based classification; ctx param
├── graph/
│   └── relations.mjs           # MODIFY — cap sibling edges before bulk build
└── (no new processors needed)
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Incremental file detection | Custom file walker comparing mtimes | `WHERE last_scanned < modified_at` SQL query on `documents` table | SQLite already stores both timestamps; file walker is redundant |
| Content hash comparison | Re-reading and re-hashing all files | `WHERE content_hash != ?` after computing hash of current file | Hash already stored on first index; only compute new hash for files that look changed by mtime |
| Similarity detection | Custom Levenshtein implementation | `natural.js` already provides `LevenshteinDistance`; or use cosine on TF-IDF vectors already computed | `natural` is already installed for TF-IDF |
| Cron scheduling | Custom timer loop | `node-cron` already in use in scheduler.mjs | Already installed, already registering 5 jobs |
| FTS5 query planning | Custom tokenizer | SQLite FTS5 `MATCH` operator and `rebuild` virtual command | Already in use for search endpoint |

## Common Pitfalls

### Pitfall 1: Calling buildRelationships() Without Sibling Cap

**What goes wrong:** With 8,172 documents, the existing sibling loop generates O(n²) pairs within each directory. The `dispatches/pending/ALL/` path alone could have hundreds of dispatch files, generating thousands of weak `related_to` edges per document — potentially millions of rows.

**Why it happens:** The loop was written for small corpora. It has never been tested against live data.

**How to avoid:** Implement the directory-group approach described in Pattern 3 above. Cap at 10 sibling edges per doc and skip directories with more than 50 docs entirely. After the first run, verify with `SELECT COUNT(*) FROM doc_relationships` — should be under 50K for this corpus.

**Warning signs:** `buildRelationships()` runs longer than 60 seconds; `doc_relationships` count exceeds 500K; graph queries time out.

### Pitfall 2: FTS5 Rebuild Inside the Per-File Loop

**What goes wrong:** Calling `INSERT INTO documents_fts(documents_fts) VALUES('rebuild')` inside the per-file indexing loop causes FTS5 to rebuild from scratch after every single file — 8K rebuilds for a full scan.

**How to avoid:** The rebuild must happen ONCE at the end of the batch, not inside `indexMarkdown()`. The orchestrator calls the rebuild; individual processor functions do not.

### Pitfall 3: Staleness Detection Before Graph Is Populated

**What goes wrong:** The relational staleness query (Pattern 5) requires `doc_relationships` to have edges. If called on a clean DB (0 edges), it returns 0 stale docs — which looks correct but isn't (the graph just hasn't been built yet).

**How to avoid:** In the orchestrator, deep scan always runs graph rebuild BEFORE staleness detection. In the scheduler, weekly deep scan wires these in order: (1) index all docs, (2) rebuild graph, (3) detect staleness, (4) rebuild FTS5.

### Pitfall 4: Scheduler Missing ctx Parameter

**What goes wrong:** `initScheduler(db, root)` in its current form cannot pass `ctx` to processor functions that need `ctx.keywordTaxonomy` and `ctx.classificationRules`. Adding keyword extraction to the weekly cron will silently fail or throw because `ctx` is not in scope.

**How to avoid:** Update `initScheduler` signature to `initScheduler(db, root, ctx)` on the same commit that wires the first ctx-dependent processor call. Update `server.mjs` line 509 in the same commit.

### Pitfall 5: scan_history Table Column Mismatch

**What goes wrong:** The `scheduler.mjs` hourly cron (lines 34–51) inserts into `scan_history` with only `(scan_started, status)` and updates with `(scan_completed, status, duration_ms)`. The actual table has columns: `id, scan_started, scan_completed, repositories_scanned, documents_found, documents_added, documents_updated, documents_removed, duration_ms, status, error`. The existing code works but loses telemetry — the orchestrator should populate the count columns to get useful scan history.

**How to avoid:** The orchestrator returns a result object `{ documentsFound, added, updated, removed, durationMs }` and the scheduler updates `scan_history` with all columns.

### Pitfall 6: Watcher indexMarkdown Call Bypasses ctx

**What goes wrong:** The watcher TODO stub at line 196 (`// TODO: trigger markdown-processor re-index for this file`) needs to call `indexMarkdown(db, filePath, repository, ctx)`. But `ctx` is a parameter of `initWatcher(db, root, ctx)` — it's in closure scope. The watcher already has ctx in scope. No structural change needed beyond filling the stub. However, if the call is made without ctx (the old 3-arg signature), it silently produces wrong classification.

**How to avoid:** Fill the stub with `await indexMarkdown(db, change.path, repoMatch, ctx)` — four args including ctx.

## Code Examples

### orchestrator.mjs Skeleton

```javascript
// orchestrator.mjs — new file at DocuMind root
import { glob } from 'fast-glob';
import { indexMarkdown } from './processors/markdown-processor.mjs';
import { indexKeywords } from './processors/keyword-processor.mjs';
import { buildRelationships } from './graph/relations.mjs';

export async function runScan(db, ctx, options = {}) {
  const { mode = 'incremental', repo = null } = options;
  const startMs = Date.now();

  if (mode === 'incremental') return runIncrementalScan(db, ctx, repo, startMs);
  if (mode === 'full')        return runFullScan(db, ctx, repo, startMs);
  if (mode === 'deep')        return runDeepScan(db, ctx, startMs);
  throw new Error(`Unknown scan mode: ${mode}`);
}

async function runIncrementalScan(db, ctx, repo, startMs) {
  // 1. Find files changed since last scan (mtime-based)
  // 2. Call indexMarkdown for each changed file
  // 3. FTS5 rebuild once at end
  // Returns: { mode, added, updated, durationMs }
}

async function runFullScan(db, ctx, repo, startMs) {
  // 1. Scan all repos (or one repo if specified)
  // 2. indexMarkdown for all .md files
  // 3. runDeviationAnalysis()
  // 4. FTS5 rebuild
  // Returns: { mode, scanned, added, updated, durationMs }
}

async function runDeepScan(db, ctx, startMs) {
  // 1. runFullScan (all repos)
  // 2. indexKeywords for all documents
  // 3. keywords_fts rebuild
  // 4. buildRelationships (with sibling cap)
  // 5. detectStaleness
  // 6. detectSimilarities
  // 7. FTS5 rebuild
  // Returns: { mode, scanned, keywords, edges, stale, similarities, durationMs }
}
```

### Scheduler Wiring (replacing TODO stubs)

```javascript
// scheduler.mjs — after adding ctx parameter to initScheduler(db, root, ctx)
import { runScan } from '../orchestrator.mjs';

// Hourly: incremental
cron.schedule('0 * * * *', async () => {
  const scanId = /* insert scan_history row */;
  try {
    const result = await runScan(db, ctx, { mode: 'incremental' });
    /* update scan_history with result */
  } catch (err) { /* update scan_history status=failed */ }
});

// Daily 2AM: full scan + deviation
cron.schedule('0 2 * * *', async () => {
  await runScan(db, ctx, { mode: 'full' });
});

// Weekly Sunday 3AM: deep analysis
cron.schedule('0 3 * * 0', async () => {
  await runScan(db, ctx, { mode: 'deep' });
});
```

### REST /scan Endpoint (replacing TODO)

```javascript
// server.mjs — replace static queued response
app.post('/scan', async (req, res) => {
  const { repo, mode = 'incremental' } = req.body;
  res.json({ status: 'queued', repo: repo || 'all', mode });
  // non-blocking: run after response sent
  setImmediate(async () => {
    try {
      await runScan(db, ctx, { mode, repo });
    } catch (err) {
      console.error('[scan] Error:', err.message);
    }
  });
});
```

### FTS5 Rebuild Pattern

```javascript
// Called once at end of bulk operations, not inside per-file loops
function rebuildFTS(db) {
  db.prepare("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')").run();
}
function rebuildKeywordsFTS(db) {
  db.prepare("INSERT INTO keywords_fts(keywords_fts) VALUES('rebuild')").run();
}
```

## Implementation Order (Recommended)

Phase 3 has internal dependencies that dictate implementation order:

```text
Wave 1 — Foundations (unblock all subsequent work):
  1a. Fix sibling edge cap in graph/relations.mjs (INTL-04 safety)
  1b. Add extractSummary() to markdown-processor.mjs (INTL-01)
  1c. Add ctx-based classifyPath() to markdown-processor.mjs; update indexMarkdown() signature (INTL-02)
       → extends signature to indexMarkdown(db, filePath, repository, ctx)

Wave 2 — Orchestrator (the central new file):
  2.  Create orchestrator.mjs with runScan(db, ctx, options) — three modes
       → imports indexMarkdown, indexKeywords, buildRelationships
       → incremental mode: mtime delta scan
       → full mode: all files + deviations
       → deep mode: full + keywords + graph + staleness

Wave 3 — Entry Points (all call into orchestrator):
  3a. Wire scheduler.mjs (add ctx param; replace 3 TODO stubs with runScan calls)
       → update server.mjs initScheduler call to pass ctx
  3b. Wire server.mjs /scan endpoint (call runScan non-blocking)
  3c. Wire watcher.mjs markdown TODO stub (call indexMarkdown single-file)
  3d. Wire hooks.mjs post-write, post-commit, scan TODOs (call indexMarkdown / runScan)

Wave 4 — Document Intelligence (fills tables):
  4a. Populate document_tags table via extended indexKeywords (INTL-03)
  4b. Implement similarity detection in orchestrator deep mode (INTL-05)
  4c. Implement staleness detection in orchestrator (INTL-06)
  4d. Implement deviation detection call in orchestrator full mode (INTL-07)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Hard-coded REPOS list in scan-all-repos.mjs | ctx.repoRoots from context profile | Phase 2 complete | Scanner must use ctx.repoRoots, not the hardcoded constant |
| detectCategory() hardcoded in markdown-processor | ctx.classificationRules from profile | Phase 2 ready, Phase 3 must adopt | INTL-02 requires this migration |
| Hardcoded TECH_KEYWORDS / ACTION_KEYWORDS | ctx.keywordTaxonomy | Phase 2 complete | Already done; all keyword calls need ctx |
| scheduler.mjs receives (db, root) | scheduler.mjs must receive (db, root, ctx) | Phase 3 change | One-line server.mjs update required |

**Key finding:** `scan-all-repos.mjs` (scripts/scan-all-repos.mjs) still has hardcoded `BASE_PATH` and `REPOS` constant at the module top — it was not refactored in Phase 2 because it is a CLI script, not a daemon module. The orchestrator should NOT import this file. Instead, it should build its own scan loop using `ctx.repoRoots` and `fast-glob`, calling `indexMarkdown()` directly.

## Open Questions

1. **Similarity detection algorithm (INTL-05)**
   - What we know: `content_similarities` table exists with `similarity_score` field; `natural.js` is installed
   - What's unclear: Whether the intent is Levenshtein on full content (slow on 8K docs), TF-IDF cosine (faster — reuse existing TF-IDF vectors), or a hybrid
   - Recommendation: Use TF-IDF cosine on already-extracted keywords — reuse what `extractKeywords()` already computes; compare keyword score vectors across documents in the same repo first (cross-repo comparison is more expensive and less useful)

2. **Deviation detection types (INTL-07)**
   - What we know: `deviations` table has `deviation_type` column; REQUIREMENTS.md lists 5 types
   - What's unclear: The existing deviation detection scripts in `scripts/` are not imported from anywhere — need to verify if they produce valid output or need to be rewritten to write to the `deviations` table
   - Recommendation: Inspect `scripts/` deviation scripts before planning Plan 4 (Wave 4 work)

3. **Incremental scan mtime strategy**
   - What we know: `documents.last_scanned` and `documents.modified_at` exist; `documents.content_hash` exists
   - What's unclear: For files not yet in the DB, `last_scanned` doesn't exist — need to glob all repo files and compare against DB
   - Recommendation: `SELECT path, content_hash, last_scanned FROM documents` into a Map; glob all repo files; for each file on disk, stat → if not in Map, add; if in Map and file mtime > last_scanned, re-hash and compare content_hash

## Validation Architecture

nyquist_validation is not in config.json — the `workflow` key only has `research`, `plan_check`, and `verifier`. No test framework is configured. Verification is done via the gsd-verifier agent using live observable state (SQL queries, log output, API responses).

**Phase gate verification approach (matches success criteria):**

| Success Criterion | Verification Command | Notes |
| --- | --- | --- |
| GET /graph returns actual edges | `SELECT COUNT(*) FROM doc_relationships` > 0 | After first deep scan |
| GET /keywords returns TF-IDF scores | `SELECT COUNT(*) FROM keywords` > 0 | After weekly cron or manual /scan?mode=deep |
|  GET /stats shows non-zero stale count  |  `curl localhost:9000/stats \ |  jq .stale` > 0  |
|  POST /scan triggers orchestrator  |  `pm2 logs documind \ |  grep '\[orchestrator\]'`  |
|  Scheduler logs show all jobs firing  |  `pm2 logs documind \ |  grep '\[scheduler\]'`  |

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/daemon/scheduler.mjs` — confirmed 3 TODO stubs at lines 44, 68, 75
- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/daemon/watcher.mjs` — confirmed TODO at line 196 (markdown re-index), lines 203 and 207 (pdf/word)
- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/daemon/hooks.mjs` — confirmed TODOs at lines 35, 43, 49, 55
- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/daemon/server.mjs` — confirmed `/scan` TODO at line 216; `initScheduler(db, ROOT)` at line 509 (no ctx)
- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/graph/relations.mjs` — confirmed sibling loop at lines 111–128; `buildRelationships()` never called
- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/processors/markdown-processor.mjs` — confirmed hardcoded `detectCategory()` at lines 109–131; no summary extraction; no ctx param
- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/processors/keyword-processor.mjs` — confirmed `indexKeywords()` populates `keywords` table only; already uses ctx
- Live DB inspection: `doc_relationships` = 0 rows; `keywords` = 0 rows; `documents` = 8,172 rows; `summary` and `classification` columns exist; `freshness_score` does NOT exist

### Secondary (HIGH confidence — Phase verification documents)

- `.planning/phases/02-context-profile-loader/02-VERIFICATION.md` — confirmed ctx object structure: 16 repoRoots, 12 classificationRules (RegExp), 53 tech keywords, 17 action keywords, 8 relationshipTypes
- `.planning/REQUIREMENTS.md` — confirmed all 13 Phase 3 requirement IDs and descriptions
- `.planning/research/PITFALLS.md` — O(n²) sibling edge pitfall documented; FTS5 rebuild requirement documented

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries already installed; verified by package.json inspection
- Architecture: HIGH — all patterns derived from direct codebase inspection, not assumptions
- Pitfalls: HIGH — sibling edge cap, FTS5 rebuild, and staleness ordering verified against live DB state and source code

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable — no fast-moving dependencies; all libraries pre-installed)
