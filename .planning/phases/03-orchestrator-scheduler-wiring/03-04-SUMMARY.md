---

phase: 03-orchestrator-scheduler-wiring
plan: 04
subsystem: document-intelligence
tags: [keywords, document-tags, similarity, staleness, deviations, orchestrator, stats]

requires:

  - phase: 03-02

    provides: runScan(db, ctx, options) with incremental/full/deep modes and placeholders

  - phase: 03-01

    provides: indexMarkdown with classification + summary

provides:

  - processors/keyword-processor.mjs — indexKeywords now writes to both keywords and document_tags

  - orchestrator.mjs — detectSimilarities, detectStaleness, detectDeviations functions

  - orchestrator.mjs — runFullScan calls detectDeviations; runDeepScan calls detectStaleness + detectSimilarities

  - daemon/server.mjs — /stats returns stale_documents count from statistics table

affects: [keyword-processor, orchestrator-deep-scan, orchestrator-full-scan, stats-endpoint]

tech-stack:
  added: []
  patterns:

  - "cosineSimilarity over TF-IDF keyword Map pairs — O(n^2) but bounded to same-repo pairs only"

  - "Statistics table UPSERT pattern — INSERT ... ON CONFLICT(stat_name) DO UPDATE for stale_documents"

  - "INSERT OR IGNORE for document_tags — handles UNIQUE(document_id, tag) constraint gracefully"

  - "All detection functions are idempotent — clear auto-detected records before re-running"

key-files:
  created: []
  modified:

  - processors/keyword-processor.mjs

  - orchestrator.mjs

  - daemon/server.mjs

key-decisions:

  - "deviation_type in content_similarities must be 'duplicate' not 'potential_duplicate' — schema CHECK constraint only allows duplicate/variant/outdated/partial"

  - "deviations.severity mapped to schema values — plan's 'medium' -> 'minor', 'low' -> 'info' (schema allows critical/major/minor/info)"

  - "document_tags uses INSERT OR IGNORE not INSERT OR REPLACE — avoids re-triggering FTS sync triggers on duplicate keyword runs"

  - "doc1_id < doc2_id enforced in detectSimilarities — content_similarities has CHECK constraint requiring ordered doc IDs"

  - "detected_at included explicitly in INSERT statements — both content_similarities and deviations have NOT NULL detected_at"

requirements-completed: [INTL-03, INTL-05, INTL-06, INTL-07]

duration: ~4m
completed: 2026-03-16

---

# Phase 3 Plan 04: Document Intelligence Features Summary

> TF-IDF cosine similarity detection, relationship-graph staleness detection, 5-type deviation analysis, and per-document tag population — replacing all deep/full scan placeholders and surfacing stale_documents in /stats

## Performance

- **Duration:** ~4 min

- **Started:** 2026-03-16T~18:50Z

- **Completed:** 2026-03-16T~18:54Z

- **Tasks:** 2

- **Files modified:** 3

## Accomplishments

- `processors/keyword-processor.mjs` — `indexKeywords` now writes to both `keywords` (repo-level cloud) and `document_tags` (per-doc tag filtering with normalized confidence); clears old extracted tags before re-inserting (idempotent)

- `orchestrator.mjs` — added `cosineSimilarity()` helper and three detection functions:

  - `detectSimilarities(db, ctx)` — builds TF-IDF keyword vectors per document, computes cosine similarity for same-repo pairs, stores pairs >= 0.7 in `content_similarities` with `deviation_type='duplicate'`

  - `detectStaleness(db)` — queries relationship graph for docs with `imports/depends_on` edges to recently modified targets, plus age-based (90-day) fallback for isolated docs; persists count to `statistics` table

  - `detectDeviations(db, ctx)` — detects 5 types: `rule_violation` (missing title/date frontmatter), `content_drift` (same folder + same heading count but >50% word count variance), `structure_change` (recently modified docs with no headings), `version_mismatch` (peer docs in same folder have different version frontmatter), `metadata_inconsistency` (frontmatter.category disagrees with classification column)

- `orchestrator.mjs` — `runFullScan` replaces deviation placeholder with `detectDeviations` call; `runDeepScan` replaces two placeholders with `detectStaleness` + `detectSimilarities` calls; both add results to return object

