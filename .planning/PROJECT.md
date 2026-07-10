# DocuMind

## What This Is

DocuMind is a documentation intelligence platform that indexes, relates, and enforces quality across 14+ DVWDesign repositories. It runs as a PM2-managed Express service on port 9000 with an MCP stdio server exposing 14 tools (8 read + 6 write) to Claude Code agents across the ecosystem. Backed by SQLite FTS5 with a portable context profile system.

## Core Value

When you look at a document, you instantly see what it's connected to — what links to it, what duplicates it, and whether it's stale. The relationship graph is the intelligence layer that makes DocuMind more than a linter.

## Requirements

### Validated

- ✓ Dockerfile + docker-compose.yml for single-command startup — v3.2

- ✓ Volume mount mode for local dev repo access — v3.2

- ✓ Git clone/pull mode for remote/CI repo access — v3.2

- ✓ Environment-based configuration (repo paths, mode, cron schedules) — v3.2

- ✓ MCP server dual-mode: stdio local, HTTP containerized — v3.2

- ✓ Health checks + graceful shutdown — v3.2

- ✓ Published image on GHCR — v3.2

- ✓ CI-ready multi-arch build via GitHub Actions — v3.2

- ✓ PM2 launchd autostart + MCP Inspector as persistent service — v3.2

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

- ✓ Graph traversal via SQLite recursive CTEs (Kuzu retired per ADR-001) — v3.3

- ✓ Obsolete docs dashboard with archive + delete actions — v3.3

### Active

<!-- v3.4 scope — Presentation Pipeline -->

- [ ] Marp toolchain: marp-cli devDependency, .marprc.yml, slides:* npm scripts (HTML/PDF/PPTX incl. --pptx-editable)

- [ ] DeepL translation stage: EN deck → generated .fr.md, Marp directives/code/proper nouns preserved, glossary support

- [ ] Render stage: EN + FR → HTML/PDF/PPTX via single slides:build

- [ ] FTP deploy stage with dry-run mode (creds pending in .env)

- [ ] Figma Slides push runbook via use_figma MCP (blocked on Figma MCP auth)

- [ ] Orchestration: daemon watcher trigger → translate → render → deploy, with loop protection

- [ ] ProductMarketing content updates flow as dispatches into EN source; AgentHub discovery published on deploy

- [ ] Rendered outputs gitignored; stale committed binaries removed

### Future

- [ ] Web dashboard beyond diagram curation

- [ ] Pluggable rule packs for different domains

- [ ] SaaS layer (multi-tenant, auth, billing)

### Out of Scope

- Kuzu graph DB — retired per ADR-001 (2026-07); SQLite recursive CTEs cover graph traversal, Graphify covers visualization

- Figma Buzz integration — RandD study concluded stop (2026-07); removed from all marketing material

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
| Retire Kuzu → SQLite CTE (ADR-001)    | Dual-DB complexity not justified; CTEs + Graphify cover needs  | ✓ Good       |
| EN Marp .md = only hand-edited slide artifact | FR/HTML/PDF/PPTX/hosted copies are generated, never edited | — Pending |
| Rendered slide exports gitignored     | ~8MB binary churn per edit; pipeline makes regeneration free   | — Pending    |
| DeepL for FR translation              | Always-French requirement; API-driven, glossary-capable        | — Pending    |

---

## Current Milestone: v3.4 Presentation Pipeline

**Goal:** Automated slides publishing pipeline — EN Marp decks as single source of truth, DeepL French translation, HTML/PDF/PPTX rendering, FTP deploy, and Figma Slides push, orchestrated by the DocuMind daemon with agent-driven content updates.

### Target features

- Marp toolchain (marp-cli devDep, .marprc.yml, slides:* scripts, editable PPTX via LibreOffice)

- DeepL translation stage producing generated .fr.md decks (directives/code/proper nouns preserved)

- Single slides:build rendering EN + FR to HTML/PDF/PPTX

- FTP deploy with dry-run mode until credentials land in .env

- Figma Slides push runbook via use_figma MCP (final presentation document)

- Daemon watcher orchestration: EN deck change → translate → render → deploy, loop-protected

- ProductMarketing updates arrive as RootDispatcher dispatches; AgentHub discovery on deploy

**Known prereq gaps:** DEEPL_API_KEY missing, FTP creds missing, Figma MCP unauthorized, soffice not on PATH.

---

### Last updated: 2026-07-10 after v3.4 milestone started
