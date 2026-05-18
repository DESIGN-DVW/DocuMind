# Handover — DocuMind — 2026-05-18 01:43

> **Branch:** `docs/2026-04-11-md-vs-mdx-guide` (all session work is uncommitted on this branch)
> **Last commit:** `b60f10b feat(graphify): add DocuMind knowledge graph — 354 nodes, 581 edges, 36 communities`
> **Written by:** Claude Sonnet 4.6 at end of session

---

## What Was Accomplished

All work this session is **uncommitted** (78 files modified/added). Changes live on branch `docs/2026-04-11-md-vs-mdx-guide`. A separate PR-ready commit is needed before merging.

- **[Task A]** Updated FigJam MCP docs to reflect `generate_diagram` now accepting `fileKey`:
  - `docs/FIGMA-MCP-FEATURE-REQUEST.md` — RESOLVED banner added, Priority 1 marked done, feature request updated
  - `docs/USE-FIGMA-TOOL-GUIDE.md` — New `generate_diagram with fileKey` section added at end
  - `docs/DIAGRAM-WORKFLOW.md` — Step 4 updated: `fileKey` used at generation time, manual board move no longer required
  - `.claude/commands/figma-diagram.md` — Step 3 updated: `fileKey` param in `generate_diagram` call, references `docs/DIAGRAM-WORKFLOW.md` for the key value (avoids secret scanner false positive)

- **[Task C]** Added shared nav bar to both dashboards:
  - `dashboard/obsolete.html` — nav with active state on "Obsolete Docs"
  - `dashboard/diagrams.html` — nav with active state on "Diagram Curation"
  - CSS inline in each file (no shared CSS file — both are standalone static HTML)

- **[Task E]** Obsolescence dashboard filter improvements:
  - Added `.page-note` subtitle explaining same-named files are per-repo
  - Added `repo-hint` class: filename cell now shows `filename (repo)` inline
  - Added "Why" column with signal chips: `age` / `orphan` / `kwd` / `sim` (color-coded, with tooltips)
  - Added "Hide diagram files" checkbox (default: ON) — server-side filter via `hide_diagram_files` query param
  - Server route `GET /obsolete` in `daemon/server.mjs` updated to exclude `.mmd` paths when flag is set

- **[Task D]** Enhanced Archive button — three-part change:
  - **Migration:** `scripts/db/migrations/008-action-log.sql` created (new file, untracked)
  - **Server startup:** `daemon/server.mjs` — `action_log` table created via `db.exec()` at startup (~line 62)
  - **Archive endpoint** (`POST /obsolete/:id/archive`) rewritten to:
    1. Join signal → document to get `file_path` + `repository`
    2. Write `action_log` row: `action='archive'`, `actor='user'`, `target_path`, `target_repo`, `performed_at`
    3. Append `relPath` to repo's `.gitignore` (non-fatal if repo root not found via `ctx.repoRoots`)
    4. Return `{ status, id, archived_at, gitignore_updated: true/false }`
  - **Dashboard** toast updated: shows "Archived — added to .gitignore" vs fallback message
  - **Scan exclusion** in `processors/obsolescence-detector.mjs`:
    - Archived document IDs are loaded before upsert — skipped so `archived_at` is preserved
    - Cleanup DELETE now adds `AND archived_at IS NULL` — archived signals never purged by re-scan

- **[Task B]** Searched DocuMind for old Figma docs:
  - No active Anima recommendations found (the removal was already documented in `mcp-enhancements-2.md`)
  - Found `STRATEGIC-ANALYSIS-FIGMA-MCP-WORKFLOW.md` (Oct 2025, FigmailAPP) as outdated
  - **DISPATCH-063** created: `RootDispatcher/dispatches/pending/FigmailAPP/DISPATCH-063-figma-workflow-docs-update.md`
  - FigmaDSController had zero indexed results — nothing to update

- **[Task F]** FigJam pending curation inventoried — 12 of 16 diagrams have no `curated_url`:
  - **DISPATCH-064** created: `RootDispatcher/dispatches/pending/DocuMind/DISPATCH-064-figjam-pending-curation-batch.md`
  - Batch deferred to future session (requires user to provide board node URLs)

---

## Key Discoveries

### `generate_diagram` fileKey — confirmed resolved

The Figma MCP `generate_diagram` tool now accepts `fileKey`. The central board key is embedded in the board URL `https://www.figma.com/board/L8gOzoOCb90ur2g9fDI9hm/`. The key is `L8gOzoOCb90ur2g9fDI9hm`. Diagrams now render into that file on the default page. Page-level targeting is still not supported — curation to the correct section remains a manual step.

### Diagram curation status (as of 2026-05-18)

16 diagrams registered total:

- **4 curated** (RootDispatcher): Agent Organization, Repo-Specific Agents, shared-packages Structure, DISPATCH-005 Workflow
- **3 on board, wrong/shared node-id** (RootDispatcher): Ecosystem diagrams 18/19/20 all share `node-id=81-333` — they need to be separated and individually curated
- **9 old redirect URLs** across any2figma (5), Figma-Plug-ins (2), LibraryAssetManager (1), RootDispatcher (1)

