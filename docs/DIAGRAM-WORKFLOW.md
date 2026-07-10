# FigJam Diagram Registry Workflow

**Version:** 1.0.0
**Created:** 2026-03-27
**Audience:** DVWDesign team members

---

## Overview

The Diagram Registry is the single source of truth for all diagrams across the DVWDesign ecosystem (14+ repositories). It tracks every diagram from creation through curation, ensuring that Mermaid sources stay in sync with their visual representations in FigJam.

Without the registry, diagrams drift: someone updates a `.mmd` file but forgets to regenerate the FigJam view, or a FigJam link in a markdown file points to a deleted standalone file. The registry solves this by centralizing diagram metadata in DocuMind's SQLite database and automatically propagating URL changes across all repositories.

---

## The Triple Output Rule

Every diagram in the ecosystem produces three artifacts plus a registry entry:

| Artifact       | Format            | Location                        | Purpose                                       |

| -------------- | ----------------- | ------------------------------- | --------------------------------------------- |

| Mermaid source | `.mmd`            | `docs/diagrams/` in each repo   | Version-controlled source of truth            |

| PNG preview    | `.png`            | `docs/diagrams/` in each repo   | Inline previews in GitHub, PRs, docs          |

| FigJam view    | FigJam file/board | Figma (see Central Board below) | Interactive collaboration and presentation    |

| Registry entry | SQLite row        | DocuMind `diagrams` table       | Tracking, staleness detection, URL management |

If any one of the three file artifacts is missing, the diagram is incomplete. The registry tracks which pieces exist and flags gaps.

---

## Diagram Lifecycle

A diagram moves through three stages:

### 1. Generated

The diagram has just been created. It has:

- A `.mmd` source file committed to the repo

- A `.png` preview alongside it

- A standalone FigJam file (its own Figma file, not on the central board yet)

- A registry entry in the DocuMind database

At this stage, the FigJam URL points to a standalone file. Markdown files in the repo link to this standalone URL.

### 2. Curated

The diagram has been reviewed and moved to the central FigJam board. This means:

- The standalone FigJam content was copied/moved to the appropriate repo page on the central board

- The registry was updated with the new curated URL

- All markdown references across all repos were automatically rewritten to point to the curated URL

The standalone FigJam file can be deleted after curation.

### 3. Stale

The `.mmd` source file has been modified since the FigJam view was last generated. DocuMind detects this by comparing the SHA-256 hash of the `.mmd` content against the stored `source_hash`. A stale diagram needs regeneration: update the PNG, regenerate or update the FigJam view, and re-register.

---

## Diagram Types

The registry supports seven diagram types. Choose the type that best fits the content — this helps with filtering, dashboard display, and ensures agents pick the right Mermaid syntax.

| Type                 | Mermaid Syntax                             | When to Use                                            | Example Use Cases                                                          |

| -------------------- | ------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------- |

| `flowchart`          | `flowchart TD` / `flowchart LR`            | Process flows, data pipelines, decision logic          | Scan pipeline, API request handling, build process                         |

| `folder_tree`        | `graph TD` with directory/folder nodes     | Repository structure, file organization                | Repo structure, config hierarchy, monorepo layout                          |

| `relationship_graph` | `classDiagram`                             | Entity relationships, module dependencies, inheritance | Document relationships, agent inheritance, package dependencies            |

| `decision_tree`      | `flowchart TD` with diamond decision nodes | Decision logic, troubleshooting guides, routing        | Error handling flow, permission checks, dispatch routing                   |

| `sequence`           | `sequenceDiagram`                          | Interactions over time between actors/systems          | API call chains, MCP tool flows, webhook handshakes                        |

| `state`              | `stateDiagram-v2`                          | Lifecycle stages, status transitions                   | Document lifecycle, diagram lifecycle (generated/curated/stale), PR states |

| `gantt`              | `gantt`                                    | Timelines, schedules, phased work                      | Milestone phases, release schedule, migration plan                         |

### Type auto-detection

The `register_diagram` MCP tool detects the type automatically from Mermaid syntax:

- `sequenceDiagram` in source → `sequence`

- `stateDiagram` in source → `state`

- `gantt` in source → `gantt`

