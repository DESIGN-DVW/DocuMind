---
gsd_state_version: 1.0
milestone: v3.4
milestone_name: Presentation Pipeline
current_phase: 23
current_plan: 02
status: executing
last_updated: "2026-07-10"
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 3
  completed_plans: 2
---

# Session State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-10)

**Core value:** When you look at a document, you instantly see what it's connected to — the relationship graph is the intelligence layer.
**Current focus:** v3.4 Presentation Pipeline — automated slides publishing (translate → render → deploy → Figma Slides), daemon-orchestrated. Roadmap approved with 7 phases (23-29); ready to plan Phase 23.

## Current Position

**Milestone:** v3.4 Presentation Pipeline
**Phase:** 23 - Foundation & Hygiene (in progress)
**Plan:** 02 and 03 complete — 01 remaining
**Status:** Executing — plans 02, 03 done, waiting on 01
**Last activity:** 2026-07-10 — Plan 23-02 complete: presentation-pipeline env vars scaffolded (.env.example, config/env.mjs, CLAUDE.md); FOUND-02 satisfied

## Accumulated Context

### Decisions

- v3.4: EN Marp .md decks in docs/slides/ are the ONLY hand-edited slide artifact — FR translation, HTML/PDF/PPTX exports, hosted copies, and Figma Slides are all generated, never edited

- v3.4: Rendered slide exports get gitignored — stale May-23 binaries removed from git, rebuild on demand

- v3.4: DeepL API for French translation (always required); glossary support for consistent FR terminology

- v3.4: FTP deploy ships dry-run only until user adds credentials to .env

- v3.4: Figma Slides push is the final presentation document — blocked on Figma MCP auth, planned as runbook/agent task

- v3.4: Render-before-translate phase order (Phase 24 before 25) — render tooling surfaces the full set of Marp directive/front-matter syntax that translation's placeholder-protection scheme must handle

- v3.4: Watcher integration deliberately sequenced fifth (Phase 27), after render/translate/ledger are independently proven, so loop bugs can't masquerade as translation/render bugs

- v3.4: Loop protection is glob exclusion (primary) + dedicated per-deck run-lock (overlap) + content-hash (defense-in-depth) — NOT the existing `writingNow` registry lock, which is sized for fast single-file writes, not multi-second pipeline runs (research-reconciled, do not re-litigate in phase planning)

- v3.4: AgentHub notification and MCP tool triggers are REST/tool-call surfaces only — MCP tools are structurally uncallable from the headless daemon process itself

- v3.3 → carried: Kuzu retired per ADR-001; SQLite recursive CTEs handle graph traversal; Graphify handles visualization

- Phase 23 Plan 03: `slide_pipeline_runs` ledger uses `trigger_source` (not `trigger`, a SQLite reserved keyword) and per-stage translate/render/deploy status/duration/error columns so Phases 24/25/28 need no follow-up migration
- [Phase 23]: v3.4: config/env.mjs wired for all 6 presentation-pipeline vars now (not deferred) so Phases 24/25/28 never touch env plumbing
- [Phase 23]: v3.4: Docker image build blocked by pre-existing missing package-lock.json (unrelated to this plan) — logged to deferred-items.md, must resolve before Phase 28 deploy needs a working image

### Prereq gaps (user-side)

- DEEPL_API_KEY not set anywhere (no .env in DocuMind yet)

- FTP host/user/pass/path unknown; FTP vs FTPS vs SFTP protocol unconfirmed with hosting provider (Phase 28 blocker for going live)

- Figma MCP unauthorized (needs interactive OAuth session) — Phase 29 Figma runbook stays LOW confidence/manual until resolved

- LibreOffice `soffice` not on PATH (needed for --pptx-editable; resolve /Applications/LibreOffice.app/Contents/MacOS/soffice)

### Test fixtures

- Two existing decks serve as E2E test cases: docs/slides/internal/2026-05-21-figma-ai-internal-deck.md and docs/slides/external/2026-05-21-figma-ai-pitch-deck.md (both Buzz-cleaned 2026-07-10)

### Research flags carried into phase planning

- Phase 24 (Render Stage): MEDIUM confidence — spike needed on marp-cli single-call vs. three-call multi-format invocation before locking the render pattern

- Phase 28 (Deploy Stage): FTP/FTPS/SFTP protocol is an external unknown — confirm with hosting provider before flipping dry-run off

- Phase 29 (Ecosystem Surface & Notification): LOW confidence on the `figma-use-slides` skill's input contract — stays a documented runbook until Figma MCP auth unblocks

## Session Log

- 2026-07-10: Phase 23 Plan 02 executed — presentation-pipeline env vars scaffolded across .env.example, config/env.mjs, CLAUDE.md (placeholders only, zero real secrets); Docker secret-hygiene static checks passed; unrelated missing package-lock.json build gap logged to deferred-items.md; FOUND-02 marked complete

- 2026-07-10: Phase 23 Plan 03 executed — migration 009 adds `slide_pipeline_runs` table + `latest_slide_runs` view, applied via `npm run db:migrate`, verified via sqlite3 CLI; FOUND-03 marked complete

- 2026-07-10: Buzz references + retired-study ROI claims removed from both decks (external + internal)

- 2026-07-10: v3.3 quick-archived; v3.4 Presentation Pipeline milestone started

- 2026-07-10: Roadmap created — 7 phases (23-29) derived from research build order; ROADMAP.md, REQUIREMENTS.md traceability, and STATE.md updated; v3.3 milestone marked shipped 2026-04-20 with phases 19-21 cancelled