### `ctx.repoRoots` is the source for repo paths in server.mjs

The `.gitignore` write in the enhanced archive endpoint uses `ctx.repoRoots.find(r => r.name === signal.repository)?.path` (line ~670 in `daemon/server.mjs`). `ctx` is loaded at startup from `loadProfile()`. If a repo isn't in the profile, `gitignore_updated` returns false (non-fatal).

### Obsolescence detector scan exclusion pattern

Archived signals are protected by two guards in `processors/obsolescence-detector.mjs`:

1. Pre-upsert: archived doc IDs fetched → filtered out of `toUpsertFiltered`
2. Cleanup DELETE: `AND archived_at IS NULL` prevents orphan cleanup from wiping archived rows

### `action_log` table applied at startup

Migration 008 is NOT in `schema.sql` (which only reflects through migration 005). The table is created via inline `db.exec(CREATE TABLE IF NOT EXISTS action_log...)` in `daemon/server.mjs` startup block (~line 62). Restarting the daemon applies it automatically — no manual migration run needed.

### Anima references in FigmailAPP node_modules

DocuMind search returns Anima hits in `client/node_modules/@mui/**/CHANGELOG.md` — these are third-party MUI changelogs, not DVWDesign docs. Safe to ignore.

---

## Active Decisions

| Decision                                            | Rationale                                                                                                                | Reversible?                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Nav bar inlined per-file (no shared CSS/JS)         | Both dashboards are standalone static HTML; a shared file would require a build step or server-side include              | Yes — extract to `/dashboard/shared/nav.css` if a third dashboard is added |
| `fileKey` value not hardcoded in `figma-diagram.md` | Secret scanner flagged it as a generic API key false positive; now references `docs/DIAGRAM-WORKFLOW.md` § Central Board | Yes — re-inline if scanner is whitelisted                                  |
| Archive → `.gitignore` append is non-fatal          | Repo root may not be in profile (Docker, clone mode) — crashing the archive for this would be wrong                      | No — silent failure is intentional                                         |
| Scan exclusion skips upsert for archived docs       | Preserves `archived_at` through re-scans; prevents resurface without deleting the row                                    | Yes — remove the `archivedDocIds` filter in `obsolescence-detector.mjs`    |
| FigJam batch curation deferred to DISPATCH-064      | Requires user to open each standalone URL and provide board node URLs — not automatable                                  | N/A                                                                        |

---

## In-Progress Work

### All session changes — uncommitted

- **Status:** All 78 modified files are unstaged/uncommitted on `docs/2026-04-11-md-vs-mdx-guide`
- **Branch:** `docs/2026-04-11-md-vs-mdx-guide`
- **Key files changed this session:**
  - `docs/FIGMA-MCP-FEATURE-REQUEST.md`
  - `docs/USE-FIGMA-TOOL-GUIDE.md`
  - `docs/DIAGRAM-WORKFLOW.md`
  - `.claude/commands/figma-diagram.md`
  - `dashboard/obsolete.html`
  - `dashboard/diagrams.html`
  - `daemon/server.mjs`
  - `processors/obsolescence-detector.mjs`
  - `scripts/db/migrations/008-action-log.sql` (untracked new file)
- **What's done:** All code changes complete
- **What remains:** Stage and commit the session changes; optionally open a PR to `master`

### DISPATCH-063 — FigmailAPP Figma workflow docs

- **Status:** Dispatch written, not yet applied
- **Location:** `RootDispatcher/dispatches/pending/FigmailAPP/DISPATCH-063-figma-workflow-docs-update.md`
- **What remains:** A FigmailAPP session must pick this up and update 3 docs

### DISPATCH-064 — FigJam batch curation

- **Status:** Dispatch written, not yet started
- **Location:** `RootDispatcher/dispatches/pending/DocuMind/DISPATCH-064-figjam-pending-curation-batch.md`
- **What remains:** User must open standalone FigJam URLs, move content to central board, provide node URLs, then run `/figma-curate` for each

---

## Blockers & External Dependencies

| Blocker                                                 | Waiting on                                           | Unblocked by                                                           |
| ------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| DISPATCH-063 FigmailAPP doc updates                     | FigmailAPP session agent                             | Open a session in FigmailAPP and apply the dispatch                    |
| DISPATCH-064 FigJam curation (9 old redirect diagrams)  | User opening each FigJam redirect URL in browser     | User action: open URL, move to board, share `node-id` URL              |
| 3 RootDispatcher ecosystem diagrams with shared node-id | User: separate and place them on correct board pages | User action: move to correct sections, share individual `node-id` URLs |

---

## State Verification

