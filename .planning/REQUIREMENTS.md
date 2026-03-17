# Requirements: DocuMind v3.0

**Defined:** 2026-03-15
**Core Value:** When you look at a document, you instantly see what it's connected to — what links to it, what duplicates it, and whether it's stale.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Schema & Migration

- [x] **SCHM-01**: Schema migration system with versioned SQL files and a `schema_migrations` table (protects 8K live docs from destructive db:reset)
- [x] **SCHM-02**: Add `summary TEXT` column to documents table with FTS5 rebuild
- [x] **SCHM-03**: Add `classification TEXT` column to documents table (materialized path format: `engineering/architecture/adrs`)
- [x] **SCHM-04**: Create `document_tags` table (document_id, tag, source, confidence) with FTS5
- [x] **SCHM-05**: Remove hardcoded CHECK constraints from schema that enumerate DVWDesign-specific values

### Context Profiles

- [ ] **PROF-01**: Context profile JSON schema validated by Zod at startup
- [ ] **PROF-02**: `context/loader.mjs` loads active profile and exposes `ctx` object (repo paths, classification tree, relationship types, keyword taxonomies, lint rules)
- [ ] **PROF-03**: `dvwdesign.json` reference profile that reproduces current hardcoded behavior
- [ ] **PROF-04**: Classification tree defined in profile, not in database schema
- [ ] **PROF-05**: Keyword taxonomies defined in profile, not hardcoded in processor

### Orchestrator & Scheduler

- [ ] **ORCH-01**: `orchestrator.mjs` consolidates scan pipeline (markdown indexing, keyword extraction, graph population, staleness detection) into a single callable function
- [ ] **ORCH-02**: Scheduler hourly cron calls orchestrator for incremental scan (changed files only via content_hash)
- [ ] **ORCH-03**: Scheduler daily cron calls orchestrator for full scan + deviation analysis
- [ ] **ORCH-04**: Scheduler weekly cron calls orchestrator for keyword refresh + graph rebuild
- [ ] **ORCH-05**: `/scan` REST endpoint calls orchestrator (not a separate implementation)
- [ ] **ORCH-06**: FTS5 explicit rebuild after every bulk write operation

### Document Intelligence

- [ ] **INTL-01**: Auto-generate document summary from frontmatter description > first paragraph > title+keywords fallback
- [ ] **INTL-02**: Auto-classify documents using context profile classification rules (path match + frontmatter field match)
- [ ] **INTL-03**: Auto-extract tags via TF-IDF keyword processor with confidence scores
- [ ] **INTL-04**: Populate document relationship graph via `buildRelationships()` with sibling edge cap (max 10 per folder)
- [ ] **INTL-05**: Detect similar/duplicate documents across repos (Levenshtein + cosine, threshold 0.7)
- [ ] **INTL-06**: Detect stale documents (content_hash changed in linked files but doc not updated)
- [ ] **INTL-07**: Detect convention deviations (5 types: content_drift, structure_change, rule_violation, version_mismatch, metadata_inconsistency)

### MCP Server — Read Tools

- [ ] **MCPR-01**: `daemon/mcp-server.mjs` as separate entry point with stderr-only logging (no console.log to stdout)
- [ ] **MCPR-02**: `search_docs` tool — full-text search with repo/category/classification filters
- [ ] **MCPR-03**: `get_related` tool — graph traversal (doc ID + hops, returns paths and relationship types)
- [ ] **MCPR-04**: `get_keywords` tool — keyword cloud for a repo with TF-IDF scores
- [ ] **MCPR-05**: `get_tree` tool — folder hierarchy for a repo
- [ ] **MCPR-06**: `check_existing` tool — "does a doc covering X already exist?" (search + scoring)
- [ ] **MCPR-07**: `get_diagrams` tool — diagram registry with stale status
- [ ] **MCPR-08**: stdio transport for Claude Code integration

