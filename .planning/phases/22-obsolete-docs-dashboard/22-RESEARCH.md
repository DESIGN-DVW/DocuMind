# Phase 22: Obsolete Docs Dashboard — Research

**Researched:** 2026-04-20
**Domain:** SQLite schema design, Kuzu inbound-link query, cron detection pass, plain-HTML dashboard UI
**Confidence:** HIGH

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
| ---- | ------------- | ----------------- |
| OBS-01 | `obsolescence_signals` table stores per-document heuristic scores (age, inbound links, keyword match, similarity), updated by daily cron pass | Schema design section; migration pattern from existing schema.sql |
| OBS-02 | `/dashboard/obsolete.html` renders a sortable, filterable table of flagged documents with confidence score, flag label, age, repo, and path | Plain-HTML dashboard pattern documented from diagrams.html |
| OBS-03 | Batch-select checkboxes + "Archive Selected" / "Dismiss" action buttons; dismiss suppresses a row for 30 days (no destructive action without confirmation) | UI pattern + suppression expiry field in OBS-01 table |
| OBS-04 | REST endpoint `GET /obsolete` returns paginated signal rows; `POST /obsolete/:id/dismiss` records suppression with expiry | Express endpoint pattern from server.mjs |
| OBS-05 | Detection heuristics: age >180 days + zero inbound Kuzu edges + keyword pattern → confidence ≥ 0.8 (obsolete); similarity duplicate → confidence ≥ 0.7 (redundant) | Heuristic scoring algorithm; Kuzu inbound-link query; content_similarities join |

</phase_requirements>

---

## Summary

Phase 22 adds a self-contained "hygiene layer" to DocuMind: a scheduled detection pass that scores every indexed document on four heuristics (age, inbound-link count, keyword patterns, similarity score) and writes results to a new `obsolescence_signals` SQLite table. A plain-HTML dashboard page (`dashboard/obsolete.html`) reads those signals via two new REST endpoints and surfaces them in a sortable, filterable table with batch-select + action buttons.

The phase has no new library dependencies — it is entirely composed of patterns already proven in the codebase: better-sqlite3 for schema and queries, node-cron in scheduler.mjs for the detection pass, kuzu for inbound-link count, content_similarities for the redundancy signal, and the diagrams.html plain-HTML pattern for the dashboard UI. The only new design decisions are the `obsolescence_signals` table schema, the scoring formula, and the 30-day suppression mechanism.

The detection pass runs inside the existing `CRON_DAILY` block (or as its own sub-call), receives `kuzuDb` via the already-wired parameter chain, and must be wrapped in try/catch so a detection failure does not abort the daily scan. REST endpoints follow the exact same shape as `/diagrams` (GET with query-string filters) and `/diagrams/relink` (POST with body).

**Primary recommendation:** Model the new `obsolescence_signals` table directly on the existing schema conventions (INTEGER PK, TEXT dates, REAL score 0.0–1.0 BETWEEN constraint, ON CONFLICT DO UPDATE for upsert), wire the detection pass into the daily cron's catch-guarded try block, and copy the diagrams.html UI skeleton verbatim as the starting point for obsolete.html.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
| --------- | --------- | --------- | -------------- |
| better-sqlite3 | existing | `obsolescence_signals` DDL + upsert + dismiss queries | Already the project DB layer; all sync operations stay sync |
| kuzu | 0.11.3 | Inbound-link count query per document | Already initialized as `kuzuDb` in server.mjs; flows as param |
| node-cron | existing | Schedule daily detection pass | Already manages all cron jobs in scheduler.mjs |
| express | existing | `GET /obsolete` + `POST /obsolete/:id/dismiss` | Existing REST API layer |

### Supporting

| Library | Version | Purpose | When to Use |
| --------- | --------- | --------- | ------------- |
| content_similarities table | existing SQLite | Redundancy signal (similarity_score ≥ 0.7) | Already populated by Phase 3 deep scan; JOIN on doc1_id/doc2_id |
| documents table | existing SQLite | Age signal (modified_at), keyword signal (path + title via LIKE) | Core document store |
| statistics table | existing SQLite | Optional: store last detection run timestamp | If scheduler wants to log detection run metadata |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ------------ | ----------- | ---------- |
| Inline detection in daily cron | Separate `detectObsolescence(db, kuzuDb)` module | Separate module is testable in isolation and keeps scheduler.mjs clean — use the module |
| Full-table recalculation on every run | Hash-based incremental update | Full recalculation is simpler and correct for daily frequency; ~620 docs processes fast in SQLite |
| Kuzu for ALL signals | Kuzu only for inbound-link count | SQLite is source of truth for age/keywords/similarity; Kuzu is graph-only per project architecture |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

