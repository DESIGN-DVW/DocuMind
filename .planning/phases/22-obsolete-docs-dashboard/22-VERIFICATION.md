---
phase: 22-obsolete-docs-dashboard
verified: 2026-04-20T16:00:00Z
status: human_needed
score: 12/13 must-haves verified
re_verification: false
human_verification:
  - test: "Open http://localhost:9000/dashboard/obsolete.html in a browser and click the Delete button on a row"
    expected: "The row is immediately removed from the table with no confirmation dialog — confirm this is intentional and acceptable given OBS-03 requires 'no destructive action without confirmation'"
    why_human: "Delete permanently removes a DB row (destructive) but has no confirm() guard in the JS. Archive Selected has confirm(); per-row Archive does not. Cannot verify policy intent programmatically."
  - test: "Open http://localhost:9000/dashboard/obsolete.html and verify the table populates, filters work, and confidence bars render correctly"
    expected: "Table loads with flagged docs, repo/flag dropdowns filter without reload, column headers sort on click, confidence fill bars are colored red/amber/green/indigo by tier"
    why_human: "Visual rendering and interactive behavior cannot be verified programmatically"
---

# Phase 22: Obsolete Docs Dashboard Verification Report

**Phase Goal:** Obsolete document detection, REST API, and dashboard UI for reviewing and actioning flagged documents
**Verified:** 2026-04-20
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Migration 006 creates `obsolescence_signals` table with correct columns and constraints | VERIFIED | `scripts/db/migrations/006-obsolescence-signals.sql` — 26 lines, contains `CREATE TABLE IF NOT EXISTS obsolescence_signals`, `dismissed_until TEXT`, `FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE`, 4 indexes |
| 2 | `detectObsolescence(db, kuzuDb)` returns `{ scanned, flagged, cleared }` | VERIFIED | `processors/obsolescence-detector.mjs` line 188-192: returns `{ scanned: docs.length, flagged: toUpsert.length, cleared: deletedCount }` |
| 3 | Document with age>180d, zero inbound, keyword 'old-' in path scores ≥ 0.8 with flag 'obsolete' | VERIFIED | Scoring: `ageSignal*0.35 + linkSignal*0.35 + keywordSignal*0.30 = 0.35+0.35+0.30 = 1.0 >= 0.8 → 'obsolete'` — matches spec exactly |
| 4 | Document with max similarity ≥ 0.7 scores ≥ 0.7 with flag 'redundant' | VERIFIED | Lines 112-114: `else if (simSignal >= SIM_THRESHOLD) { confidence = simSignal; label = 'redundant'; }` |
| 5 | Re-running detection does NOT overwrite `dismissed_until` | VERIFIED | ON CONFLICT SET clause (lines 145-152) omits `dismissed_until` — confirmed with `grep -A 20 "ON CONFLICT"` returning no `dismissed_until` match |
| 6 | `GET /obsolete` returns `{ total, count, offset, rows }` with all required fields | VERIFIED | `daemon/server.mjs` line 474 — endpoint exists, includes `path, repository, filename, confidence_score, flag_label, age_days, dismissed_until` in SELECT, returns correct shape |
| 7 | `GET /obsolete?flag=obsolete` returns only matching rows | VERIFIED | Lines 498-501: `if (flag) { conditions.push('obs.flag_label = ?'); params.push(flag); }` |
| 8 | `GET /obsolete?include_dismissed=true` includes dismissed rows | VERIFIED | Lines 490-492: dismissed_until filter only applied when `include_dismissed !== 'true'` |
| 9 | `POST /obsolete/:id/dismiss` sets 30-day expiry and returns `{ status: 'dismissed', id, dismissed_until }` | VERIFIED | Lines 566-586 — computes `Date.now() + 30 days`, returns correct shape |
| 10 | `POST /obsolete/batch-dismiss` dismisses multiple rows in a single transaction | VERIFIED | Lines 534-563 — uses `db.transaction()` over id list; batch-dismiss registered at line 534, before `:id/dismiss` at line 566 (correct order) |
| 11 | Both endpoints return empty result (not 500) if table doesn't exist | VERIFIED | `GET /obsolete` line 482: `if (!hasTable.count) return res.json({ total: 0, count: 0, offset: 0, rows: [] })` |
| 12 | `detectObsolescence` called non-fatally in CRON_DAILY after scan | VERIFIED | `daemon/scheduler.mjs` line 13: import; line 115: call inside `try { ... } catch (detErr)` block — 2 occurrences confirmed |
| 13 | Per-row Delete has no confirmation dialog (potential OBS-03 deviation) | NEEDS HUMAN | `dashboard/obsolete.html` line 499-508: `btn-delete-row` handler calls `DELETE /obsolete/:id` immediately without `confirm()`. OBS-03 requires "no destructive action without confirmation". Archive Selected has confirm; per-row Archive does not; per-row Delete does not. |

