---
phase: 23-foundation-hygiene
plan: 02
subsystem: infra
tags: [env-config, dotenv, docker, secrets-hygiene, deepl, ftp, libreoffice]

# Dependency graph
requires: []
provides:
  - "Six presentation-pipeline env vars documented in .env.example with placeholder-only values"
  - "Named exports (DEEPL_API_KEY, FTP_HOST, FTP_USER, FTP_PASSWORD, FTP_REMOTE_PATH, SOFFICE_PATH) from config/env.mjs"
  - "CLAUDE.md env var table updated with all 6 pipeline vars"
  - "Confirmed Docker build context / defense-in-depth excludes .env (static checks)"
affects: [24-render-stage, 25-translate-stage, 28-deploy-stage]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Single source of truth for env vars in config/env.mjs; consumers import named constants instead of touching process.env directly"]

key-files:
  created:
    - .planning/phases/23-foundation-hygiene/deferred-items.md
  modified:
    - .env.example
    - config/env.mjs
    - CLAUDE.md

key-decisions:
  - "Wired config/env.mjs exports now (not deferred to Phase 24/25/28) per research Open Question 1 recommendation — keeps .env.example / env.mjs / CLAUDE.md in sync in one plan"
  - "Docker image-level secret verification (docker run / docker history checks) deferred — repo has no package-lock.json at all, so npm ci fails before the image can be built; this is pre-existing and unrelated to this plan's changes"

patterns-established:
  - "PRESENTATION PIPELINE banner section added to .env.example and config/env.mjs following the exact existing MCP TRANSPORT section style (banner + inline comments; secrets commented out with obvious placeholders; JSDoc + process.env.X ?? default)"

requirements-completed: [FOUND-02]

# Metrics
duration: 5min
completed: 2026-07-10
---

# Phase 23 Plan 02: Presentation Pipeline Env Var Scaffolding Summary

**Scaffolded all six presentation-pipeline env vars (DEEPL_API_KEY, FTP_HOST/USER/PASSWORD/REMOTE_PATH, SOFFICE_PATH) across .env.example, config/env.mjs, and CLAUDE.md with zero real secrets, and confirmed Docker secret-hygiene static checks pass.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-10T23:33:00+02:00 (approx)
- **Completed:** 2026-07-10T23:37:02+02:00
- **Tasks:** 3
- **Files modified:** 3 (.env.example, config/env.mjs, CLAUDE.md); 1 new (deferred-items.md)

## Accomplishments

- `.env.example` now has a `PRESENTATION PIPELINE` banner section documenting all 6 vars; secrets (`DEEPL_API_KEY`, `FTP_PASSWORD`) commented out with obviously-fake placeholders, non-secret operational values (`FTP_REMOTE_PATH`, `SOFFICE_PATH`) left uncommented with realistic defaults
- `config/env.mjs` exports all 6 vars as named constants (`DEEPL_API_KEY`, `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD`, `FTP_REMOTE_PATH`, `SOFFICE_PATH`) following the existing JSDoc + `process.env.X ?? default` convention — Phases 24/25/28 can import these directly without touching env plumbing
- `CLAUDE.md`'s Environment Configuration table has 6 new rows; file passes markdownlint
- Verified `.dockerignore` excludes `.env` and the Dockerfile's defense-in-depth `RUN rm -f ... .env` line is intact; logged (didn't fix) an unrelated pre-existing gap that blocks building the image at all

## Task Commits

Each task was committed atomically:

1. **Task 1: Add PRESENTATION PIPELINE section to .env.example and wire exports in config/env.mjs** - `41fea3e` (feat)
2. **Task 2: Update CLAUDE.md environment variable table** - `379cf44` (docs)
3. **Task 3: Verify Docker image bakes in no secrets** - `2ed9f60` (docs — verification + deferred-items log; no code change needed since static checks passed)

## Files Created/Modified

- `.env.example` - Added PRESENTATION PIPELINE section (6 vars, placeholders only)
- `config/env.mjs` - Added 6 named exports for pipeline vars
- `CLAUDE.md` - Added 6 rows to the env var table
- `.planning/phases/23-foundation-hygiene/deferred-items.md` - New file logging the pre-existing missing-lockfile Docker build gap (out of scope for this plan)

## Decisions Made

- Wired `config/env.mjs` now rather than deferring to consuming phases — the research's Open Question 1 recommendation was accepted as-is (small, conventioned addition; keeps three files in sync in one commit)
- Did not attempt to fix the missing `package-lock.json` / broken `npm ci` discovered during Task 3 — this is a pre-existing, unrelated repository gap (Rule 4 / scope-boundary territory), logged to `deferred-items.md` instead of auto-fixed

## Deviations from Plan

### Auto-fixed Issues

None — no Rule 1-3 auto-fixes were needed. The one notable finding (missing `package-lock.json` blocking Docker builds) was explicitly **not** auto-fixed because it's outside this plan's file scope and pre-existing; see "Issues Encountered" below and `deferred-items.md`.

---

**Total deviations:** 0 auto-fixed
**Impact on plan:** None — plan executed as written for Tasks 1 and 2. Task 3 executed as written (verify, don't rebuild) and correctly surfaced/deferred an unrelated pre-existing gap rather than expanding scope to fix it.

## Issues Encountered

- **Docker image build fails entirely** (`RUN npm ci` → `npm error code EUSAGE`) because no `package-lock.json` exists anywhere in the repository. This is pre-existing and has nothing to do with this plan's `.env.example` / `config/env.mjs` / `CLAUDE.md` changes. Static checks (the two things this plan's success criteria actually depend on) both passed:
  - `grep -x '.env' .dockerignore` → matched (`.env` excluded from Docker build context)
  - `grep 'rm -f' Dockerfile` → matched (defense-in-depth cleanup line intact)
  - Image-level checks (`docker run ... test -f .env`, `docker history | grep secret-patterns`) could not run because the image never builds. Logged to `.planning/phases/23-foundation-hygiene/deferred-items.md` with a recommendation to generate and commit a `package-lock.json` before any phase that depends on a working Docker image (Phase 28 deploy in particular).

## User Setup Required

None - no external service configuration required by this plan. (DeepL account, FTP credentials, and LibreOffice install remain open prereq gaps tracked in STATE.md, unaffected by this plan.)

## Next Phase Readiness

- Phases 24 (SOFFICE_PATH), 25 (DEEPL_API_KEY), and 28 (FTP_HOST/USER/PASSWORD/REMOTE_PATH) can import their required constants directly from `config/env.mjs` — no env plumbing work needed in those phases
- FOUND-02 requirement satisfied: all 6 vars documented with placeholders only, zero real secrets in the repo, and Docker build-context exclusion of `.env` verified
- Blocker/carry-forward: the missing `package-lock.json` should be resolved before Phase 28 (deploy) needs a working Docker image end-to-end; see `deferred-items.md`

---
*Phase: 23-foundation-hygiene*
*Completed: 2026-07-10*

## Self-Check: PASSED

All claimed files exist on disk (.env.example, config/env.mjs, CLAUDE.md, deferred-items.md, this SUMMARY.md) and all 3 task commits (41fea3e, 379cf44, 2ed9f60) are present in git history.