```text

processors/
└── obsolescence-detector.mjs   # Detection pass + scoring logic
scripts/db/migrations/
└── 006-obsolescence-signals.sql  # New table DDL
daemon/
├── server.mjs                  # Add GET /obsolete + POST /obsolete/:id/dismiss
└── scheduler.mjs               # Wire detectObsolescence into CRON_DAILY block
dashboard/
└── obsolete.html               # Plain HTML dashboard (no build step)

```

### Pattern 1: New SQLite Table via Migration File

**What:** Create `obsolescence_signals` as a new migration file in `scripts/db/migrations/`, applied by `init-database.mjs` on daemon start.
**When to use:** Whenever a new persistent table is needed.

#### Example

```sql

-- scripts/db/migrations/006-obsolescence-signals.sql
CREATE TABLE IF NOT EXISTS obsolescence_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL UNIQUE,
  confidence_score REAL NOT NULL CHECK (confidence_score BETWEEN 0.0 AND 1.0),
  flag_label TEXT NOT NULL CHECK (flag_label IN ('obsolete', 'redundant', 'stale', 'needs-update')),
  age_days INTEGER NOT NULL,
  inbound_link_count INTEGER NOT NULL DEFAULT 0,
  keyword_matched INTEGER NOT NULL DEFAULT 0 CHECK (keyword_matched IN (0, 1)),
  similarity_score REAL CHECK (similarity_score BETWEEN 0.0 AND 1.0),
  detected_at TEXT NOT NULL,
  dismissed_until TEXT,          -- NULL = not dismissed; ISO8601 expiry date
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_obs_confidence ON obsolescence_signals(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_obs_flag ON obsolescence_signals(flag_label);
CREATE INDEX IF NOT EXISTS idx_obs_dismissed ON obsolescence_signals(dismissed_until);
CREATE INDEX IF NOT EXISTS idx_obs_doc ON obsolescence_signals(document_id);

```

Source: Verified against schema.sql conventions (INTEGER PK, REAL 0.0–1.0 BETWEEN constraint, ISO8601 TEXT dates, UNIQUE per-document, FK with CASCADE).

### Pattern 2: Kuzu Inbound-Link Count Query

**What:** For each document, count edges pointing TO it using a reverse traversal.
**When to use:** OBS-05 zero-inbound-link signal.

#### Example

```javascript

// Source: graph/kuzu-queries.mjs + kuzu 0.11.3 prepare/execute contract
async function getInboundLinkCount(kuzuDb, docId) {
  const conn = new kuzu.Connection(kuzuDb);
  try {
    const stmt = await conn.prepare(
      'MATCH (src:Document)-[r]->(tgt:Document {id: $id}) RETURN count(r) AS cnt'
    );
    const result = await conn.execute(stmt, { id: docId });
    const rows = await result.getAll();
    try { result.close(); } catch (_) {}
    return rows[0]?.cnt ?? 0;
  } finally {
    try { conn.close(); } catch (_) {}
  }
}

```

**Critical:** Use `conn.prepare()` + `conn.execute(stmt, { id: docId })` — NOT `conn.query(cypher, { id: docId })`. Second arg to `conn.query()` is a progressCallback in Kuzu 0.11.3, NOT params. This is a confirmed project decision from Phase 18.

### Pattern 3: Detection Pass as Non-Fatal Try/Catch in Scheduler

**What:** Run the obsolescence detection inside the daily cron but wrapped so failures don't abort the scan.
**When to use:** All non-critical enrichment passes in scheduler.mjs follow this pattern (see diagram snapshot, diagram relink check).

#### Example

```javascript

// In scheduler.mjs CRON_DAILY block, after runScan completes:
try {
  await detectObsolescence(db, kuzuDb);
  console.log('[scheduler] Obsolescence detection complete');
} catch (detErr) {
  console.error('[scheduler] Obsolescence detection failed (non-fatal):', detErr.message);
}

```

Source: Verified from scheduler.mjs lines 106–113 (diagram snapshot pattern), line 17-02 decision: "non-fatal — errors do not abort the scan".