- `classDiagram` in source → `relationship_graph`

- `graph` with folder/directory keywords → `folder_tree`

- Everything else → `flowchart`

If auto-detection picks the wrong type, the `.mmd` syntax can usually be adjusted to match the intended type more clearly.

---

## Pre-configured Destinations

The preferred workflow is for each repo to have a **pre-configured FigJam destination** — a specific section on the central board where its diagrams always land. This eliminates the manual "move to correct section" step after generation.

### How destinations work

The user creates a named Section in FigJam for each repo before agents start generating diagrams. The section's `node-id` is recorded in that repo's agent profile. When the agent generates a diagram, it passes both `fileKey` and `nodeId` — the diagram lands in the designated section immediately.

```text
Agent profile includes:
  figma_destination:
    fileKey: "L8gOzoOCb90ur2g9fDI9hm"
    nodeId:  "234-3965"           ← repo's designated section node-id
```

### Section-scoped access

Each agent reads and writes only to its designated section(s). This provides:

- **Organization:** diagrams are always in the right place from the start
- **Confidentiality:** agents cannot accidentally overwrite another repo's diagrams
- **Auditability:** the registry tracks which agent owns which section

### Agent pre-flight check

Before generating any diagram, the agent reads the DocuMind registry to check current state. This prevents duplicate generation and ensures the agent acts on accurate information.

States to check via `get_diagrams({ repo: "{RepoName}" })`:

| State | Meaning | Agent action |
| --- | --- | --- |
| `curated_url` present | Diagram exists and is placed | Skip generation; regenerate only if `.mmd` changed |
| `stale: 1` | Source changed since last generation | Regenerate and re-curate |
| `curated_url` null | Generated but not yet placed | Curate — do not regenerate |
| No entry | Never generated | Generate and register |

---

## How to Create a Diagram

Use the `/figma-diagram` slash command. The process has six steps, all handled by the command:

### Step 0 -- Pre-flight registry check

Before writing any file, call `get_diagrams` filtered by the current repo to check existing diagram state. If a diagram with the same name already exists and is not stale, skip generation and report its current status instead.

### Step 1 -- Provide input

Give Claude one of:

- A description of what to diagram ("show the data flow from scanner to database")

- A markdown table, tree, or structure to convert

- An existing `.mmd` file path to regenerate

- A Figma URL to a design that should be diagrammed

### Step 2 -- Mermaid source is created

Claude writes a `.mmd` file to `docs/diagrams/{name}.mmd` in the current repo. Supported types: `flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `gantt`, `classDiagram`, `erDiagram`.

### Step 3 -- PNG is generated

The command runs:

```bash

npx -y -p puppeteer -p @mermaid-js/mermaid-cli mmdc \
  -i docs/diagrams/{name}.mmd \
  -o docs/diagrams/{name}.png \
  --puppeteerConfig '{"defaultViewport":{"width":3072,"height":2048,"deviceScaleFactor":2}}'

```

This produces a 2× retina placeholder PNG. It is replaced with a higher-quality Figma export when the diagram is curated (see **How to Curate a Diagram**).

### Step 4 -- FigJam is generated

Claude calls `generate_diagram` with the central board `fileKey` and — when the repo has a pre-configured destination — the `nodeId` of the repo's designated section.

**With pre-configured destination (preferred):**

```text

generate_diagram({
  name: "{RepoName} - {Diagram Title}",
  mermaidSyntax: "{contents of .mmd file}",
  userIntent: "{brief description}",
  fileKey: "{central-board-file-key}",
  nodeId:  "{repo-section-node-id}"    ← from repo agent profile
})

