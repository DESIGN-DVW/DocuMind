---

gsd_state_version: 1.0
milestone: v3.4
milestone_name: Presentation Pipeline
current_phase: null
current_plan: null
status: defining-requirements
last_updated: "2026-07-10"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0

---

# Session State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-10)

**Core value:** When you look at a document, you instantly see what it's connected to — the relationship graph is the intelligence layer.
**Current focus:** v3.4 Presentation Pipeline — automated slides publishing (translate → render → deploy → Figma Slides), daemon-orchestrated.

## Current Position

**Milestone:** v3.4 Presentation Pipeline
**Phase:** Not started (defining requirements)
**Plan:** —
**Status:** Defining requirements
**Last activity:** 2026-07-10 — Milestone v3.4 started; v3.3 quick-archived to MILESTONES.md

## Accumulated Context

### Decisions

- v3.4: EN Marp .md decks in docs/slides/ are the ONLY hand-edited slide artifact — FR translation, HTML/PDF/PPTX exports, hosted copies, and Figma Slides are all generated, never edited

- v3.4: Rendered slide exports get gitignored — stale May-23 binaries removed from git, rebuild on demand

- v3.4: DeepL API for French translation (always required); glossary support for consistent FR terminology

- v3.4: FTP deploy ships dry-run only until user adds credentials to .env

- v3.4: Figma Slides push is the final presentation document — blocked on Figma MCP auth, planned as runbook/agent task

- v3.3 → carried: Kuzu retired per ADR-001; SQLite recursive CTEs handle graph traversal; Graphify handles visualization

### Prereq gaps (user-side)

- DEEPL_API_KEY not set anywhere (no .env in DocuMind yet)

- FTP host/user/pass/path unknown

- Figma MCP unauthorized (needs interactive OAuth session)

- LibreOffice `soffice` not on PATH (needed for --pptx-editable; resolve /Applications/LibreOffice.app/Contents/MacOS/soffice)

### Test fixtures

- Two existing decks serve as E2E test cases: docs/slides/internal/2026-05-21-figma-ai-internal-deck.md and docs/slides/external/2026-05-21-figma-ai-pitch-deck.md (both Buzz-cleaned 2026-07-10)

## Session Log

- 2026-07-10: Buzz references + retired-study ROI claims removed from both decks (external + internal)

- 2026-07-10: v3.3 quick-archived; v3.4 Presentation Pipeline milestone started