### Pattern 4: Upsert via INSERT OR REPLACE / ON CONFLICT DO UPDATE

**What:** Detection pass writes one row per document, running daily — must upsert, not duplicate.
**When to use:** Any daily refresh of computed per-document stats.

#### Example

```javascript

// Source: scheduler.mjs statistics upsert (lines 38–43) — proven pattern
db.prepare(`
  INSERT INTO obsolescence_signals
    (document_id, confidence_score, flag_label, age_days, inbound_link_count,
     keyword_matched, similarity_score, detected_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(document_id) DO UPDATE SET
    confidence_score   = excluded.confidence_score,
    flag_label         = excluded.flag_label,
    age_days           = excluded.age_days,
    inbound_link_count = excluded.inbound_link_count,
    keyword_matched    = excluded.keyword_matched,
    similarity_score   = excluded.similarity_score,
    detected_at        = excluded.detected_at
    -- dismissed_until is NOT overwritten — user suppression survives re-detection
`).run(docId, score, label, ageDays, inboundCount, keywordMatched, simScore);

```

**Critical:** `dismissed_until` must NOT be overwritten by the detection pass. The upsert must preserve the existing suppression expiry.

### Pattern 5: REST Endpoint GET with Pagination + Filters

**What:** `GET /obsolete` — returns paginated rows from `obsolescence_signals` JOIN `documents`.
**When to use:** Standard read endpoint pattern in server.mjs.

#### Example

```javascript

// Source: server.mjs /search endpoint pattern (lines 291–317)
app.get('/obsolete', (req, res) => {
  const { repo, flag, limit = 50, offset = 0, include_dismissed = 'false' } = req.query;
  const now = new Date().toISOString();
  const conditions = [];
  const params = [];

  // Exclude dismissed rows unless caller asks for them
  if (include_dismissed !== 'true') {
    conditions.push('(obs.dismissed_until IS NULL OR obs.dismissed_until < ?)');
    params.push(now);
  }
  if (repo) {
    conditions.push('d.repository = ?');
    params.push(repo);
  }
  if (flag) {
    conditions.push('obs.flag_label = ?');
    params.push(flag);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const sql = `
    SELECT obs.*, d.path, d.repository, d.filename, d.modified_at, d.title
    FROM obsolescence_signals obs
    JOIN documents d ON obs.document_id = d.id
    ${where}
    ORDER BY obs.confidence_score DESC
    LIMIT ? OFFSET ?
  `;
  params.push(Number(limit), Number(offset));

  const rows = db.prepare(sql).all(...params);
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM obsolescence_signals obs JOIN documents d ON obs.document_id = d.id ${where}`).get(...params.slice(0, -2)).cnt;
  res.json({ total, count: rows.length, offset: Number(offset), rows });
});

```

### Pattern 6: POST Dismiss Endpoint

**What:** `POST /obsolete/:id/dismiss` — writes `dismissed_until` = now + 30 days.
**When to use:** Suppress a signal without deleting it or modifying the document.

#### Example

```javascript

app.post('/obsolete/:id/dismiss', (req, res) => {
  const { id } = req.params;
  const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const result = db
    .prepare(`UPDATE obsolescence_signals SET dismissed_until = ? WHERE id = ?`)
    .run(expiry, Number(id));
  if (result.changes === 0) return res.status(404).json({ error: 'Signal not found' });
  res.json({ status: 'dismissed', id: Number(id), dismissed_until: expiry });
});

```

### Pattern 7: Plain-HTML Dashboard (diagrams.html Pattern)

**What:** Self-contained HTML file served from `dashboard/`, no build step, vanilla JS fetch + DOM manipulation.
**When to use:** All DocuMind dashboards follow this pattern (constraint: no React, no Vite in dashboard pages until Phase 21 migration).

#### Key structural elements to copy from diagrams.html

- `escapeHtml()` helper — always sanitize before inserting into innerHTML

- `allRows` array + `applyFilters()` + `renderTable()` separation

- `showError()` banner pattern for fetch failures

- Filter row: `<select>` for repo + flag, text search input, Reset + Refresh buttons

- Table: thead with sortable headers, tbody with row-id anchors for optimistic updates

- `.loading` / `.empty-state` CSS classes already defined

- `fetch('/obsolete')` on page load, then filter client-side (same as diagrams fetch-then-filter)

**Checkbox batch-select pattern** (new for Phase 22, not in diagrams.html):

```javascript

