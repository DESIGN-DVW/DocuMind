# Requirements: DocuMind v3.4 Presentation Pipeline

**Defined:** 2026-07-10
**Core Value:** When you look at a document, you instantly see what it's connected to — the relationship graph is the intelligence layer. v3.4 extends this to presentations: the EN deck is the source of truth, and every downstream artifact stays automatically current.

## v3.4 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Foundation & Hygiene

- [ ] **FOUND-01**: Rendered slide exports (HTML/PDF/PPTX) are gitignored; stale committed binaries removed from the git index without deleting local copies (no history rewrite)
- [ ] **FOUND-02**: `.env.example` documents all pipeline variables (DEEPL_API_KEY, FTP_HOST/USER/PASSWORD/REMOTE_PATH, SOFFICE_PATH) — no real secrets in repo or Docker image
- [ ] **FOUND-03**: `slide_pipeline_runs` ledger table + `latest_slide_runs` view exist via versioned migration

### Render

- [ ] **RNDR-01**: User can render any EN deck to HTML, PDF, and PPTX with a single `npm run slides:build`
- [ ] **RNDR-02**: Editable PPTX is produced via `--pptx-editable` when soffice is resolvable (SOFFICE_PATH); when not, the build warns explicitly — never a silent image-based fallback
- [ ] **RNDR-03**: Renders succeed under the PM2 daemon environment (browser + soffice resolution verified daemon-side, not just interactive shell)

### Translation

- [ ] **TRNS-01**: A changed EN deck produces a sibling `.fr.md` with all prose translated to French via DeepL
- [ ] **TRNS-02**: Front-matter, Marp directives (`<!-- _class: ... -->`), code fences, inline code, URLs, and glossary-pinned proper nouns survive translation byte-identical
- [ ] **TRNS-03**: Translated tables remain DVW001/DVW002 compliant; generated `.fr.md` passes the lint gate before render
- [ ] **TRNS-04**: DeepL glossary pins brand/product terms (DVWDesign, Figma, Marp, MCP, DocuMind, FigJam); front-matter footer strings are never sent to DeepL
- [ ] **TRNS-05**: Unchanged decks are not re-translated (content-hash idempotency — quota protection)
- [ ] **TRNS-06**: `.fr.md` files are tracked in git and carry a generated-file header warning (manual edits get overwritten; corrections go to the glossary)

### Orchestration

- [ ] **PIPE-01**: Saving an EN deck under docs/slides/ automatically triggers translate → render → deploy via the daemon watcher
- [ ] **PIPE-02**: Generated files (`.fr.md`, HTML/PDF/PPTX) never retrigger the pipeline — glob exclusion verified loop-free end-to-end
- [ ] **PIPE-03**: Rapid successive saves coalesce into one run; a per-deck run lock prevents overlapping runs
- [ ] **PIPE-04**: Every pipeline run is recorded in the ledger with per-stage outcome and timing
- [ ] **PIPE-05**: Content changes applied from dispatches (e.g. ProductMarketing) flow through the same watcher trigger path as manual edits

### Deploy

- [ ] **DPLY-01**: Rendered EN + FR HTML deploys to the web host via FTP using atomic stage-then-rename (no half-published state)
- [ ] **DPLY-02**: Deploy runs in dry-run mode (logs intended actions, uploads nothing) whenever FTP credentials are absent
- [ ] **DPLY-03**: Each deploy records a manifest of uploaded files with hashes and timestamps

### Surfaces & Ecosystem

- [ ] **SURF-01**: `POST /slides/build` REST endpoint triggers the pipeline for one deck or all decks
- [ ] **SURF-02**: `build_slides` MCP tool lets agents trigger the pipeline as a tool call
- [ ] **SURF-03**: A successful deploy publishes an AgentHub discovery via REST (`POST /api/discoveries` on port 3004)
- [ ] **SURF-04**: A weekly drift-check cron compares deployed hashes against current sources and surfaces mismatches

### Figma Slides

- [ ] **FIGS-01**: A runbook documents pushing the final external deck to Figma Slides via `use_figma` (manual agent procedure — automation deferred until Figma MCP auth + input contract verified)

## Future Requirements

Deferred. Tracked but not in current roadmap.

### Pipeline

- **PIPE-F1**: Automated Figma Slides push (pending Figma MCP auth + `figma-use-slides` input-contract verification)
- **PIPE-F2**: Additional target languages beyond French
- **PIPE-F3**: PDF/PPTX deployment to web host (v3.4 deploys HTML only)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| - | - |
| Git history rewrite for stale binaries | Force-push disruption not worth ~8MB; rm --cached + gitignore suffices |
| Footer/front-matter translation | Brand strings stay identical in both languages; front-matter never sent to DeepL |
| SFTP support | basic-ftp speaks FTP/FTPS only; revisit only if host requires SFTP (protocol unconfirmed) |
| Live-edit sync back from Figma Slides | Figma is a publish target, not a source; EN .md is the only source of truth |
| Slide theming/design overhaul | Pipeline milestone; deck design is content work, not infrastructure |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
| - | - | - |
| (populated by roadmapper) | | |

**Coverage:**

- v3.4 requirements: 25 total
- Mapped to phases: 0
- Unmapped: 25 ⚠️ (pending roadmap)

---

*Requirements defined: 2026-07-10*
*Last updated: 2026-07-10 after scoping decisions (FR tracked in git, footers untranslated, no history rewrite, all surfaces in scope)*
