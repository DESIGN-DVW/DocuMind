# Diagram Registry Audit

**Date:** 2026-03-27
**Auditor:** DocuMind automated scan
**Scope:** All DVWDesign repositories

---

## Summary

- **11** `.mmd` files found on disk across 4 repositories
- **10** registered in the `diagrams` database table
- **1** unregistered `.mmd` file (DocuMind's own workflow diagram)
- **12** `.png` renders found; all have valid file sizes (no zero-byte files)
- **1** orphaned `.png` with no `.mmd` source (GlossiaApp)
- **Node version mismatch** prevents database access from CLI

---

## Inventory: All .mmd Files on Disk

| Repository          | File                                                 | Registered | Has PNG      | Has FigJam | Has Curated URL |
| ------------------- | ---------------------------------------------------- | ---------- | ------------ | ---------- | --------------- |
| DocuMind            | `docs/diagrams/documind-workflow.mmd`                | NO         | Yes (67 KB)  | --         | --              |
| RootDispatcher      | `docs/diagrams/dispatch-005-workflow.mmd`            | Yes        | Yes (56 KB)  | Yes        | Yes             |
| RootDispatcher      | `docs/diagrams/shared-packages-repo-structure.mmd`   | Yes        | Yes (85 KB)  | Yes        | Yes             |
| RootDispatcher      | `docs/diagrams/agent-organization-base.mmd`          | Yes        | Yes (149 KB) | Yes        | Yes             |
| RootDispatcher      | `docs/diagrams/repo-specific-agents-inheritance.mmd` | Yes        | Yes (73 KB)  | Yes        | Yes             |
| any2figma           | `docs/diagrams/architecture-data-flow.mmd`           | Yes        | Yes (16 KB)  | Yes        | No              |
| any2figma           | `docs/diagrams/ast-schema.mmd`                       | Yes        | Yes (50 KB)  | Yes        | No              |
| any2figma           | `docs/diagrams/pipeline-6-pass.mmd`                  | Yes        | Yes (89 KB)  | Yes        | No              |
| any2figma           | `docs/diagrams/html-parser-flow.mmd`                 | Yes        | Yes (52 KB)  | Yes        | No              |
| any2figma           | `docs/diagrams/emitter-outputs.mmd`                  | Yes        | Yes (28 KB)  | Yes        | No              |
| LibraryAssetManager | `docs/diagrams/image-analyzer-pipeline.mmd`          | Yes        | Yes (74 KB)  | Yes        | No              |

## Orphaned PNG Files (No .mmd Source)

| Repository | File                                               | Size   | Notes                                          |
| ---------- | -------------------------------------------------- | ------ | ---------------------------------------------- |
| GlossiaApp | `docs/02-architecture/diagrams/GlossiaAppFlow.png` | 192 KB | No `.mmd` source exists; not in diagrams table |

## Repositories with No Diagrams

| Repository      | .mmd Files | .png Files       | Notes                        |
| --------------- | ---------- | ---------------- | ---------------------------- |
| CampaignManager | 0          | 0                | No diagrams directory        |
| GlossiaApp      | 0          | 1 (orphaned PNG) | Has PNG but no `.mmd` source |

---

## Gap Analysis

### Gap 1: DocuMind Workflow Not Registered

**File:** `/Users/Shared/htdocs/github/DVWDesign/DocuMind/docs/diagrams/documind-workflow.mmd`
**Status:** Exists on disk with valid PNG render (67,772 bytes), but not in the `diagrams` table.

**Root cause:** The file was likely created manually or by an earlier process before the diagram registry was implemented. The mermaid processor's `generateDiagram()` function handles registration, but this file was never passed through it.

**Recommended action:**

```sql
INSERT INTO diagrams (
  diagram_type, name, mermaid_path, repository, generated_at, source_hash, stale
) VALUES (
  'flowchart',
  'DocuMind Workflow',
  '/Users/Shared/htdocs/github/DVWDesign/DocuMind/docs/diagrams/documind-workflow.mmd',
  'DocuMind',
  datetime('now'),
  -- compute SHA-256 of file content at registration time --
  '',
  0
);
```

Alternatively, trigger a scan via the daemon: `POST http://localhost:9000/scan { "repo": "DocuMind" }` after fixing the Node version issue.

### Gap 2: any2figma Diagrams Missing Curated URLs

Five any2figma diagrams have FigJam URLs but no curated URLs, meaning they have not been moved to the central FigJam board. Same for the LibraryAssetManager diagram.

**Recommended action:** Run the `/figma-curate` slash command or manually set `curated_url` via the relink processor.

### Gap 3: GlossiaApp Orphaned PNG

A PNG file exists at `GlossiaApp/docs/02-architecture/diagrams/GlossiaAppFlow.png` (192 KB) with no corresponding `.mmd` source. This diagram is not in the registry.

**Recommended action:** Either reverse-engineer a `.mmd` source from the PNG content, or create a new `.mmd` file and register it. The PNG appears to be a legitimate architecture diagram that should be tracked.

### Gap 4: CampaignManager Has No Diagrams

No `.mmd` or `.png` files exist in the CampaignManager repository.

**Recommended action:** Determine if CampaignManager needs architecture or workflow diagrams. If so, generate them via the mermaid processor.

---

## Node Version Issue

```text
Current Node.js:    v22.14.0 (NODE_MODULE_VERSION 127)
better-sqlite3:     compiled for NODE_MODULE_VERSION 137
```

The `better-sqlite3` native module was compiled against a newer Node.js version than what is currently active. This prevents any direct database access from Node.js scripts.

**Impact:** The daemon cannot start, scans cannot run, and diagram registration via the mermaid processor is blocked.

**Recommended action:**

```bash
cd /Users/Shared/htdocs/github/DVWDesign/DocuMind
npm rebuild better-sqlite3
```

This will recompile the native module for the current Node v22.14.0. No other dependency changes are needed.

---

## Action Priority

| Priority | Action | Effort |
| --- | --- | --- |
| 1 (blocking) | Run `npm rebuild better-sqlite3` to fix Node version mismatch | 1 min |
| 2 (high) | Register `documind-workflow.mmd` in diagrams table | 2 min |
| 3 (medium) | Curate any2figma + LibraryAssetManager FigJam URLs | 10 min |
| 4 (low) | Create `.mmd` source for GlossiaApp `GlossiaAppFlow.png` | 15 min |
| 5 (low) | Evaluate CampaignManager diagram needs | 5 min |