// Select-all checkbox in thead; individual checkboxes in tbody
// "Archive Selected" button collects checked IDs → confirm() → POST /obsolete/batch-dismiss
// "Dismiss" per-row button → POST /obsolete/:id/dismiss → remove row from DOM

function getSelectedIds() {
  return Array.from(document.querySelectorAll('input.row-check:checked'))
    .map(function(cb) { return Number(cb.dataset.id); });
}

async function dismissSelected() {
  var ids = getSelectedIds();
  if (ids.length === 0) return;
  if (!confirm('Dismiss ' + ids.length + ' document(s) for 30 days?')) return;
  // POST each (or a batch endpoint if added)
}

```

### Heuristic Scoring Algorithm

```javascript

// Source: OBS-05 requirement + STATE.md architecture decisions
// All signals are 0/1 or 0.0–1.0; confidence is a weighted sum clamped to [0,1].

function scoreDocument(doc, inboundCount, maxSimilarity) {
  const now = Date.now();
  const modifiedAt = doc.modified_at ? new Date(doc.modified_at).getTime() : 0;
  const ageDays = Math.floor((now - modifiedAt) / (1000 * 60 * 60 * 24));

  // Signal: age > 180 days
  const ageSignal = ageDays > 180 ? 1 : 0;

  // Signal: zero inbound Kuzu edges
  const linkSignal = inboundCount === 0 ? 1 : 0;

  // Signal: keyword match in path or filename (deprecated, archive, old, TODO: delete)
  const obsKeywords = /deprecated|archive|old[-_]|todo[:\s]*delete/i;
  const keywordSignal = obsKeywords.test(doc.path) || obsKeywords.test(doc.filename || '') ? 1 : 0;

  // Signal: high similarity to another doc (redundancy)
  const simSignal = maxSimilarity >= 0.7 ? maxSimilarity : 0;

  // OBS-05 thresholds:
  // age + zero-inbound + keyword → 0.8 (obsolete)
  // similarity ≥ 0.7 → 0.7 (redundant)
  // Mix of signals → stale or needs-update

  const obsoleteScore = (ageSignal * 0.35) + (linkSignal * 0.35) + (keywordSignal * 0.30);
  const redundantScore = simSignal; // similarity IS the score

  let confidence, flagLabel;
  if (obsoleteScore >= 0.8) {
    confidence = Math.min(obsoleteScore, 1.0);
    flagLabel = 'obsolete';
  } else if (redundantScore >= 0.7) {
    confidence = redundantScore;
    flagLabel = 'redundant';
  } else if (ageSignal && linkSignal) {
    confidence = 0.55;
    flagLabel = 'stale';
  } else if (keywordSignal) {
    confidence = 0.45;
    flagLabel = 'needs-update';
  } else {
    return null; // Below detection threshold — skip
  }

  return { confidence, flagLabel, ageDays, inboundCount, keywordSignal, maxSimilarity };
}