```

The diagram lands directly in the designated section. Curation is then a registry-only step (record the node URL) — no manual move required.

**Without pre-configured destination (fallback):**

Omit `nodeId`. The diagram lands on the central board's default page. Manual placement into the correct section is required before curation.

### Step 5 -- Registry entry is created

Claude calls the `register_diagram` MCP tool, which:

- Auto-detects the diagram type from the `.mmd` content

- Computes a SHA-256 hash for future staleness detection

- Inserts or updates the entry in the DocuMind `diagrams` table

- Regenerates `docs/diagrams/DIAGRAM-REGISTRY.md` automatically

### Step 6 -- Review and commit

The command does NOT auto-commit. Review the generated files, then commit when satisfied.

---

## How to Curate a Diagram

Curation records the final board node URL in the registry and propagates it across all repos. The manual effort depends on whether a pre-configured destination was used at generation time.

### If `nodeId` was used at generation time (preferred)

The diagram is already in the correct section. No board move needed.

1. Open the central board and navigate to the repo's designated section
2. Click the diagram to confirm it landed correctly
3. Copy the `?node-id=XXX` URL from the browser address bar

### If no `nodeId` was used (fallback — default page)

1. Open the central board: `https://www.figma.com/board/L8gOzoOCb90ur2g9fDI9hm/`
2. Locate the diagram on the default page
3. Move it to the correct repo section
4. Copy the new `?node-id=XXX` URL from the browser address bar

### Automated part

Run the `/figma-curate` slash command with:

- The diagram name (as it appears in the registry)

- The new curated URL from the central board

The command handles everything in sequence:

1. Calls `curate_diagram` MCP tool — updates the DB, regenerates `DIAGRAM-REGISTRY.md`, rewrites all markdown references across repos

2. Exports a high-quality PNG from the curated FigJam node via the Figma REST API (`scale=2`) and replaces the mmdc placeholder in `docs/diagrams/{name}.png`

The `curate_diagram` MCP tool itself:

- Updates the `diagrams` table with the curated URL

- Regenerates `docs/diagrams/DIAGRAM-REGISTRY.md` in every affected repo

- Replaces the old standalone URL with the curated URL in all `.md` files across all repos

You can also curate multiple diagrams at once:

```text

/figma-curate
Diagram A -> https://figma.com/board/...
Diagram B -> https://figma.com/board/...

```

After curation, you can safely delete the standalone FigJam file.

---

## How to Update a Diagram

Updating a diagram follows the same flow as creating one. There is no in-place edit — the diagram is regenerated from its `.mmd` source and the user swaps the old shape on the board.

### When to update

- The `.mmd` source has changed (DocuMind marks the diagram as stale)
- The diagram needs structural changes (new nodes, different layout)
- Run `/diagram-registry` to see all stale diagrams

### Update flow

### Step 1 — Regenerate

Run `/figma-diagram` with the existing `.mmd` file path as input. This:

- Overwrites the `.mmd` with the updated content
- Regenerates the `.png` preview
- Calls `generate_diagram` with `fileKey` — new node lands on the central board default page
- Updates `source_hash` in the registry and clears the stale flag

### Step 2 — Swap on the board

The old and new diagrams now coexist on the board.

**If `nodeId` was used:** the new diagram landed in the correct section. Delete the old shape and copy the new `?node-id=XXX` URL.

**If no `nodeId`:** delete the old shape, move the new one into the correct section, then copy the URL.

### Step 3 — Curate

Run `/figma-curate` with the diagram name and new URL:

```text
/figma-curate
{Diagram Name} -> https://www.figma.com/board/L8gOzoOCb90ur2g9fDI9hm/...?node-id=XXX
```

This replaces the old curated URL across all repos automatically, and also exports a fresh Figma PNG to replace the stale one in `docs/diagrams/`.

---

## How to Check Registry Status

Use the `/diagram-registry` slash command to get a full status report. It queries the DocuMind database and cross-checks files on disk.

The report includes:

- **Status counts** -- total, generated, curated, and stale diagrams

- **Pending actions** -- diagrams needing curation, regeneration, or missing files

- **Full table** -- all diagrams with links and status

- **Orphan check** -- `.mmd` or `.png` files on disk that have no registry entry

### Filtering

You can filter the registry query by repository or status:

```text

get_diagrams({ repo: "DocuMind" })
get_diagrams({ stale_only: true })

```

### Dashboard

The DocuMind web dashboard also shows diagram status. Open `http://localhost:9000` in a browser and navigate to the Diagrams tab.

---

## Central Board Organization

All curated diagrams live on a single FigJam board:

**Board URL:** `https://www.figma.com/board/L8gOzoOCb90ur2g9fDI9hm/`

The board is organized as follows:

