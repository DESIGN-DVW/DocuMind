# Requirements: DocuMind v3.1

**Defined:** 2026-03-22
**Core Value:** When you look at a document, you instantly see what it's connected to — what links to it, what duplicates it, and whether it's stale.

## v3.1 Requirements

Requirements for v3.1 Polish & Propagation. Closes v3.0 tech debt and propagates tooling.

### MCP Intelligence Tools

- [ ] **MCPI-01**: `get_similarities` tool — returns similar/duplicate document pairs with scores for a given repo or across all repos
- [ ] **MCPI-02**: `get_deviations` tool — returns convention deviations (5 types) with severity and affected file paths

### Slash Command Updates

- [ ] **SLSH-01**: `/diagram-registry` rewritten to use `get_diagrams` MCP tool instead of local file lookup
- [ ] **SLSH-02**: `/figma-diagram` Step 4 uses `register_diagram` MCP tool instead of editing DIAGRAM-REGISTRY.md
- [ ] **SLSH-03**: `/figma-curate` uses `curate_diagram` MCP tool instead of manual file editing + curl
- [ ] **SLSH-04**: `global-rules.md` updated to declare DB as single source of truth for diagrams

### Markdown Tooling Propagation

- [ ] **PROP-01**: DVW001 (`table-separator-spacing.cjs`) + MD060A (`force-align-table-columns`) installed and configured in all DVWDesign repos that have markdown
- [ ] **PROP-02**: `.markdownlint-cli2.jsonc` with custom rules created in each target repo

### Diagram Registry Completion

- [ ] **DIAG-01**: `DIAGRAM-REGISTRY.md` snapshot auto-generated during scheduled scans (daily/weekly)
- [ ] **DIAG-02**: `register_diagram` MCP tool added for agents to register new diagrams (auto-detect type from .mmd)

### Documentation Fixes

- [ ] **DOCS-01**: Phase 4 VERIFICATION.md backfilled
- [ ] **DOCS-02**: MCPW-05 naming fixed in archived `milestones/v3.0-REQUIREMENTS.md`

## Future Requirements

Deferred to v4.0 or later:

- **PORT-01**: Dockerize for portable deployment
- **PORT-02**: Git-based ingestion (clone/pull instead of filesystem walk)
- **PORT-03**: Web dashboard beyond diagram curation
- **PORT-04**: Pluggable lint rule packs (selectable per profile)

## Out of Scope

| Feature                         | Reason                                              |
| ------------------------------- | --------------------------------------------------- |
| OAuth / multi-tenant auth       | v4.0 SaaS concern, not v3.1                        |
| Semantic/embedding search       | FTS5 + TF-IDF sufficient for current scale          |
| New processors (MJML, Figma)    | Not tech debt — new capability for future milestone |
| Auto-commit for URL propagation | User chose unstaged in v3.0; revisit in v4.0       |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status  |
| ----------- | ----- | ------- |
| MCPI-01     | TBD   | Pending |
| MCPI-02     | TBD   | Pending |
| SLSH-01     | TBD   | Pending |
| SLSH-02     | TBD   | Pending |
| SLSH-03     | TBD   | Pending |
| SLSH-04     | TBD   | Pending |
| PROP-01     | TBD   | Pending |
| PROP-02     | TBD   | Pending |
| DIAG-01     | TBD   | Pending |
| DIAG-02     | TBD   | Pending |
| DOCS-01     | TBD   | Pending |
| DOCS-02     | TBD   | Pending |

**Coverage:**

- v3.1 requirements: 12 total
- Mapped to phases: 0
- Unmapped: 12 (awaiting roadmap)

---

*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after initial definition*
