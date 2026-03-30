---

phase: 11-foundation
verified: 2026-03-23T00:00:00Z
status: gaps_found
score: 3/4 success criteria verified
re_verification: false
gaps:

  - truth: "Running grep -r '/Users/Shared' daemon/ processors/ config/constants.mjs returns no results in production code paths"

    status: partial
    reason: "The roadmap success criterion 1 includes config/constants.mjs in the grep scope, and that file does contain one hardcoded macOS path (the intentional fallback). The plan design explicitly permits exactly one fallback in constants.mjs, but the criterion text is contradictory — it says the grep 'returns no results' while listing constants.mjs as a target. Needs clarification or criterion amendment."
    artifacts:

      - path: "config/constants.mjs"

        issue: "Contains 'REPOS_DIR ?? '/Users/Shared/htdocs/github/DVWDesign'' — this is the intended single fallback, but the roadmap criterion literally says zero results from a grep that includes this file"
    missing:

      - "Update ROADMAP.md success criterion 1 to exclude config/constants.mjs from the grep scope, or reword to 'returns no results except the single intentional fallback in config/constants.mjs'"

  - truth: "REQUIREMENTS.md status tracking reflects implemented state"

    status: failed
    reason: "FNDTN-02 is marked '[ ] Pending' in REQUIREMENTS.md but the implementation exists and is fully wired: context/loader.mjs discoverRepos() is implemented and REPOS_DIR/REPOS_LIST logic is present in buildCtx(). The plan 11-02 claimed FNDTN-02. This is a stale status tracking issue."
    artifacts:

      - path: ".planning/REQUIREMENTS.md"

        issue: "FNDTN-02 row shows '[ ] Pending' and status table shows 'Pending' — contradicts actual implementation"
    missing:

      - "Mark FNDTN-02 as complete in REQUIREMENTS.md (both the checkbox and the status table)"

---

# Phase 11: Foundation Verification Report

**Phase Goal:** Codebase is free of hardcoded macOS paths and all runtime behavior is configurable via environment variables
**Verified:** 2026-03-23
**Status:** gaps_found (2 minor gaps — no implementation gaps, only documentation/criterion ambiguity)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from Roadmap Success Criteria)

| # | Truth | Status | Evidence |

| --- | --- | --- | --- |

| 1 | `grep -r '/Users/Shared' daemon/ processors/ config/constants.mjs` returns no results in production code paths | PARTIAL | grep returns exactly 1 result — the intentional fallback in constants.mjs. Plan 11-02's own verification steps expected exactly 1 result in constants.mjs and 0 in daemon/ + processors/. Criterion text contradicts design intent. |

| 2 | Starting daemon with `DOCUMIND_REPOS_DIR=/some/path` causes all repo scans to resolve against that path | VERIFIED | context/loader.mjs discoverRepos() wired to REPOS_DIR; tree-processor.mjs uses REPOS_DIR; daemon/server.mjs uses REPOS_DIR in fallback chain |

| 3 | PORT, DB path, and cron schedules can each be changed via env var without touching source files | VERIFIED | config/env.mjs exports PORT, DB_PATH, CRON_* with env var overrides; daemon/server.mjs, daemon/mcp-server.mjs, daemon/scheduler.mjs all import from config/env.mjs |

| 4 | A `.env` file with documented defaults exists and the daemon loads it at startup | VERIFIED | .env.example exists with all 10 DOCUMIND_* vars documented; config/env.mjs calls process.loadEnvFile() in try/catch at startup |

**Score:** 3/4 (one criterion has ambiguous phrasing; implementation goal is fully achieved)

---

## Required Artifacts

| Artifact | Expected | Status | Details |

| --- | --- | --- | --- |

| `config/env.mjs` | Centralized env loading, 11 named exports | VERIFIED | Exports ROOT, PORT, DB_PATH, PROFILE_PATH, REPOS_DIR, REPOS_LIST, CRON_HEARTBEAT, CRON_HOURLY, CRON_DAILY, CRON_WEEKLY, CRON_RELINK — all present and substantive |

| `.env.example` | Documents all configurable values | VERIFIED | All 10 DOCUMIND_* vars documented with defaults, Docker usage note, cron vars commented out |