- `daemon/server.mjs` — `/stats` endpoint queries `statistics` table for `stale_documents` stat and includes it in response JSON

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend indexKeywords to populate document_tags table** — `be44a9b` (feat)

2. **Task 2: Add similarity, staleness, and deviation detection to orchestrator** — `0c5bb8f` (feat)

## Files Created/Modified

- `processors/keyword-processor.mjs` — indexKeywords now double-writes to document_tags with normalized confidence scores and INSERT OR IGNORE semantics

- `orchestrator.mjs` — 200+ lines added: cosineSimilarity helper, detectSimilarities, detectStaleness, detectDeviations; scan modes updated; placeholders removed

- `daemon/server.mjs` — /stats handler queries statistics table for stale_documents; adds field to response

## Decisions Made

- `deviation_type='duplicate'` used in content_similarities — plan specified `'potential_duplicate'` but the schema CHECK constraint only allows `duplicate/variant/outdated/partial`; `'duplicate'` is the correct value

- `severity` mapped to schema values — plan used `'medium'` and `'low'` but schema only allows `critical/major/minor/info`; mapped `medium` -> `minor`, `low` -> `info`

- `INSERT OR IGNORE` for document_tags — chosen over `INSERT OR REPLACE` to avoid re-triggering the `doc_tags_au` FTS sync trigger on idempotent runs with identical keywords

- `doc1_id < doc2_id` enforced in similarity insert — `content_similarities` has `CONSTRAINT chk_ordered_docs CHECK (doc1_id < doc2_id)`; sort is applied before each insert

- `detected_at` included explicitly in all inserts — both `content_similarities.detected_at` and `deviations.detected_at` are NOT NULL columns; omitting them would fail at runtime

## Deviations from Plan

### Auto-fixed Issues

#### 1. [Rule 1 - Bug] Schema constraint mismatches required value adjustments

- **Found during:** Task 2 (pre-implementation schema review)

- **Issue:** Plan specified `deviation_type='potential_duplicate'` and severity values `'medium'`/`'low'` which do not exist in schema CHECK constraints

- **Fix:** Used `'duplicate'` (valid CHECK value) and mapped `medium -> minor`, `low -> info` (valid CHECK values)

- **Files modified:** `orchestrator.mjs`

- **Commit:** `0c5bb8f`

#### 2. [Rule 2 - Missing Critical Functionality] Ordered doc IDs required by constraint

- **Found during:** Task 2

- **Issue:** `content_similarities` has `CHECK (doc1_id < doc2_id)` — the similarity loop can produce pairs in either order depending on docIds array position

- **Fix:** Added `const [d1, d2] = docIds[i] < docIds[j] ? [...] : [...]` ordering before each insert

- **Files modified:** `orchestrator.mjs`

- **Commit:** `0c5bb8f`

#### 3. [Rule 2 - Missing Critical Functionality] NOT NULL columns required explicit values

- **Found during:** Task 2

- **Issue:** `detected_at NOT NULL` on both content_similarities and deviations; INSERT omitting them would fail

- **Fix:** Added `detected_at` parameter to all INSERT statements using `new Date().toISOString()`

- **Files modified:** `orchestrator.mjs`

- **Commit:** `0c5bb8f`

## User Setup Required

None.

## Next Phase Readiness

- Phase 3 is now complete — all four plans executed (orchestrator, scan modes, daemon wiring, intelligence features)

- Deep scan populates all intelligence tables: keywords, document_tags, content_similarities, deviations, statistics

- /stats endpoint surfaces stale_documents for dashboard visibility

- Phase 4 (MCP server) can query these tables to provide rich document intelligence to AI agents

---

### Phase: 03-orchestrator-scheduler-wiring

### Completed: 2026-03-16

## Self-Check: PASSED

- FOUND: `processors/keyword-processor.mjs` — document_tags writes present

- FOUND: `orchestrator.mjs` — detectSimilarities, detectStaleness, detectDeviations present

- FOUND: `daemon/server.mjs` — stale_documents in /stats present

- FOUND commit: `be44a9b` (Task 1)

- FOUND commit: `0c5bb8f` (Task 2)