**Score:** 12/13 truths verified (1 needs human review)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `scripts/db/migrations/006-obsolescence-signals.sql` | DDL for obsolescence_signals with UNIQUE(document_id), FK CASCADE, dismissed_until | VERIFIED | 26 lines — all required elements present |
| `scripts/db/migrations/007-obsolescence-archive.sql` | Adds archived_at column (enhancement added in Plan 03) | VERIFIED | 2 lines — `ALTER TABLE obsolescence_signals ADD COLUMN archived_at TEXT` + index |
| `processors/obsolescence-detector.mjs` | Exports `detectObsolescence(db, kuzuDb)` with scoring + upsert | VERIFIED | 193 lines — named export confirmed, scoring algorithm exact match to spec, ON CONFLICT correct |
| `daemon/server.mjs` | GET /obsolete + POST dismiss/archive/batch-dismiss/batch-archive/DELETE endpoints | VERIFIED | 6 route registrations at lines 474, 534, 566, 589, 621, 644 — all exist and are substantive |
| `daemon/scheduler.mjs` | detectObsolescence imported and called in CRON_DAILY | VERIFIED | Import at line 13, call at line 115, wrapped in non-fatal try/catch |
| `dashboard/obsolete.html` | Self-contained HTML dashboard ≥ 200 lines | VERIFIED | 535 lines — self-contained, no external CDN, no inline handlers |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `processors/obsolescence-detector.mjs` | `content_similarities` | `MAX(similarity_score) UNION query` | VERIFIED | Lines 42-51: full UNION ALL query with GROUP BY |
| `processors/obsolescence-detector.mjs` | Kuzu graph | `conn.query()` on `kuzu.Connection` | VERIFIED | Lines 57-78: single connection, `MATCH (src:Document)-[r]->(tgt:Document) RETURN tgt.id, count(r)` |
| `processors/obsolescence-detector.mjs` | `obsolescence_signals` | `ON CONFLICT(document_id) DO UPDATE` with dismissed_until excluded | VERIFIED | Lines 140-153: upsert present, `dismissed_until` absent from SET clause |
| `daemon/server.mjs GET /obsolete` | `obsolescence_signals JOIN documents` | `db.prepare().all()` | VERIFIED | Lines 504-516: JOIN query with dynamic WHERE construction |
| `daemon/scheduler.mjs CRON_DAILY` | `processors/obsolescence-detector.mjs` | import + non-fatal try/catch after runScan | VERIFIED | Import line 13, call line 115 |
| `dashboard/obsolete.html` | `/obsolete` | `fetch('/obsolete?limit=500')` on DOMContentLoaded | VERIFIED | Line 423: `var res = await fetch('/obsolete?limit=500')` |
| `dashboard/obsolete.html` | `/obsolete/:id/archive` | fetch POST on Archive button via addEventListener | VERIFIED | Line 490: `fetch('/obsolete/' + id + '/archive', { method: 'POST' })` |
| `dashboard/obsolete.html` | `/obsolete/batch-archive` | fetch POST on Archive Selected click via addEventListener | VERIFIED | Line 517: `fetch('/obsolete/batch-archive', { method: 'POST', ... JSON.stringify({ ids }) })` |
| `daemon/server.mjs` | `dashboard/obsolete.html` static file | `express.static` middleware at `/dashboard` | VERIFIED | Line 166: `app.use('/dashboard', express.static(path.join(ROOT, 'dashboard')))` — covers all files in `dashboard/` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| OBS-01 | 22-01, 22-02 | `obsolescence_signals` table with 4-signal scores, updated by daily cron | SATISFIED | Table exists (006 migration), detectObsolescence wired into CRON_DAILY in scheduler.mjs |
| OBS-02 | 22-03 | `/dashboard/obsolete.html` — sortable, filterable table with confidence, flag, age, repo, path | SATISFIED | 535-line self-contained HTML with sortable `th[data-sort]` headers, filter-repo/filter-flag selects, all columns present |
| OBS-03 | 22-03 | Batch-select checkboxes + Archive Selected / Dismiss action buttons; no destructive action without confirmation | PARTIAL | Checkboxes (select-all + row-check), "Archive Selected" with `confirm()` dialog, per-row Archive + Delete. However: per-row Delete is destructive (permanent DB removal) and has no `confirm()` guard. "Dismiss" was upgraded to permanent Archive — OBS-03 text mentions "dismiss suppresses 30 days" but the requirement is marked `[x]` complete in REQUIREMENTS.md |
| OBS-04 | 22-02 | `GET /obsolete` paginated signal rows; `POST /obsolete/:id/dismiss` with expiry | SATISFIED | `GET /obsolete` at line 474, `POST /obsolete/:id/dismiss` at line 566 — both exist and are substantive |
| OBS-05 | 22-01 | Age>180d + zero inbound + keyword → confidence≥0.8 (obsolete); similarity≥0.7 → confidence≥0.7 (redundant) | SATISFIED | Scoring algorithm exact match: `0.35+0.35+0.30=1.0>=0.8` for obsolete; `simSignal >= 0.7 → label = 'redundant'` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `dashboard/obsolete.html` | 499-508 | Per-row Delete calls `DELETE /obsolete/:id` immediately without `confirm()` | Warning | Destructive action (permanent DB row removal) lacks confirmation guard. Inconsistent with batch Archive Selected which uses `confirm()`. OBS-03 requires "no destructive action without confirmation". |
| `daemon/server.mjs` | 533 | Comment `/ Batch dismiss` missing `//` (single slash) | Info | Cosmetic — parsed as a division expression, has no runtime effect but is misleading |
| `daemon/server.mjs` | 476 | Comment `/ Guard:` missing `//` | Info | Same cosmetic issue |