| `config/constants.mjs` | LOCAL_BASE_PATH derived from REPOS_DIR env var | VERIFIED | Line 10: `import { REPOS_DIR } from './env.mjs'`; line 45: `export const LOCAL_BASE_PATH = REPOS_DIR ?? '/Users/Shared/htdocs/github/DVWDesign'` |

| `.gitignore` | .env entry present | VERIFIED | Line 40: `.env` — confirmed present |

| `daemon/server.mjs` | Express API using centralized config | VERIFIED | Imports ROOT, PORT, DB_PATH, REPOS_DIR from config/env.mjs; imports LOCAL_BASE_PATH from constants.mjs for fallback |

| `daemon/scheduler.mjs` | Cron scheduler with configurable expressions | VERIFIED | All 5 CRON_* constants imported from config/env.mjs; cron.schedule() calls use variables; log lines also use variables |

| `daemon/mcp-server.mjs` | DB_PATH and ROOT from config/env.mjs | VERIFIED | Imports ROOT, DB_PATH, PROFILE_PATH from config/env.mjs |

| `processors/tree-processor.mjs` | REPOS_ROOT derived from env.mjs | VERIFIED | Imports REPOS_DIR from config/env.mjs and LOCAL_BASE_PATH from constants.mjs; `const REPOS_ROOT = REPOS_DIR \|\| LOCAL_BASE_PATH` |

| `context/loader.mjs` | discoverRepos() + REPOS_DIR/REPOS_LIST auto-discovery | VERIFIED | discoverRepos() scans for .git dirs; buildCtx() prioritizes REPOS_DIR, filters by REPOS_LIST when set |

| `scripts/scan-all-repos.mjs` | LOCAL_BASE_PATH from constants | VERIFIED | Imports LOCAL_BASE_PATH from ../config/constants.mjs |

| `scripts/scan/enhanced-scanner.mjs` | LOCAL_BASE_PATH + repo names | VERIFIED | Imports LOCAL_BASE_PATH from ../../config/constants.mjs |

| `scripts/fix-markdown.mjs` | LOCAL_BASE_PATH from constants | VERIFIED | Present in file (confirmed grep hit) |

| `scripts/fix-custom-errors.mjs` | LOCAL_BASE_PATH from constants | VERIFIED | constants present in file |

| `scripts/watch-and-index.mjs` | LOCAL_BASE_PATH from constants | VERIFIED | constants present in file |

| `scripts/propagate-lint-rules.mjs` | LOCAL_BASE_PATH from constants | VERIFIED | constants present in file |

| `scripts/propagate-org-fixes.mjs` | LOCAL_BASE_PATH from constants | VERIFIED | constants present in file |

| `scripts/fix-github-org-references.mjs` | LOCAL_BASE_PATH from constants | VERIFIED | constants present in file |

| `CLAUDE.md` | Documents env var configuration system | VERIFIED | "Environment Configuration" section at line 106 with DOCUMIND_REPOS_DIR table and note on absolute path line 30 |

---

## Key Link Verification

| From | To | Via | Status | Details |

| --- | --- | --- | --- | --- |

| `config/constants.mjs` | `config/env.mjs` | `import { REPOS_DIR } from './env.mjs'` | WIRED | Line 10 confirmed |

| `daemon/server.mjs` | `config/env.mjs` | `import { ROOT, PORT, DB_PATH, REPOS_DIR }` | WIRED | Line 27 confirmed |

| `daemon/scheduler.mjs` | `config/env.mjs` | `import { CRON_HEARTBEAT, ... }` | WIRED | Lines 10-16 confirmed; all 5 cron expressions use constants |

| `daemon/mcp-server.mjs` | `config/env.mjs` | `import { ROOT, DB_PATH, PROFILE_PATH }` | WIRED | Line 26 confirmed |

| `processors/tree-processor.mjs` | `config/env.mjs` | `import { REPOS_DIR }` | WIRED | Line 11 confirmed; REPOS_ROOT resolved from it |

| `context/loader.mjs` | `config/env.mjs` | `import { REPOS_DIR, REPOS_LIST }` | WIRED | Line 19 confirmed; discoverRepos() called in buildCtx() when REPOS_DIR is set |