```bash
# Confirm branch
git branch --show-current
# Expected: docs/2026-04-11-md-vs-mdx-guide

# Confirm session changes are present and uncommitted
git status --short | grep -E "daemon/server.mjs|dashboard/obsolete|dashboard/diagrams|processors/obsolescence"
# Expected: M  daemon/server.mjs, M dashboard/obsolete.html, etc.

# Confirm migration file exists
ls scripts/db/migrations/008-action-log.sql
# Expected: file present

# Confirm dispatch files were written
ls /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/dispatches/pending/FigmailAPP/DISPATCH-063*
ls /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/dispatches/pending/DocuMind/DISPATCH-064*

# Check DocuMind daemon (if running)
curl -s http://localhost:9000/health | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.status, d.version)"
```

---

## Next Session Plan

### Priority 1 — Commit the session changes

```bash
# Stage only the files changed this session (not the mass of pre-existing unstaged .planning/ changes)
git add \
  docs/FIGMA-MCP-FEATURE-REQUEST.md \
  docs/USE-FIGMA-TOOL-GUIDE.md \
  docs/DIAGRAM-WORKFLOW.md \
  .claude/commands/figma-diagram.md \
  dashboard/obsolete.html \
  dashboard/diagrams.html \
  daemon/server.mjs \
  processors/obsolescence-detector.mjs \
  scripts/db/migrations/008-action-log.sql \
  docs/handovers/

git commit -m "feat(figjam+dashboard): fileKey docs, nav bar, archive enhancements, obsolescence filters"
```

### Priority 2 — Restart DocuMind daemon to apply action_log migration

```bash
pm2 restart dvw-documind
# Or from DocuMind dir:
npm run daemon:start
```

Verify: `curl http://localhost:9000/health` returns `200`. The `action_log` table is created at startup automatically.

### Priority 3 — Run DISPATCH-064 (FigJam curation batch)

1. Open central board: `https://www.figma.com/board/L8gOzoOCb90ur2g9fDI9hm/`
2. Check if Ecosystem diagrams (18/19/20) are visible — they should be at `node-id=81-333` area
3. Move each to its correct section; copy individual `?node-id=XXX` URLs
4. Run `/figma-curate` with each name + curated URL
5. For the 9 old redirect URLs: open each link in browser first (creates the file), or regenerate with `/figma-diagram` + `fileKey` (preferred for any2figma diagrams which have no timestamps)

### Priority 4 — Apply DISPATCH-063 in FigmailAPP

Open a session in FigmailAPP and read `RootDispatcher/dispatches/pending/FigmailAPP/DISPATCH-063-figma-workflow-docs-update.md`. Update the 3 docs listed there.

---

## Context & Background

This session was focused on three parallel concerns:

1. **FigJam MCP state update** — A Figma API update resolved the long-standing `generate_diagram` standalone-file limitation. The `fileKey` param now allows rendering into an existing board. This closes Priority 1 of the feature request doc and simplifies the curation workflow for new diagrams (no more mandatory manual move). The dual-URL system (`figjam_url` + `curated_url`) is retained for legacy diagrams.

2. **Dashboard UX** — Two dashboards existed with no navigation link between them. The Obsolete Docs dashboard lacked context for same-named files across repos, had no explanation of why a doc was flagged, and would surface `.mmd` diagram files as "obsolete" incorrectly. The Archive button had no real-world effect beyond a soft dashboard hide.

3. **Cross-repo doc hygiene** — The user wanted to find and update old Figma/Anima docs. Search confirmed no active Anima recommendations remain in DocuMind itself. Two dispatches were created to handle FigmailAPP docs and the FigJam curation backlog.

The graph stack note: Kuzu is referenced in `server.mjs` imports but the user confirmed Kuzu is no longer in the stack (Graphify + Obsidian replaced it). The session did not touch the Kuzu removal — that is separate work.

---

## Useful References

| Item | Value |
| ------ | ------- |
| Central FigJam board | `https://www.figma.com/board/L8gOzoOCb90ur2g9fDI9hm/DVW-Design-Dev-Strategy` |
| Central board file key | `L8gOzoOCb90ur2g9fDI9hm` |
| DocuMind daemon port | `9000` |
| action_log migration | `scripts/db/migrations/008-action-log.sql` |
| DISPATCH-063 | `RootDispatcher/dispatches/pending/FigmailAPP/DISPATCH-063-figma-workflow-docs-update.md` |
| DISPATCH-064 | `RootDispatcher/dispatches/pending/DocuMind/DISPATCH-064-figjam-pending-curation-batch.md` |
| Curated diagram count | 4 of 16 |
| Diagrams needing curation | 12 (3 group A — on board, wrong node-id; 9 group B — old redirect URLs) |
| `ctx.repoRoots` lookup | `ctx.repoRoots.find(r => r.name === repoName)?.path` in `daemon/server.mjs` |
| Archive endpoint | `POST /obsolete/:id/archive` (~line 640 in `daemon/server.mjs`) |
| Scan exclusion | `processors/obsolescence-detector.mjs` ~line 138 (`archivedDocIds` filter) |