### Human Verification Required

#### 1. Per-row Delete confirmation gap (OBS-03)

**Test:** Open `http://localhost:9000/dashboard/obsolete.html`. Click the "Delete" button on any row.
**Expected per OBS-03:** A confirmation dialog should appear before the destructive action executes.
**Actual behavior:** The Delete button immediately fires `DELETE /obsolete/:id` with no confirm dialog — the row disappears instantly.
**Why human:** This is a policy decision — was the omission of confirm() on per-row Delete intentional (the human reviewer approved the dashboard during Task 2), or does it need a confirm() guard to satisfy OBS-03? Cannot determine intent programmatically.

#### 2. Dashboard visual rendering and interaction

**Test:** Open `http://localhost:9000/dashboard/obsolete.html` with the daemon running.
**Expected:** Table populates with flagged documents. Confidence bars are red (≥0.8), amber (≥0.7), green (≥0.5), indigo (otherwise). Flag badges color-coded. Repo and flag dropdowns filter without page reload. Column headers sort on click. Select-all checkbox checks all visible rows.
**Why human:** Visual rendering and client-side interactivity cannot be verified by file inspection alone.

### Gaps Summary

No blocking gaps found. All artifacts exist, are substantive, and are correctly wired. All five requirement IDs (OBS-01 through OBS-05) have supporting implementation.

One item requires human review: the per-row Delete button performs a destructive DB operation (permanent row removal) without a `confirm()` dialog, while the batch Archive Selected does show a confirm. OBS-03 states "no destructive action without confirmation." Whether this is intentional (human reviewer approved the plan-03 output) or an oversight is a policy call for the user.

Plan 03 also deviated from the original plan spec by upgrading "dismiss" (30-day snooze) to "archive" (permanent suppression) — a human-approved enhancement. The original `POST /obsolete/:id/dismiss` endpoint was preserved alongside the new archive endpoints, so OBS-04 remains satisfied.

---

_Verified: 2026-04-20_
_Verifier: Claude (gsd-verifier)_
