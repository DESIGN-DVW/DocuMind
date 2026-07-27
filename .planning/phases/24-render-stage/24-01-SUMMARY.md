---
phase: 24-render-stage
plan: 01
subsystem: infra
tags: [marp-cli, puppeteer, libreoffice, execFile, cli, presentation-pipeline]

# Dependency graph
requires:
  - phase: 23-foundation-hygiene
    provides: "config/env.mjs presentation-pipeline env vars (SOFFICE_PATH, ROOT); slide_pipeline_runs ledger schema; gitignored slide export binaries"
provides:
  - "renderDeck() processor: single-call multi-format (HTML/PDF/PPTX) Marp deck rendering with structured return contract"
  - "npm run slides:build CLI: glob-discovers and renders all EN decks, or a single explicit deck"
  - "Resolved marp-cli invocation pattern (three per-format execFileAsync calls) documented in-source"
  - "SOFFICE_PATH pre-flight gating for editable vs standard PPTX, with non-silent warning fallback"
affects: [25-translate-stage, 26-ledger-integration, 27-watcher-integration, 28-deploy-stage]

# Tech tracking
tech-stack:
  added: ["@marp-team/marp-cli@4.4.1 (devDependency)"]
  patterns:
    - "execFileAsync('npx', ['marp', ...]) subprocess pattern (mirrors daemon/scheduler.mjs precedent), pinned --browser-path via puppeteer.executablePath()"
    - "Pre-flight fs.access(path, X_OK) capability gating before invoking an optional CLI flag, with explicit non-silent warning on the negative branch"
    - "Thin CLI wrapper around a processor module (mirrors scripts/fix-markdown.mjs convention) using fast-glob for input discovery"

key-files:
  created:
    - processors/slides-processor.mjs
    - scripts/publish-slides.mjs
  modified:
    - package.json

key-decisions:
  - "Three sequential execFileAsync calls (HTML, then PDF, then PPTX) is the confirmed and only multi-format pattern — spike showed --config-file with pdf:true/pptx:true booleans set CLI-flag defaults but do NOT fan a single call out into multiple output files"
  - "Added --no-stdin to all three marp invocations (deviation from the plan's reference implementation) — without it, marp-cli hangs indefinitely waiting on a non-TTY stdin stream when spawned via execFile, which would have caused production timeouts under PM2"
  - "LibreOffice is now actually installed on this dev machine at a non-default path (SOFFICE_PATH set in .env) — both RNDR-02 branches (editable and non-editable PPTX) were explicitly exercised via a SOFFICE_PATH env override test, since the real environment no longer naturally exercises the warn branch that Phase 23 research assumed was default"

patterns-established:
  - "Structured processor return contract { html, pdf, pptx, pptxEditable, warnings } — Phase 26 will wrap this with recordRun() into the slide_pipeline_runs ledger without changing the shape"
  - "CLI wrapper flags reserved ahead of need (--render-only accepted as a no-op now) so Phase 25/28 additions don't require renaming the entry point"

requirements-completed: [RNDR-01, RNDR-02]

# Metrics
duration: 10min
completed: 2026-07-11
---

# Phase 24 Plan 01: Render Stage Summary

**`renderDeck()` processor + `npm run slides:build` CLI render any EN Marp deck to HTML/PDF/PPTX via three pinned-browser-path `execFileAsync` calls, with SOFFICE_PATH-gated editable-PPTX and a non-silent warning fallback.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-11T14:33:00+02:00 (approx.)
- **Completed:** 2026-07-11T14:42:15+02:00
- **Tasks:** 3 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Installed `@marp-team/marp-cli` v4.4.1 as a devDependency; confirmed the already-resolved puppeteer v24.x bundled Chromium works with marp-cli's pinned `--browser-path` (no second Chromium download)
- Resolved the one-call-vs-three-call multi-format question via a live spike: a `--config-file` with `pdf: true`/`pptx: true` booleans only emitted `.html` in a single call — three separate per-format calls is the confirmed pattern, documented in the `processors/slides-processor.mjs` header
- Built `renderDeck(mdPath, { cwd })`, exporting a structured `{ html, pdf, pptx, pptxEditable, warnings }` contract, with `fs.access(SOFFICE_PATH, X_OK)` pre-flight gating `--pptx-editable`
- Built `scripts/publish-slides.mjs`, a thin CLI wrapper that glob-discovers all EN decks (`docs/slides/**/*.md`, excluding `*.fr.md`) via `fast-glob`, or renders a single explicit deck path; wired to `npm run slides:build`
- Verified both RNDR-02 branches end-to-end: with the machine's actual (now-resolvable) `SOFFICE_PATH`, `pptxEditable: true` and no warnings; with a forced-unresolvable `SOFFICE_PATH` override, `pptxEditable: false` plus an explicit console + `warnings[]` message — never a silent image-only fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Install marp-cli, run compatibility smoke test + multi-format spike** - `f6ede27` (chore)
2. **Task 2: Build renderDeck() in processors/slides-processor.mjs** - `af17553` (feat)
3. **Task 3: Build scripts/publish-slides.mjs CLI wrapper + wire npm run slides:build** - `2939c3f` (feat)

