---

name: figma-curate
description: "Relink a diagram after curation — update DB, registry snapshot, and all markdown references with the curated FigJam URL via the curate_diagram MCP tool"
allowed-tools: [Read, Edit, Glob, Grep, mcp__documind__get_diagrams, mcp__documind__curate_diagram]

---

# /figma-curate — Relink Curated Diagram

After you've moved a standalone FigJam diagram into the central board, use this command to update all references with the new curated URL.

The `curate_diagram` MCP tool handles the full pipeline in one call: DB update, DIAGRAM-REGISTRY.md snapshot regeneration, and cross-repo markdown URL propagation.

---

## Input

The user provides:

- **Diagram name** — as it appears in the diagram registry

- **Curated URL** — the new FigJam URL from the central board

## Step 1 — Validate

1. Call `get_diagrams` MCP tool (filter by the provided diagram name, or call without filter and find the entry).

2. Confirm the diagram exists and has status `generated` (not already curated).

3. Show the current Generated URL and ask for confirmation before proceeding.

**Fallback:** If the MCP server is unavailable, read `docs/diagrams/DIAGRAM-REGISTRY.md` locally to find the diagram entry and confirm status.

## Step 2 — Curate via MCP

Call `curate_diagram` with the diagram name and curated URL:

```text

curate_diagram(
  name: "{diagram_name}",
  curated_url: "{curated_url}"
)

```

This single call handles everything:

- Updates the DocuMind `diagrams` table (sets curated URL, status → `curated`)

- Regenerates the `docs/diagrams/DIAGRAM-REGISTRY.md` snapshot in every affected repo

- Replaces the old Generated URL with the Curated URL in all `.md` files across all repos

The tool returns:

```text

{
  success: true,
  diagram: { name, curated_url, status: "curated", ... },
  propagation: { markdown_files_updated: N, repos_affected: [...] }
}

```

## Step 3 — Report

Print summary using the tool response:

- Diagram name

- Old URL (from validation step) → New URL

- Markdown files updated (from `propagation.markdown_files_updated`)

- Repos affected (from `propagation.repos_affected`)

- Reminder: "You can safely delete the standalone FigJam file now"

---

## Bulk Mode

If the user provides multiple mappings, process them as a loop of `curate_diagram` calls:

```text

/figma-curate
Diagram A → https://figma.com/board/...
Diagram B → https://figma.com/board/...

```

For each mapping, call `curate_diagram` in sequence and collect results. Report a combined summary at the end showing total markdown files updated and all repos affected.

---

## Notes

- `curate_diagram` handles the full pipeline: DB update, DIAGRAM-REGISTRY.md regeneration, and cross-repo markdown URL propagation in one call.

- The old standalone FigJam file can be deleted after curation — it's redundant.

- If you're unsure of the diagram name, run `/diagram-registry` first or call `get_diagrams` without a filter.
