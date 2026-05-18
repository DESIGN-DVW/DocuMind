---

name: figma-diagram
description: "Create a FigJam diagram following the triple output rule (.mmd + .png + FigJam + registry)"
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep, mcp__claude_ai_Figma__generate_diagram, mcp__documind__register_diagram]

---

# /figma-diagram — Create FigJam Diagram (Triple Output)

Create a diagram following the ecosystem triple output standard. Every diagram produces:

1. `.mmd` source file (version-controlled)

2. `.png` preview (for GitHub/PRs/docs)

3. FigJam view (for collaboration)

Read the full standard:
`/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/memory/global-rules.md` (section: Diagrams & Visualization)

---

## Input

The user provides ONE of:

- A description of what to diagram (you create the Mermaid)

- A markdown table, tree, or structure to convert

- An existing `.mmd` file to regenerate

- A Figma URL to a design to diagram

## Step 1 — Create Mermaid Source

Write the `.mmd` file to `docs/diagrams/{name}.mmd` in the current repo.

Supported diagram types: `flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `gantt`, `classDiagram`, `erDiagram`.

Use clear, descriptive node labels. Keep diagrams readable — max ~30 nodes per diagram.

## Step 2 — Generate PNG

```bash

npx -y -p puppeteer -p @mermaid-js/mermaid-cli mmdc -i docs/diagrams/{name}.mmd -o docs/diagrams/{name}.png

```

Verify the PNG was created and is non-empty.

## Step 3 — Generate FigJam

Use `generate_diagram` MCP tool with the Mermaid source content and the central board's `fileKey`.

Extract the `fileKey` from the central board URL documented in `docs/DIAGRAM-WORKFLOW.md` (the segment between `/board/` and the next `/`).

```text
generate_diagram({
  name: "{RepoName} - {Diagram Title}",
  mermaidSyntax: "{contents of .mmd file}",
  userIntent: "{brief description of what this diagram shows}",
  fileKey: "{central-board-file-key}"   // from docs/DIAGRAM-WORKFLOW.md § Central Board
})
```

**Naming convention:** Prefix with repo name: `"{RepoName} - {Diagram Title}"`

The tool renders the diagram into the central FigJam board and returns a URL. Content lands on the board's **default page** — curation to the correct repo page may still be needed.

## Step 4 — Register Diagram

Call the `register_diagram` MCP tool with the absolute path to the `.mmd` file created in Step 1:

```text

register_diagram({
  mermaid_path: "/absolute/path/to/docs/diagrams/{name}.mmd",
  name: "{Diagram Title}",
  repository: "{RepoName}",
  figjam_url: "{figjam_url from Step 3}"  // optional, if FigJam was generated
})

```

The tool:

- Auto-detects `diagram_type` from the `.mmd` content

- Computes SHA-256 `source_hash` for change detection

- Inserts (new) or updates (existing) the entry in the DocuMind `diagrams` table

- Regenerates `docs/diagrams/DIAGRAM-REGISTRY.md` automatically

Report the tool response:

- `action`: `"inserted"` (new diagram), `"updated"` (changed source), or `"unchanged"` (no change detected)

- `diagram_type`: auto-detected type (e.g., `"flowchart"`, `"sequenceDiagram"`)

**Fallback (if MCP unavailable):** Manually add or update the entry in `docs/diagrams/DIAGRAM-REGISTRY.md` (7-column format: Diagram | .mmd | .png | Generated URL | Curated URL | Status | Updated). Note this is a fallback only — the MCP tool is the preferred path.

## Step 5 — Insert FigJam Link

Insert the FigJam link into the relevant markdown document after the diagram/table/code block:

```markdown

> [View in FigJam]({figjam_url})

```

## Step 6 — Report

Print summary:

- `.mmd` path

- `.png` path

- FigJam URL

- Registry action: `{inserted/updated/unchanged}`

- Markdown file updated (if applicable)

Do NOT commit automatically — let the user review first.

---

## Notes

- `register_diagram` auto-detects diagram type and regenerates DIAGRAM-REGISTRY.md — no manual registry editing needed

- If `generate_diagram` fails, still produce `.mmd` + `.png` and note FigJam as pending

- If PNG generation fails (puppeteer issue), try: `npx -y -p puppeteer -p @mermaid-js/mermaid-cli mmdc -i {input} -o {output} --puppeteerConfig '{"args":["--no-sandbox"]}'`

- The FigJam URL now points to the central board (not a standalone file) — use `/figma-curate` to record the final node-level URL once the diagram is placed on the correct page/section