```

**Note:** Only documents with non-null score results are upserted. Documents that fall below threshold are NOT deleted from `obsolescence_signals` — leave their existing row in place (UPDATE will keep the old score, or skip them if no existing row). This means OLD signals for documents that no longer qualify must be cleaned up separately (a `DELETE FROM obsolescence_signals WHERE document_id NOT IN (...)` pass at detection end, or per-doc threshold check before upsert).

### Anti-Patterns to Avoid

- **Avoid running Kuzu queries in a tight synchronous loop.** Each `getInboundLinkCount` opens+closes a Connection. With 620+ documents, open ONE connection for the entire detection pass and reuse it — only close when done.

- **Avoid innerHTML with unsanitized strings.** diagrams.html demonstrates `escapeHtml()` — use it on every field.

- **Avoid optimistic UI updates before server confirms.** diagrams.html only updates the DOM after a successful `res.ok` check.

- **Avoid writing `dismissed_until` back to zero on re-detection.** The ON CONFLICT DO UPDATE must not touch `dismissed_until`.

- **Avoid blocking the daily scan on detection.** The detection pass is non-fatal; wrap in try/catch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --------- | ------------- | ------------- | ----- |
| Inbound-link count per document | Custom SQLite join | Kuzu reverse traversal `MATCH (src)-[r]->(tgt {id: $id}) RETURN count(r)` | Kuzu is the graph source of truth; SQLite `doc_relationships` may have stale data |
| Similarity score per document | Re-run similarity analysis | JOIN `content_similarities` on doc1_id/doc2_id, take MAX(similarity_score) | Already computed by Phase 3 deep scan; no recomputation needed |
| Client-side sort | Custom sort algorithm | `Array.prototype.sort()` on `allRows` by column | Native JS sort is sufficient; data set is small (hundreds of rows) |
| Pagination state | Client router | Simple `offset` query param + server-side LIMIT/OFFSET | Stateless, bookmark-friendly, matches existing endpoint conventions |
| Date formatting | moment.js / date-fns | `new Date(iso).toLocaleDateString()` or relative age in days from `age_days` field | No new dependencies; age_days is already computed server-side |

**Key insight:** Everything needed already exists in the project. Phase 22 is assembly, not invention.

---

## Common Pitfalls

### Pitfall 1: Kuzu Named Parameter Trap

**What goes wrong:** `conn.query(cypher, { id: docId })` silently treats the object as a progressCallback — query runs without parameter substitution, causing Kuzu to return results for ALL documents or throw a parse error.
**Why it happens:** Kuzu 0.11.3 API: second arg to `conn.query()` is a progressCallback, not params. Named params require `conn.prepare()` + `conn.execute(stmt, params)`.
**How to avoid:** Use the `runQuery()` helper from `graph/kuzu-queries.mjs` — it handles the prepare/execute split correctly. Or mirror its exact pattern.
**Warning signs:** Detection pass returns inbound count of 0 for ALL documents regardless of graph state.

### Pitfall 2: Dismissed_Until Overwrite

**What goes wrong:** User dismisses a row; next daily detection pass re-detects the document and the ON CONFLICT DO UPDATE overwrites `dismissed_until` back to NULL, making the suppression ineffective.
**Why it happens:** Careless `ON CONFLICT DO UPDATE SET ... dismissed_until = NULL`.
**How to avoid:** The ON CONFLICT clause must explicitly exclude `dismissed_until` from the SET list. The column only changes via `POST /obsolete/:id/dismiss`.
**Warning signs:** Dismissed rows reappear after the next daily cron run.

### Pitfall 3: Missing Table Guard in Endpoints

**What goes wrong:** `GET /obsolete` throws a SQLite error if the migration hasn't run (no `obsolescence_signals` table) — crashes the endpoint with a 500 instead of a graceful 200.
**Why it happens:** Other endpoints in server.mjs guard with `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?` before querying. If the new endpoint skips this, it blows up on fresh installs.
**How to avoid:** Add the same sqlite_master guard at the top of both new endpoints. Return `{ rows: [], total: 0 }` if the table doesn't exist yet.
**Warning signs:** 500 error on `/obsolete` when daemon starts fresh before the daily scan populates the table.

### Pitfall 4: Kuzu Connection Leak in Detection Pass

**What goes wrong:** Opening 620 Connections (one per document for inbound-link count) and not closing them causes Kuzu WAL lock errors mid-pass.
**Why it happens:** Kuzu single-writer constraint. Multiple open connections in rapid succession can exhaust available handles.
**How to avoid:** Open ONE Kuzu Connection at the start of `detectObsolescence()`, run all inbound-count queries through it (batched or one-at-a-time), close it in `finally`. See Pattern 2 alternative: run a single Cypher that returns inbound counts for ALL documents in one query using `MATCH (src)-[r]->(tgt) RETURN tgt.id, count(r) GROUP BY tgt.id`.
**Warning signs:** `[Kuzu] failed to open database` or WAL timeout errors in daily cron log.

### Pitfall 5: Content Injection via Path Display

**What goes wrong:** Document `path` contains characters like `<`, `>`, or `"` — renders broken HTML or enables XSS in the dashboard.
**Why it happens:** Paths on macOS/Linux can contain unusual characters; file paths from external repos are untrusted.
**How to avoid:** Always run paths and filenames through `escapeHtml()` before injecting into `innerHTML`. This is already demonstrated in diagrams.html.
**Warning signs:** Broken table cells or unexpected HTML rendering in the dashboard.

### Pitfall 6: Batch "Archive Selected" Ambiguity

