# Roadmap: DocuMind

## Milestones

- ✅ **v3.0 Documentation Intelligence Platform** — Phases 1-5 (shipped 2026-03-22)
- 🚧 **v3.1 Polish & Propagation** — Phases 6-10 (in progress)

## Phases

<details>
<summary>✅ v3.0 Documentation Intelligence Platform (Phases 1-5) — SHIPPED 2026-03-22</summary>

- [x] Phase 1: Schema Migration Foundation (3/3 plans) — completed 2026-03-17
- [x] Phase 2: Context Profile Loader (2/2 plans) — completed 2026-03-17
- [x] Phase 3: Orchestrator and Scheduler Wiring (4/4 plans) — completed 2026-03-17
- [x] Phase 4: MCP Server — Read Tools (2/2 plans) — completed 2026-03-17
- [x] Phase 5: MCP Server — Write Tools (3/3 plans) — completed 2026-03-22

Full details: `.planning/milestones/v3.0-ROADMAP.md`

</details>

### 🚧 v3.1 Polish & Propagation (In Progress)

**Milestone Goal:** Close v3.0 tech debt, surface similarity/deviation intelligence via MCP, propagate markdown tooling to all repos, and complete diagram registry centralization.

#### Phase Checklist

- [x] **Phase 6: MCP Intelligence Tools** — Add `get_similarities` and `get_deviations` read tools to the MCP server (completed 2026-03-22)
- [ ] **Phase 7: Diagram Registry Completion** — Add `register_diagram` MCP tool and auto-generate DIAGRAM-REGISTRY.md snapshot during scheduled scans
- [x] **Phase 8: Slash Command Updates** — Rewrite `/diagram-registry`, `/figma-diagram`, `/figma-curate` to use MCP tools; update global-rules.md (completed 2026-03-22)
- [ ] **Phase 9: Markdown Tooling Propagation** — Install DVW001 + MD060A custom lint rules and `.markdownlint-cli2.jsonc` in all DVWDesign repos
- [ ] **Phase 10: Documentation Fixes** — Backfill Phase 4 VERIFICATION.md and fix MCPW-05 naming in archived requirements

## Phase Details

### Phase 6: MCP Intelligence Tools

**Goal**: Agents can query similarity and deviation intelligence through the MCP server
**Depends on**: Phase 5 (MCP server with read/write tools)
**Requirements**: MCPI-01, MCPI-02
**Success Criteria** (what must be TRUE):

1. Agent calling `get_similarities` receives similar/duplicate document pairs with scores, filterable by repo
2. Agent calling `get_deviations` receives convention deviations with severity and affected file paths, covering all 5 deviation types
3. Both tools appear in `mcp list-tools` output alongside the existing 11 tools
4. Tools return structured JSON (not plain text) consistent with existing MCP tool response format

**Plans:** 1/1 plans complete

- [ ] 06-01-PLAN.md — Add get_similarities and get_deviations read tools to MCP server

### Phase 7: Diagram Registry Completion

**Goal**: Diagram registry is self-maintaining — agents can register new diagrams and scheduled scans keep the snapshot current
**Depends on**: Phase 5 (curate_diagram exists; DB is single source of truth)
**Requirements**: DIAG-01, DIAG-02
**Success Criteria** (what must be TRUE):

1. Agent calling `register_diagram` successfully adds a new diagram to the DB with type auto-detected from .mmd content
2. DIAGRAM-REGISTRY.md snapshot is regenerated automatically during daily and weekly scheduled scans
3. DIAGRAM-REGISTRY.md reflects the current state of the `diagrams` table after each scan completes

**Plans:** 1/1 plans complete

- [x] 07-01-PLAN.md — Add register_diagram MCP tool + wire snapshot generation into scheduled scans

### Phase 8: Slash Command Updates

