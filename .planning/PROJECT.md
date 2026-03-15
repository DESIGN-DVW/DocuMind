# DocuMind v3.0

## What This Is

DocuMind is a documentation intelligence daemon that indexes, relates, and enforces quality across 14+ DVWDesign repositories. It runs as a PM2-managed Express service on port 9000, backed by SQLite FTS5. v3.0 evolves it from an internal linting tool into a portable documentation intelligence product — first for internal use, then as an MCP server for AI agents, and ultimately as a commercial product (SaaS + self-hosted).

## Core Value

When you look at a document, you instantly see what it's connected to — what links to it, what duplicates it, and whether it's stale. The relationship graph is the intelligence layer that makes DocuMind more than a linter.

## Requirements

### Validated

- ✓ Full-text search across 620+ markdown files via FTS5 — existing
- ✓ Markdown linting with standard + custom rules (DVW001) — existing
- ✓ Auto-fix systematic markdown errors across repos — existing
- ✓ File format conversion (DOCX/RTF to Markdown) — existing (processors built)
- ✓ PDF text extraction and indexing — existing (processor built)
- ✓ Diagram registry with FigJam relinking — existing (fully working)
- ✓ REST API on port 9000 (14+ endpoints) — existing
- ✓ PM2 daemon with Express server — existing
- ✓ SQLite database with 20+ tables, 35+ indexes, 14 views — existing
- ✓ Pre-commit hooks (husky + lint-staged + markdownlint) — existing

### Active

- [ ] Schema evolution: classifications (tree) + tags (flat) + summary field
- [ ] Context profiles: JSON config that makes DocuMind portable across environments
- [ ] Wire scheduler to processors (cron jobs currently TODOs)
- [ ] Populate document relationship graph (buildRelationships exists, never called)
- [ ] Extract keywords via TF-IDF (processor exists, never runs)
- [ ] Detect similar/duplicate documents across repos
- [ ] Detect stale documents (content changed but doc not updated)
- [ ] MCP server: read tools (search, graph, keywords, tree, diagrams)
- [ ] MCP server: write tools (index, lint, fix, convert, relink)

### Out of Scope

- Web dashboard — not needed while solo user; revisit for Step #3
- OAuth / multi-tenant auth — Step #3 concern, not Step #1
- Semantic/embedding-based search — interesting but FTS5 + TF-IDF is sufficient for now
- Real-time collaboration on docs — not DocuMind's role
- Mobile app — CLI + MCP is the interface

## Context

DocuMind v2.0 is ~60% architected, ~40% implemented. The database schema is production-ready (8K+ docs indexed). The API has 14+ endpoints. But most processors aren't wired to the scheduler, and the graph/keyword/similarity tables are empty. The diagram relinking subsystem is the only fully end-to-end feature.

The strategic plan identifies three steps:

1. **Step #1: Working internal tool** — wire processors, populate graph, detect duplicates/stale docs
2. **Step #2: MCP server** — expose DocuMind as tools that Claude agents across all repos can query (built alongside Step #1)
3. **Step #3: Commercial product** — context profiles for portability, Docker packaging, SaaS + self-hosted offering

Key architectural insight: DocuMind's core engine (scan → index → relate → extract → surface) is context-agnostic. What changes per deployment is the classification tree, lint rules, relationship types, keyword taxonomies, and ingestion sources — all defined by a swappable context profile.

## Constraints

- **Stack**: Node.js >= 20, ES modules (.mjs), SQLite via better-sqlite3, Express 5
- **Database**: SQLite stays for Step #1 and #2. SQLite-per-tenant (Turso) if SaaS path chosen in Step #3
- **Port**: 9000 (registered in RootDispatcher port-registry)
- **Runtime**: PM2 daemon on macOS for Step #1; Docker for Step #3
- **Solo user**: No auth needed for Step #1 — just Dave via CLI and Claude Code
- **Existing schema**: Must migrate, not rebuild — 8K+ docs already indexed

## Key Decisions

| Decision | Rationale | Outcome |
| --- | --- | --- |
| Keep SQLite, no NoSQL | Single writer, read-heavy, ~50K doc ceiling, zero config | — Pending |
| Build MCP alongside REST | Main value is agents querying DocuMind — not a separate step | — Pending |
| All 4 foundation changes first | Classifications + tags + summary + context profiles reshape the data model everything depends on | — Pending |
| Graph is the priority feature | "See a relationship map" is the day-one test of success | — Pending |
| SaaS + self-hosted for Step #3 | SaaS for small teams, self-hosted for enterprises | — Pending |
| Context profiles for portability | JSON config swaps behavior for code/marketing/ops verticals | — Pending |

---

Last updated: 2026-03-15 after initialization