| `scripts/scan-all-repos.mjs` | `config/constants.mjs` | `import { LOCAL_BASE_PATH }` | WIRED | Grep confirmed |

| `scripts/scan/enhanced-scanner.mjs` | `config/constants.mjs` | `import { LOCAL_BASE_PATH }` | WIRED | Grep confirmed |

| `config/env.mjs` | `config/constants.mjs` | (must NOT import) | VERIFIED CLEAN | No import from constants.mjs in env.mjs — circular dependency pitfall avoided |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |

| --- | --- | --- | --- | --- |

| FNDTN-01 | 11-01, 11-02, 11-03 | All hardcoded macOS paths replaced with configurable env vars | SATISFIED | Zero hardcoded `/Users/Shared` strings in daemon/, processors/, scripts/; single intended fallback in config/constants.mjs |

| FNDTN-02 | 11-02 | Repository paths resolved from DOCUMIND_REPOS_DIR env var | SATISFIED (stale REQUIREMENTS.md) | context/loader.mjs discoverRepos() + REPOS_DIR wiring is fully implemented; REQUIREMENTS.md incorrectly shows "Pending" |

| FNDTN-03 | 11-01, 11-02 | Port, DB path, and cron schedules configurable via env vars | SATISFIED | config/env.mjs exports PORT, DB_PATH, all 5 CRON_* constants; all daemons consume them |

| FNDTN-04 | 11-01 | .env file with documented defaults for local development | SATISFIED | .env.example present with all 10 DOCUMIND_* vars, .env gitignored |

### Orphaned Requirements Check

No additional FNDTN-* requirements mapped to Phase 11 in REQUIREMENTS.md beyond the four declared in plans.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |

| --- | --- | --- | --- | --- |

| `context/utils.mjs` | 17-19 | `/Users/Shared` paths in JSDoc example comments | Info | JSDoc only — not runtime code. Not a portability issue. |

| `.env.example` | 38 | `DOCUMIND_REPOS_DIR=/Users/Shared/htdocs/github/DVWDesign` | Info | Expected — this is the macOS default example for the example file. Docker note is also present. |

| `processors/tree-processor.mjs` | 169 | `return null` | Info | Legitimate early-exit guard when no folder_nodes rows exist in DB — not a stub. |

No blockers or warnings found.

---

## Human Verification Required

### 1. REPOS_DIR End-to-End Path Resolution

**Test:** Start the daemon with `DOCUMIND_REPOS_DIR=/tmp/test-repos` (with at least one subdirectory containing a `.git` folder). Call `GET /tree/:repo` and verify it resolves paths under `/tmp/test-repos/`.
**Expected:** All repo paths in the response are under `/tmp/test-repos/`, not `/Users/Shared/htdocs/github/DVWDesign/`
**Why human:** Cannot verify runtime path resolution via static analysis alone

### 2. Zero-Setup Daemon Start

**Test:** Remove or rename `.env` and start `npm run daemon:dev`
**Expected:** Daemon starts, `/health` returns 200, port defaults to 9000, no errors about missing configuration
**Why human:** Process startup behavior cannot be verified via grep

---

## Gaps Summary

Two gaps were found, neither of which represents an implementation failure:

**Gap 1 — Criterion text vs design intent conflict:** Roadmap success criterion 1 includes `config/constants.mjs` in the grep target but says "returns no results." The design intent (documented in CONTEXT.md, plan 11-01 verification steps, and the SUMMARY) is that exactly one macOS fallback is permitted in `constants.mjs`. The implementation correctly achieves that intent. The criterion text needs to be corrected to match the design.

**Gap 2 — FNDTN-02 stale tracking status:** `REQUIREMENTS.md` shows FNDTN-02 as "Pending" but the implementation is complete and wired. Plan 11-02 claimed FNDTN-02, and `context/loader.mjs` contains a fully implemented `discoverRepos()` function wired to `REPOS_DIR` and `REPOS_LIST`. The requirements tracking document was not updated after plan execution.

Neither gap requires code changes. Both require documentation corrections.

---

### Verified: 2026-03-23

### Verifier: Claude (gsd-verifier)