**Goal**: Slash commands use MCP tools as their backend — no more direct file reads or curl calls
**Depends on**: Phase 6 (get_similarities, get_deviations available), Phase 7 (register_diagram available)
**Requirements**: SLSH-01, SLSH-02, SLSH-03, SLSH-04
**Success Criteria** (what must be TRUE):

1. `/diagram-registry` retrieves diagram data via `get_diagrams` MCP tool call, not local file lookup
2. `/figma-diagram` Step 4 registers the new diagram via `register_diagram` MCP tool, not by editing DIAGRAM-REGISTRY.md
3. `/figma-curate` updates diagram URLs via `curate_diagram` MCP tool, not manual file editing + curl
4. `global-rules.md` states that the `diagrams` table is the single source of truth and DIAGRAM-REGISTRY.md is a generated snapshot

**Plans:** 2/2 plans complete

Plans:
- [ ] 08-01-PLAN.md — Rewrite /diagram-registry and /figma-diagram to use MCP tools
- [ ] 08-02-PLAN.md — Rewrite /figma-curate and update global-rules.md

### Phase 9: Markdown Tooling Propagation

**Goal**: Every DVWDesign repo with markdown enforces DVW001 and MD060A custom lint rules
**Depends on**: Phase 5 (rules proven in DocuMind)
**Requirements**: PROP-01, PROP-02
**Success Criteria** (what must be TRUE):

1. DVW001 (`table-separator-spacing.cjs`) and MD060A (`force-align-table-columns`) are installed and operational in all target DVWDesign repos
2. Each target repo has a `.markdownlint-cli2.jsonc` that references the custom rules
3. Running `markdownlint-cli2` in any target repo applies the custom rules without errors

**Plans:** 2 plans

Plans:
- [ ] 08-01-PLAN.md — Rewrite /diagram-registry and /figma-diagram to use MCP tools
- [ ] 08-02-PLAN.md — Rewrite /figma-curate and update global-rules.md

### Phase 10: Documentation Fixes

**Goal**: v3.0 documentation is complete and the archived requirements file has correct naming
**Depends on**: Nothing (housekeeping; can run anytime)
**Requirements**: DOCS-01, DOCS-02
**Success Criteria** (what must be TRUE):

1. Phase 4 VERIFICATION.md exists at `.planning/phases/04-mcp-read-tools/04-VERIFICATION.md` and documents what was verified
2. `milestones/v3.0-REQUIREMENTS.md` uses MCPW-05 naming consistently — no incorrect aliases

**Plans:** 2 plans

Plans:
- [ ] 08-01-PLAN.md — Rewrite /diagram-registry and /figma-diagram to use MCP tools
- [ ] 08-02-PLAN.md — Rewrite /figma-curate and update global-rules.md

## Progress

**Execution Order:** Phases execute in numeric order. Phase 8 depends on Phases 6 and 7.

| Phase                                | Milestone | Plans Complete | Status      | Completed  |
| ------------------------------------ | --------- | -------------- | ----------- | ---------- |
| 1. Schema Migration Foundation       | v3.0      | 3/3            | Complete    | 2026-03-17 |
| 2. Context Profile Loader            | v3.0      | 2/2            | Complete    | 2026-03-17 |
| 3. Orchestrator and Scheduler Wiring | v3.0      | 4/4            | Complete    | 2026-03-17 |
| 4. MCP Server — Read Tools           | v3.0      | 2/2            | Complete    | 2026-03-17 |
| 5. MCP Server — Write Tools          | v3.0      | 3/3            | Complete    | 2026-03-22 |
| 6. MCP Intelligence Tools            | v3.1      | 1/1            | Complete    | 2026-03-22 |
| 7. Diagram Registry Completion       | v3.1      | 1/1            | Complete    | 2026-03-22 |
| 8. Slash Command Updates             | 2/2 | Complete   | 2026-03-22 | -          |
| 9. Markdown Tooling Propagation      | v3.1      | 0/?            | Not started | -          |
| 10. Documentation Fixes              | v3.1      | 0/?            | Not started | -          |