**No TDD tasks in this plan — all `type="auto"`.**

## Files Created/Modified

- `processors/slides-processor.mjs` - Exports `renderDeck()`; three `execFileAsync('npx', ['marp', ...])` calls (HTML/PDF/PPTX) with pinned `--browser-path`, SOFFICE_PATH pre-flight gating, and header-documented spike result
- `scripts/publish-slides.mjs` - CLI wrapper: glob-discovers EN decks or accepts an explicit deck path, calls `renderDeck()`, logs warnings, non-zero exit on failure
- `package.json` - Added `@marp-team/marp-cli` devDependency and `slides:build` script

## Decisions Made

- Three-call marp invocation pattern locked in (see key-decisions above) — durably documented in the `slides-processor.mjs` module header per roadmap success criterion 4, satisfying "documented before Phase 25"
- `--no-stdin` added to every marp invocation (not in the plan's reference snippet) to prevent an indefinite hang when marp-cli is spawned via `execFile` without a TTY stdin — see Deviations below
- Kept `--render-only` as an accepted no-op flag in the CLI wrapper, anticipating Phase 25 (`--translate`) and Phase 28 (`--deploy`) additions to the same entry point

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `--no-stdin` to all three marp-cli invocations**

- **Found during:** Task 2 (renderDeck() verification against the external fixture deck)
- **Issue:** Calling `renderDeck()` via `node -e` (no TTY) caused marp-cli to hang: `[INFO] Currently waiting data from stdin stream. Conversion will start after finished reading.` The process was eventually killed by the `RENDER_TIMEOUT_MS` timeout (SIGTERM), which is the worst-case behavior for a production daemon/PM2 context — a 120s (or 180s for PPTX) hang per deck instead of a fast, correct render. The plan's bash smoke tests didn't surface this because interactive shell stdin is a TTY; only non-TTY invocation (Node child_process, PM2, cron) triggers it.
- **Fix:** Added `--no-stdin` to all three `execFileAsync('npx', ['marp', ...])` calls in `processors/slides-processor.mjs`, matching marp-cli's own suggested remediation in its warning output.
- **Files modified:** `processors/slides-processor.mjs`
- **Verification:** Re-ran the Task 2 verification command (render external fixture deck via `node -e`) — completed immediately with all three outputs produced, no hang.
- **Committed in:** `af17553` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for correct operation in the actual (non-TTY) production invocation context this processor is built for (PM2 daemon, Phase 27 watcher). No scope creep — same three-call contract, same return shape.

## Issues Encountered

- Phase 23 research assumed LibreOffice was absent on this dev machine (SOFFICE_PATH default unresolvable), making the RNDR-02 warn branch the expected default-tested state. Between Phase 23 and this plan's execution, the user installed LibreOffice at a custom path and set a real `SOFFICE_PATH` in `.env` — so the natural default run now takes the *editable* branch (`pptxEditable: true`, no warnings). Both branches were still explicitly verified: the natural run exercises the editable path, and a temporary `SOFFICE_PATH=/nonexistent/soffice` env override exercised the warn/non-editable path, confirming RNDR-02's non-silent-fallback guarantee holds regardless of which branch is "default" on a given machine.
- A static-analysis (Aikido) diagnostic flagged `fs.access(sofficePath, ...)` in `sofficeResolvable()` as a "potential file inclusion attack via reading file." Reviewed and determined to be a false positive: `fs.access` performs a permission check only (no file content is read), and `sofficePath` originates from server-side config (`SOFFICE_PATH` env var), never from user/request input. This exact pre-flight pattern is explicitly required by the plan's `key_links` frontmatter and reference implementation, so no code change was made.

## User Setup Required

None - no external service configuration required. (LibreOffice/SOFFICE_PATH is already configured on this machine per Phase 23's `.env` setup; other machines without LibreOffice will correctly fall back to the non-editable PPTX + warning path with no additional setup needed.)

## Next Phase Readiness

- `renderDeck()`'s structured return contract (`{ html, pdf, pptx, pptxEditable, warnings }`) is stable and ready for Phase 26 to wrap with `recordRun()` into the `slide_pipeline_runs` ledger — no contract changes anticipated.
- `scripts/publish-slides.mjs`'s deck-discovery glob already excludes `*.fr.md`, so Phase 25 (translate stage) can add French decks without any changes to this script's selection logic.
- The `--render-only` flag placeholder means Phase 25/28 can add `--translate`/`--deploy` flags to the same CLI entry point without a rename.
- No blockers for Phase 24 Plan 02 or Phase 25.
- Work is on branch `feat/2026-07-11-render-stage-plan-01` (based on `master` @ `710bb80`) — open a PR to merge to main when ready.

---

*Phase: 24-render-stage*
*Completed: 2026-07-11*

## Self-Check: PASSED

- FOUND: `processors/slides-processor.mjs`
- FOUND: `scripts/publish-slides.mjs`
- FOUND: commit `f6ede27`
- FOUND: commit `af17553`
- FOUND: commit `2939c3f`