### MCP Server — Write Tools

- [ ] **MCPW-01**: `index_file` tool — re-index a single file after edit
- [ ] **MCPW-02**: `lint_file` tool — lint a file and return issues
- [ ] **MCPW-03**: `fix_file` tool — auto-fix a file's markdown issues
- [ ] **MCPW-04**: `trigger_scan` tool — trigger incremental or full scan via orchestrator
- [ ] **MCPW-05**: `relink_diagram` tool — set curated FigJam URL and propagate
- [ ] **MCPW-06**: Path validation against `ctx.repoRoots` for all write operations

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Commercialization (Step #3)

- **SAAS-01**: Docker packaging with context profile as mount point
- **SAAS-02**: SQLite-per-tenant via Turso for multi-tenant SaaS
- **SAAS-03**: OAuth (GitHub, Google) for team access
- **SAAS-04**: Web dashboard for non-CLI users
- **SAAS-05**: Stripe billing integration
- **SAAS-06**: StreamableHTTP transport for remote MCP access

### Enhanced Intelligence

- **ENHC-01**: Semantic/embedding-based search supplement
- **ENHC-02**: Doc health scoring (freshness, completeness, link validity)
- **ENHC-03**: Auto-generated doc update suggestions from code changes
- **ENHC-04**: Knowledge graph web visualization

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Web dashboard / UI | Solo user for Step #1; massive front-end dependency for one person |
| OAuth / multi-tenant auth | Step #3 concern; one user with CLI access |
| Semantic embedding search | FTS5 + TF-IDF sufficient for 620 docs in controlled vocabulary |
| Real-time collaboration | DocuMind is an indexer, not an editor |
| Push notifications / webhooks | Pull-based daemon; poll `/stats` instead |
| LLM-generated summaries | API cost per doc on re-index; extractive summaries cover the use case |

## Traceability

| Requirement | Phase | Status |
| --- | --- | --- |
| SCHM-01 | Phase 1 | Complete |
| SCHM-02 | Phase 1 | Complete |
| SCHM-03 | Phase 1 | Complete |
| SCHM-04 | Phase 1 | Complete |
| SCHM-05 | Phase 1 | Complete |
| PROF-01 | Phase 2 | Pending |
| PROF-02 | Phase 2 | Pending |
| PROF-03 | Phase 2 | Pending |
| PROF-04 | Phase 2 | Pending |
| PROF-05 | Phase 2 | Pending |
| ORCH-01 | Phase 3 | Pending |
| ORCH-02 | Phase 3 | Pending |
| ORCH-03 | Phase 3 | Pending |
| ORCH-04 | Phase 3 | Pending |
| ORCH-05 | Phase 3 | Pending |
| ORCH-06 | Phase 3 | Pending |
| INTL-01 | Phase 3 | Pending |
| INTL-02 | Phase 3 | Pending |
| INTL-03 | Phase 3 | Pending |
| INTL-04 | Phase 3 | Pending |
| INTL-05 | Phase 3 | Pending |
| INTL-06 | Phase 3 | Pending |
| INTL-07 | Phase 3 | Pending |
| MCPR-01 | Phase 4 | Pending |
| MCPR-02 | Phase 4 | Pending |
| MCPR-03 | Phase 4 | Pending |
| MCPR-04 | Phase 4 | Pending |
| MCPR-05 | Phase 4 | Pending |
| MCPR-06 | Phase 4 | Pending |
| MCPR-07 | Phase 4 | Pending |
| MCPR-08 | Phase 4 | Pending |
| MCPW-01 | Phase 5 | Pending |
| MCPW-02 | Phase 5 | Pending |
| MCPW-03 | Phase 5 | Pending |
| MCPW-04 | Phase 5 | Pending |
| MCPW-05 | Phase 5 | Pending |
| MCPW-06 | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---

Requirements defined: 2026-03-15
Last updated: 2026-03-15 after initial definition
