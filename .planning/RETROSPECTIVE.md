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

## Milestone: v3.1 — Polish & Propagation

**Shipped:** 2026-03-23
**Phases:** 5 | **Plans:** 7 | **Timeline:** 1 day (2026-03-22 → 2026-03-23)

### What Was Built

- `get_similarities` and `get_deviations` MCP read tools surfacing intelligence data (Tools 7-8)
- `register_diagram` MCP tool with auto-type detection from .mmd content (Tool 14)
- `generateDiagramSnapshot` extracted to orchestrator for shared use by MCP server + scheduler
- DIAGRAM-REGISTRY.md auto-regenerated during daily/weekly scheduled scans
- Slash commands `/diagram-registry`, `/figma-diagram`, `/figma-curate` rewritten to use MCP tools
- DVW001 + MD060A custom lint rules propagated to all 16 DVWDesign repos
- Phase 4 VERIFICATION.md backfilled; MCPW-05 naming corrected in archived files

### What Worked

- **Tight scope per phase**: Average 1.4 plans per phase, 2 tasks per plan. Every phase completed in a single executor session.
- **Parallel execution where possible**: Phases 8 and 10 ran 2 plans in parallel (Wave 1) with no conflicts. Clean separation by file ownership.
- **Integration checker caught real bugs**: The milestone audit's cross-phase integration checker found 3 parameter name mismatches that individual phase verifiers missed. This validated the multi-layer verification approach.
- **MCP tool pattern is mature**: Phases 6 and 7 added 3 new tools by following the exact pattern established in v3.0. Zero new architecture decisions needed.

### What Was Inefficient

- **Phase 8 parameter mismatches**: The planner assumed parameter names instead of reading the actual Zod schemas from `mcp-server.mjs`. The phase verifier checked tool name references but not parameter-level compatibility. This caused 3 gaps in the milestone audit.
- **Research disabled throughout**: All 5 phases skipped research (`research_enabled: false`). For Phases 6-7 this was fine (pure pattern-following), but Phase 8 would have benefited from research reading the actual tool schemas before planning.

### Patterns Established

- **Integration checker as milestone gate**: The `gsd-integration-checker` agent proved its value by catching cross-phase wiring issues that per-phase verifiers cannot see. Should remain a required step before milestone completion.
- **Shared function extraction pattern**: `generateDiagramSnapshot` was extracted from `mcp-server.mjs` to `orchestrator.mjs` with a local wrapper preserving MCP-specific behavior (`writingNow` set). Reusable pattern for any function needed by both MCP server and scheduler.
- **Propagation script pattern**: `scripts/propagate-lint-rules.mjs` handles package manager detection (npm vs pnpm vs pnpm-workspace), config merging, and dry-run mode. Template for future cross-repo propagation needs.

### Key Lessons

1. **Verify parameter compatibility, not just tool names**: Phase verifiers should grep for actual Zod schema parameter names and cross-reference against consumer invocations. Tool name presence is necessary but not sufficient.
2. **Enable research for phases that cross repo boundaries**: Phase 8 modified RootDispatcher files based on DocuMind tool schemas. Research would have loaded the actual schemas into planner context and prevented the mismatches.
3. **One-day milestones are viable for polish work**: v3.1's 5 phases completed in a single session because every phase followed established patterns. No architectural decisions, no blocking dependencies, no research needed.

### Cost Observations

- Model mix: ~75% sonnet (researchers, checkers, executors, verifiers), ~25% opus (orchestrator)
- Sessions: 1 session covering all 5 phases + audit + completion
- Notable: Plan-execute-verify cycle averaged ~8 min per phase. Total wall time under 2 hours for the entire milestone.

---

## Cross-Milestone Trends

| Metric          | v3.0                     | v3.1                     |
| --------------- | ------------------------ | ------------------------ |
| Phases          | 5                        | 5                        |
| Plans           | 14                       | 7                        |
| Timeline        | 6 days                   | 1 day                    |
| Avg plan time   | ~4 min                   | ~8 min                   |
| Requirements    | 36/36 satisfied          | 12/12 satisfied          |
| Tech debt items | 6 (non-blocking)         | 0                        |
| Verification    | 4/5 phases have VERIF.md | 5/5 phases have VERIF.md |
| Audit gaps      | N/A                      | 3 found, 3 resolved      |