**What goes wrong:** OBS-03 says "Archive Selected" moves the action payload to a dismissal queue — but "archive" sounds destructive. If implemented as `DELETE`, it violates the requirement "no destructive action without confirmation".
**Why it happens:** Requirement wording says "Archive Selected" but the constraint says no destructive actions. Archive in this context means DISMISS (suppress for 30 days), not filesystem deletion.
**How to avoid:** Implement "Archive Selected" as batch-dismiss (30-day suppression) with a `confirm()` modal. Do NOT delete documents or rows from `obsolescence_signals`. The button label says "Archive" but the action is dismiss.
**Warning signs:** Documents disappearing from the DocuMind index after clicking Archive.

---

## Code Examples

### Bulk Inbound-Link Count via Single Kuzu Query (Preferred)

```javascript

// Source: kuzu-queries.mjs runQuery() pattern + Kuzu Cypher aggregation
// Run ONCE per detection pass — returns all document inbound counts in one query
async function getAllInboundCounts(kuzuDb) {
  const conn = new kuzu.Connection(kuzuDb);
  const countMap = new Map(); // docId -> inboundCount
  try {
    const result = await conn.query(
      'MATCH (src:Document)-[r]->(tgt:Document) RETURN tgt.id AS doc_id, count(r) AS cnt'
    );
    const rows = await result.getAll();
    try { result.close(); } catch (_) {}
    for (const row of rows) {
      countMap.set(row.doc_id, row.cnt);
    }
  } finally {
    try { conn.close(); } catch (_) {}
  }
  return countMap; // Documents NOT in the map have 0 inbound links
}

```

### Content Similarities MAX per Document

```javascript

// Source: schema.sql content_similarities table (lines 63–82)
// Returns highest similarity score for each document (either as doc1 or doc2)
const simRows = db.prepare(`
  SELECT doc_id, MAX(similarity_score) as max_score
  FROM (
    SELECT doc1_id AS doc_id, similarity_score FROM content_similarities
    UNION ALL
    SELECT doc2_id AS doc_id, similarity_score FROM content_similarities
  )
  GROUP BY doc_id
`).all();
const simMap = new Map(simRows.map(r => [r.doc_id, r.max_score]));

```

### Detection Pass Entry Point Signature

```javascript

// processors/obsolescence-detector.mjs
// Source: scheduler.mjs initScheduler() parameter pattern

/**

 * Run the obsolescence detection pass.

 * Reads all documents, scores each using four heuristics, upserts results.

 * Non-fatal — caller wraps in try/catch.

 *

 * @param {import('better-sqlite3').Database} db

 * @param {import('kuzu').Database} kuzuDb

 * @returns {Promise<{ scanned: number, flagged: number, cleared: number }>}

 */
export async function detectObsolescence(db, kuzuDb) { ... }

```

### GET /obsolete Endpoint (Skeleton)

```javascript

// Source: server.mjs /search and /keywords endpoint patterns
app.get('/obsolete', (req, res) => {
  // 1. Guard: table exists?
  const hasTable = db.prepare(
    `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='obsolescence_signals'`
  ).get();
  if (!hasTable.count) return res.json({ total: 0, count: 0, offset: 0, rows: [] });

  // 2. Build query with filters
  // ... (see Pattern 5 above)
});

```

### Dashboard Sort by Column (Client-Side)

```javascript

// Plain JS sort — no library needed. diagrams.html does no column sort,
// so this is new code but trivially simple.
var sortKey = 'confidence_score';
var sortDir = -1; // -1 = DESC, 1 = ASC

function sortBy(key) {
  if (sortKey === key) { sortDir *= -1; }
  else { sortKey = key; sortDir = -1; }
  allRows.sort(function(a, b) {
    if (a[key] < b[key]) return -1 * sortDir;
    if (a[key] > b[key]) return 1 * sortDir;
    return 0;
  });
  applyFilters(); // re-renders with sorted allRows
}

```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| -------------- | ------------------ | -------------- | -------- |
| SQLite doc_relationships for graph queries | Kuzu for inbound-link count | Phase 17/18 | Inbound count uses Kuzu reverse traversal, not SQLite JOIN |
| No staleness surface in UI | `statistics.stale_documents` in /stats JSON | Phase 3 | `stale_documents` count exists but has no drill-down — Phase 22 provides the drill-down |
| Similarity data unreachable via UI | content_similarities JOIN in detection pass | Phase 3 (schema) | Table exists with scored pairs; Phase 22 is first consumer for UI surface |

