# Retrospective

## Milestone: v3.0 — Documentation Intelligence Platform

**Shipped:** 2026-03-22
**Phases:** 5 | **Plans:** 14 | **Timeline:** 6 days (2026-03-16 → 2026-03-22)

### What Was Built

- Safe schema migration system protecting 8K live documents (versioned SQL, backup, FTS5 rebuild)
- Portable context profile loader — swap a JSON file to change DocuMind's behavior for any environment
- Orchestrator consolidating all processors + cron scheduler (hourly/daily/weekly scans)
- MCP stdio server with 11 tools (6 read + 5 write) callable from any DVWDesign repo
- Diagram registry centralized — DB as single source of truth, per-repo files deprecated
- DocuMind MCP registered in all 16 DVWDesign repos

### What Worked

- **Hard dependency chain was correct**: schema → profiles → orchestrator → MCP read → MCP write. No phase needed to backtrack.
- **Small, focused plans**: Average 2 tasks per plan. Fast execution (~3-5 min per plan). Total execution under 1 hour.
- **Reuse over rewrite**: Phase 5 write tools wrapped existing functions (relinkDiagram, runScan, indexMarkdown) — zero new business logic, just MCP plumbing.
- **GSD workflow**: discuss → plan → verify → execute pipeline caught real issues (fixTableSeparators bug, MD060A cycling) before they became blockers.

### What Was Inefficient

- **Phase 4 missing VERIFICATION.md**: Skipped during the session, never backfilled. Tools worked (verified via Inspector) but the documentation gap persisted.
- **Table formatting bug cascade**: The fixTableSeparators bug inserted separator rows between every data row, requiring 3 passes to clean up. Root cause: testing the fixer on real data for the first time during the session.
- **Duplicate separator cleanup**: Three rounds of fix-custom-errors.mjs needed because the cleanup function only caught consecutive duplicates, not interleaved ones.

### Patterns Established

- **Custom markdownlint rules with fixInfo**: DVW001 (table-separator-spacing.cjs) proved the pattern — auto-fixable via --fix, format-on-save, and lint-staged.
- **CJS wrapper for ESM packages**: `force-align-table-columns.cjs` wrapping the ESM default export. Reusable for any markdownlint rule that exports ESM.
- **MCP write tools as thin wrappers**: Import existing processor functions, add path validation + structured JSON response. Don't reimplement.
- **Context profile as portability layer**: Every hardcoded value moved to JSON config. Swappable per deployment.

### Key Lessons

- **Test fix scripts on real data early**: The fixTableSeparators bug existed since the script was written but never manifested until run against 1133 files.
- **Idempotency matters for fix scripts**: fixTableAlignment cycled infinitely because it reconstructed lines differently each run. Replaced by MD060A which is provably idempotent.
- **Per-repo files fragment data**: DIAGRAM-REGISTRY.md in each repo diverged from the DB. Centralizing to DB + single snapshot eliminated the sync problem entirely.

### Cost Observations

- Model mix: ~70% sonnet (researchers, checkers, executors), ~30% opus (orchestrator, discuss-phase)
- Sessions: 2 major sessions (v3.0 phases 1-4 on 2026-03-17, phase 5 + milestone on 2026-03-22)
- Notable: Phase 5 (discuss + plan + execute + verify) completed in a single session including the markdown tooling work that preceded it

---

## Cross-Milestone Trends

| Metric          | v3.0                      |
| --------------- | ------------------------- |
| Phases          | 5                         |
| Plans           | 14                        |
| Timeline        | 6 days                    |
| Avg plan time   | ~4 min                    |
| Requirements    | 36/36 satisfied           |
| Tech debt items | 6 (non-blocking)          |
| Verification    | 4/5 phases have VERIF.md  |