- **Each repository gets its own Page** (e.g., "DocuMind", "RootDispatcher", "LibraryAssetManager")

- **Within each Page, diagrams are grouped into named Sections** organized by purpose (e.g., "Architecture", "Data Flow", "Deployment")

When curating a new diagram, place it in the correct repo Page and an appropriate Section. Create a new Section if none of the existing ones fit.

---

## Where Things Live

Quick reference for locating diagram artifacts:

| What | Where |

| --- | --- |

| Mermaid source (`.mmd`) | `docs/diagrams/` in each repository |

| PNG preview (`.png`) | `docs/diagrams/` in each repository — initially mmdc 2× retina; replaced by Figma export on curation |

| Registry database | DocuMind SQLite at `data/documind.db`, table `diagrams` |

| Registry snapshot | `docs/diagrams/DIAGRAM-REGISTRY.md` in each repo (auto-generated, do not edit) |

| Central FigJam board | `https://www.figma.com/board/L8gOzoOCb90ur2g9fDI9hm/` |

| Web dashboard | `http://localhost:9000` -- Diagrams tab |

---

## API and MCP Access

For programmatic or agent-driven access, diagrams are available through three channels:

### REST API

```bash

# Get all diagrams

curl http://localhost:9000/diagrams

# Filter by repo

curl http://localhost:9000/diagrams?repo=DocuMind

# Get stale diagrams only

curl http://localhost:9000/diagrams?stale=true

```

### MCP Tools

| Tool               | Purpose                                                     |

| ------------------ | ----------------------------------------------------------- |

| `get_diagrams`     | Query the registry (optional filters: `repo`, `stale_only`) |

| `register_diagram` | Register or update a diagram entry                          |

| `curate_diagram`   | Set curated URL and propagate across all repos              |

### Response Shape

The `get_diagrams` response contains these key fields per diagram:

```json

{
  "id": 1,
  "name": "DocuMind Architecture",
  "mermaid_path": "/absolute/path/to/file.mmd",
  "figjam_url": "https://www.figma.com/...",
  "curated_url": null,
  "diagram_type": "flowchart",
  "source_hash": "abc123def...",
  "stale": 0,
  "active_url": "https://www.figma.com/...",
  "repository": "DocuMind"
}

```

Notes on the response:

- `active_url` is a computed field: it returns `curated_url` if set, otherwise `figjam_url`

- There is no `status` string field -- derive it: `curated_url` present = curated, `stale = 1` = stale, otherwise = generated

- There is no `png_path` field -- derive it from `mermaid_path` by replacing `.mmd` with `.png`

---

## Troubleshooting

### PNG generation fails

This is usually a Puppeteer/Chromium issue. Try adding the no-sandbox flag:

```bash

npx -y -p puppeteer -p @mermaid-js/mermaid-cli mmdc -i docs/diagrams/{name}.mmd -o docs/diagrams/{name}.png --puppeteerConfig '{"args":["--no-sandbox"]}'

```

If Chromium is not installed, Puppeteer should download it automatically on first run. On some systems you may need to install system dependencies for headless Chrome.

### Diagram not showing in the registry

The diagram was likely created manually without calling `register_diagram`. Run `/figma-diagram` with the existing `.mmd` file as input, or call the `register_diagram` MCP tool directly with the file path.

### Diagram shows as stale

The `.mmd` source was modified after the last registration. To resolve:

1. Run `/figma-diagram` with the updated `.mmd` file to regenerate the PNG and FigJam view

2. The `register_diagram` call will update the `source_hash` and clear the stale flag

### FigJam link is broken after curation

The markdown files may still reference the old standalone URL. Run `/figma-curate` with the diagram name and the correct curated URL. The tool will find and replace all old URL references across all repositories.

### Orphaned files on disk

If `/diagram-registry` reports orphaned `.mmd` or `.png` files (files with no registry entry), either register them with `register_diagram` or delete them if they are no longer needed.

### MCP server is unavailable

If the DocuMind daemon is not running, the MCP tools will not respond. As a fallback:

- Read `docs/diagrams/DIAGRAM-REGISTRY.md` directly (it is a snapshot and may be slightly out of date)

- Start the daemon with `npm run daemon:start` from the DocuMind directory
