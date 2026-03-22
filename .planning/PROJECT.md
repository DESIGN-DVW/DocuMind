# DocuMind

## What This Is

DocuMind is a documentation intelligence platform that indexes, relates, and enforces quality across 14+ DVWDesign repositories. It runs as a PM2-managed Express service on port 9000 with an MCP stdio server exposing 11 tools (6 read + 5 write) to Claude Code agents across the ecosystem. Backed by SQLite FTS5 with a portable context profile system.

## Core Value

When you look at a document, you instantly see what it's connected to — what links to it, what duplicates it, and whether it's stale. The relationship graph is the intelligence layer that makes DocuMind more than a linter.

## Requirements

### Validated

- ✓ Full-text search across 620+ markdown files via FTS5 — existing
- ✓ Markdown linting with standard + custom rules (DVW001 + MD060A) — v3.0
- ✓ Auto-fix systematic markdown errors across repos — v3.0
- ✓ File format conversion (DOCX/RTF to Markdown) — existing
- ✓ PDF text extraction and indexing — existing
- ✓ Diagram registry centralized in DB, single source of truth — v3.0
- ✓ REST API on port 9000 (20+ endpoints) — v3.0
- ✓ PM2 daemon with Express server — existing
- ✓ SQLite database with safe versioned migrations — v3.0
- ✓ Pre-commit hooks (husky + lint-staged + markdownlint) — existing
- ✓ Schema evolution: classifications (tree) + tags (flat) + summary — v3.0
- ✓ Context profiles: portable JSON config for any environment — v3.0
- ✓ Scheduler wired to all processors (hourly/daily/weekly crons) — v3.0
- ✓ Document relationship graph populated with sibling cap — v3.0
- ✓ TF-IDF keyword extraction with confidence scores — v3.0
- ✓ Similar/duplicate document detection across repos — v3.0
- ✓ Stale document detection — v3.0
- ✓ MCP server: 6 read tools (search, graph, keywords, tree, diagrams, check_existing) — v3.0
- ✓ MCP server: 5 write tools (index, lint, fix, scan, curate_diagram) — v3.0
- ✓ DocuMind MCP registered in all 16 DVWDesign repos — v3.0

## Current Milestone: v3.1 Polish & Propagation

**Goal:** Close v3.0 tech debt, propagate markdown tooling to all repos, complete diagram registry centralization with slash command updates.

**Target features:**
- MCP read tools for similarities + deviations
- Slash commands (/diagram-registry, /figma-diagram, /figma-curate) rewritten for MCP
- Markdownlint custom rules (DVW001 + MD060A) propagated to all repos
- Diagram snapshot auto-generated during scheduled scans
- Phase 4 VERIFICATION.md backfill + MCPW-05 naming fix

### Active

- [ ] MCP tools for surfacing similarity/deviation intelligence
- [ ] Update /diagram-registry, /figma-diagram, /figma-curate slash commands for MCP
- [ ] Propagate DVW001 + MD060A markdownlint rules to all DVWDesign repos
- [ ] Auto-generate DIAGRAM-REGISTRY.md snapshot during scheduled scans
- [ ] Backfill Phase 4 VERIFICATION.md
- [ ] Fix MCPW-05 naming in archived REQUIREMENTS.md

### Future

- [ ] Dockerize for portable deployment
- [ ] Web dashboard beyond diagram curation
- [ ] Git-based ingestion (clone/pull instead of filesystem walk)

### Out of Scope

- OAuth / multi-tenant auth — revisit if SaaS path chosen
- Semantic/embedding-based search — FTS5 + TF-IDF sufficient for current scale
- Real-time collaboration on docs — not DocuMind's role
- Mobile app — CLI + MCP is the interface

## Context

DocuMind v3.0 shipped 2026-03-22. The platform is fully operational:
- 8K+ documents indexed with summaries, classifications, and tags
- All processors wired to cron scheduler (hourly incremental, daily full, weekly deep)
- MCP server with 11 tools callable from any DVWDesign repo
- Diagram registry centralized — DB as single source of truth, per-repo files deprecated
- Context profile system enables portability to different environments

The strategic path forward:
1. **Step #1: Working internal tool** — ✅ Complete (v3.0)
2. **Step #2: MCP server** — ✅ Complete (v3.0)
3. **Step #3: Commercial product** — Next: Docker, pluggable rule packs, SaaS layer

## Constraints

- **Stack**: Node.js >= 20, ES modules (.mjs), SQLite via better-sqlite3, Express 5
- **Database**: SQLite with WAL mode. SQLite-per-tenant (Turso) if SaaS path chosen
- **Port**: 9000 (registered in RootDispatcher port-registry)
- **Runtime**: PM2 daemon on macOS; Docker for portable deployment
- **Solo user**: No auth needed — just Dave via CLI and Claude Code
- **MCP transport**: stdio for Claude Code; HTTP planned for remote consumers

## Key Decisions

| Decision                              | Rationale                                                      | Outcome      |
| ------------------------------------- | -------------------------------------------------------------- | ------------ |
| Keep SQLite, no NoSQL                 | Single writer, read-heavy, ~50K doc ceiling, zero config       | ✓ Good       |
| Build MCP alongside REST              | Main value is agents querying DocuMind                         | ✓ Good       |
| Schema + profiles before processors   | Data model must be stable before processors write to it        | ✓ Good       |
| Graph is the priority feature         | Relationship map is the day-one intelligence test              | ✓ Good       |
| Context profiles for portability      | JSON config swaps behavior for code/marketing/ops verticals    | ✓ Good       |
| Fold relink_diagram into curate_diagram | One tool sets URL + propagates + generates snapshot           | ✓ Good       |
| DB as single source for diagrams      | Per-repo DIAGRAM-REGISTRY.md files deprecated                  | ✓ Good       |
| Separate lint_file + fix_file         | Matches CLI pattern, agent decides when to fix                 | ✓ Good       |

---

*Last updated: 2026-03-22 after v3.1 milestone start*