### Deprecated/outdated

- Do NOT use `similarities` as the table name — the actual table is `content_similarities` (confirmed from schema.sql line 63). Requirements say "similarities table" informally but the real name differs.

---

## Open Questions

1. **Documents table has no `title` column — only `filename` and `path`**

   - What we know: `documents` table (schema.sql lines 10–30) has: id, path, repository, filename, category, version, created_at, modified_at, last_scanned, file_size, line_count, word_count, content_hash, frontmatter, content, summary, classification. No `title` column.

   - What's unclear: The frontmatter JSON blob may contain a title field. Should the detector extract title from frontmatter for keyword matching?

   - Recommendation: Use `filename` and `path` for keyword pattern matching (sufficient for "old-", "archive", "deprecated" patterns). If frontmatter title extraction is needed, parse `frontmatter` JSON — but keep it optional and non-fatal.

2. **Threshold for including a document in the signals table**

   - What we know: OBS-05 defines ≥0.8 for obsolete, ≥0.7 for redundant. But "stale" and "needs-update" labels have no explicit threshold in requirements.

   - What's unclear: What confidence threshold triggers a row being written at all?

   - Recommendation: Write rows for any document scoring ≥0.4 on any individual signal. Below 0.4 = no row (or delete existing row). This surfaces all potentially interesting cases without flooding the dashboard.

3. **Cleanup of stale signals when document is updated**

   - What we know: ON DELETE CASCADE on `document_id` handles document deletion. But if a document is updated (content_hash changes), its signal row stays until the next detection pass re-scores it.

   - What's unclear: Should `POST /obsolete/:id/dismiss` also handle the case where the document was genuinely updated (not just dismissed)?

   - Recommendation: Implement "Mark Updated" as a dismiss variant that sets `dismissed_until` to a longer period (90 days) — do NOT delete the signal. Re-detection will naturally update or remove the row if the document no longer qualifies.

4. **Batch dismiss endpoint vs. N individual POSTs**

   - What we know: OBS-03 requires "Archive Selected" for batch operations. OBS-04 only specifies `POST /obsolete/:id/dismiss` (singular).

   - What's unclear: Is a batch endpoint needed or is N individual POSTs acceptable?

   - Recommendation: Implement a `POST /obsolete/batch-dismiss` endpoint that accepts `{ ids: [1,2,3] }` and dismisses all in a single SQLite transaction. This prevents UI from making 50 individual requests when a user selects many rows.

---

## Sources

### Primary (HIGH confidence)

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/scripts/db/schema.sql` — full SQLite schema, confirmed table names (`content_similarities` not `similarities`), column list for `documents`

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/daemon/server.mjs` — endpoint patterns, Kuzu connection lifecycle, sqlite_master guard pattern, helmet config

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/daemon/scheduler.mjs` — cron job wiring, `kuzuDb` parameter chain, non-fatal try/catch pattern

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/dashboard/diagrams.html` — plain-HTML dashboard pattern, escapeHtml(), filter/render separation

- `/Users/Shared/htdocs/github/DVWDesign/DocuMind/graph/kuzu-queries.mjs` — Kuzu 0.11.3 prepare/execute API, `runQuery()` helper pattern

- `.planning/REQUIREMENTS.md` — OBS-01..05 exact wording and thresholds

- `.planning/STATE.md` — project decisions (Kuzu named params, non-fatal sync, kuzuDb param chain)

### Secondary (MEDIUM confidence)

- Phase 17 / 18 commit notes and plan summaries — Kuzu 0.11.3 API empirically confirmed; prepare+execute required for named params

### Tertiary (LOW confidence)

- None — all findings are from primary project sources, no web research required.

---

## Metadata

### Confidence breakdown

- Standard stack: HIGH — no new libraries; all patterns verified from existing source files

- Architecture: HIGH — migration pattern, endpoint pattern, scheduler wiring all directly observable in codebase

- Scoring algorithm: MEDIUM — thresholds from OBS-05 requirements are clear; weight distribution for the 3-signal obsolete score is an implementation decision (planner can adjust)

- Pitfalls: HIGH — Kuzu named-param trap confirmed from STATE.md decision [18-01]; dismissed_until overwrite is a logic design risk confirmed by upsert semantics

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (stable codebase; no fast-moving dependencies)
