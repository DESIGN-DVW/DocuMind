---

name: diagram-registry
description: "View and manage the Diagram Registry — check status, pending relinks, stale diagrams"
allowed-tools: [Bash, Read, Edit, Glob, Grep, mcp__documind__get_diagrams]

---

# /diagram-registry — Diagram Registry Manager

View and manage diagrams across the DVWDesign ecosystem. Retrieves live data from the DocuMind `diagrams` table via MCP, then cross-checks files on disk.

Read the registry standard:
`/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/memory/global-rules.md` (section: Diagram Registry)

---

## Step 1 — Query DocuMind

Call the `get_diagrams` MCP tool to retrieve all diagrams:

```text

get_diagrams()  — no params returns all diagrams across all repos

```

The response shape is:

```json

{
  "total": 12,
  "diagrams": [
    {
      "id": 1,
      "name": "DocuMind Architecture",
      "mermaid_path": "/absolute/path/to/file.mmd",
      "figjam_url": "https://www.figma.com/...",
      "curated_url": null,
      "diagram_type": "flowchart",
      "source_hash": "abc123",
      "stale": 0,
      "is_stale": 0,
      "active_url": "https://www.figma.com/...",
      "generated_at": "2026-03-22T10:00:00Z",
      "repository": "DocuMind"
    }
  ]
}

```

### Key fields:

- `mermaid_path` — absolute path to `.mmd` file (not `mmd_path`)

- `figjam_url` — the generated FigJam URL (not `generated_url`)

- `active_url` — computed: `curated_url ?? figjam_url` (the URL to use in docs)

- `stale` — boolean (0/1), `is_stale` — same as computed alias

- No `png_path` field — derive PNG path from `mermaid_path` by replacing `.mmd` with `.png`

- No `status` string field — derive status from: `curated_url` present → "curated", `stale = 1` → "stale", else → "generated"

**Fallback (if MCP unavailable):** Read `docs/diagrams/DIAGRAM-REGISTRY.md` directly and parse the markdown table. Note this is a generated snapshot and may be stale.

## Step 2 — Parse and Display

Derive all counts and status from the `diagrams` array in the MCP response.

### Status Counts

Derive status from response fields (there is no `status` string — compute it):

- **Total** — `diagrams.length`

- **Generated** — entries where `curated_url` is null AND `stale === 0`

- **Curated** — entries where `curated_url` is not null

- **Stale** — entries where `stale === 1` (or `is_stale === 1`)

### Pending Actions

List diagrams that need attention (derived from MCP response fields):

- `curated_url` is null AND `stale === 0` → needs curation (move to central board, then `/figma-curate`)

- `stale === 1` → needs regeneration (source `.mmd` changed)

- PNG file missing (derive from `mermaid_path` replacing `.mmd` → `.png`) → needs PNG regeneration

- `figjam_url` is null → needs `generate_diagram`

### Full Table

Display the diagrams array as a formatted table with clickable links.

## Step 3 — Cross-check Files

Use `mermaid_path` from the MCP response to verify files exist on disk. Derive PNG path by replacing `.mmd` with `.png`:

```bash

# For each diagram in the MCP response:

ls "{mermaid_path}"                              # verify .mmd file exists
ls "{mermaid_path%.mmd}.png"                     # verify .png file exists (derived)

```

Also check for orphaned files — `.mmd` or `.png` files in `docs/diagrams/` that have no corresponding DB entry.

## Step 5 — Suggest Actions

Based on findings, suggest:

- `/figma-diagram` for missing diagrams or stale entries

- `/figma-curate` for pending curations (curated_url is null)

- Regeneration commands for stale entries

---

## Notes

- The DocuMind `diagrams` table is the single source of truth for diagram data

- `docs/diagrams/DIAGRAM-REGISTRY.md` is a generated snapshot — do not edit it manually

- DocuMind regenerates DIAGRAM-REGISTRY.md automatically when `register_diagram` is called

- To filter by repo: `get_diagrams({ repo: "DocuMind" })`

- To see only stale diagrams: `get_diagrams({ stale_only: true })`
