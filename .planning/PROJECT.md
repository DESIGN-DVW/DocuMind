# DocuMind

## What This Is

DocuMind is a documentation intelligence platform that indexes, relates, and enforces quality across 14+ DVWDesign repositories. It runs as a PM2-managed Express service on port 9000 with an MCP stdio server exposing 14 tools (8 read + 6 write) to Claude Code agents across the ecosystem. Backed by SQLite FTS5 with a portable context profile system.

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
- ✓ MCP read tools for similarity/deviation intelligence (get_similarities, get_deviations) — v3.1
- ✓ register_diagram MCP tool with auto-type detection from .mmd content — v3.1
- ✓ DIAGRAM-REGISTRY.md auto-generated during daily/weekly scheduled scans — v3.1
- ✓ Slash commands (/diagram-registry, /figma-diagram, /figma-curate) use MCP tools as backend — v3.1
- ✓ global-rules.md declares diagrams table as single source of truth — v3.1
- ✓ DVW001 + MD060A custom lint rules propagated to all 16 DVWDesign repos — v3.1
- ✓ All phase VERIFICATION.md files complete (Phase 4 backfilled) — v3.1

### Active

(No active requirements — planning next milestone)

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

DocuMind v3.1 shipped 2026-03-23. The platform is fully operational with complete intelligence surfacing:
- 8K+ documents indexed with summaries, classifications, and tags
- All processors wired to cron scheduler (hourly incremental, daily full, weekly deep)
- MCP server with 14 tools (8 read + 6 write) callable from any DVWDesign repo
- Similarity and deviation intelligence surfaced via MCP (get_similarities, get_deviations)
- Diagram registry self-maintaining — register_diagram auto-detects type, snapshots auto-generated
- Slash commands use MCP tools as backend — no more direct file reads or curl calls
- DVW001 + MD060A custom lint rules enforced across all 16 DVWDesign repos
- Context profile system enables portability to different environments

The strategic path forward:
1. **Step #1: Working internal tool** — ✅ Complete (v3.0)
2. **Step #2: MCP server + intelligence** — ✅ Complete (v3.1)
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

*Last updated: 2026-03-23 after v3.1 milestone*
