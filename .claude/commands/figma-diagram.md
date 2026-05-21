---

name: figma-diagram
description: "Create a FigJam diagram following the triple output rule (.mmd + .png + FigJam + registry)"
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep, mcp__claude_ai_Figma__generate_diagram, mcp__documind__register_diagram, mcp__documind__get_diagrams]

---

# /figma-diagram — Create FigJam Diagram (Triple Output)

Create a diagram following the ecosystem triple output standard. Every diagram produces:

1. `.mmd` source file (version-controlled)

2. `.png` preview (for GitHub/PRs/docs)

3. FigJam view (for collaboration)

Read the full standard:
`/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/memory/global-rules.md` (section: Diagrams & Visualization)

---

## Step 0 — Pre-flight registry check

Before writing any file, call `get_diagrams({ repo: "{CurrentRepoName}" })` to read the current diagram state for this repo.

| Registry state                                    | Agent action                                  |
| ------------------------------------------------- | --------------------------------------------- |
| Diagram exists, `stale: 0`, `curated_url` present | Skip — diagram is current. Report its status. |
| Diagram exists, `stale: 1`                        | Proceed — source changed, regeneration needed |
| Diagram exists, `curated_url` null                | Remind user to curate — do not regenerate     |
| No entry found                                    | Proceed — first generation                    |

Also confirm the repo's `nodeId` destination is known before proceeding to Step 3.

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

npx -y -p puppeteer -p @mermaid-js/mermaid-cli mmdc \
  -i docs/diagrams/{name}.mmd \
  -o docs/diagrams/{name}.png \
  --puppeteerConfig '{"defaultViewport":{"width":3072,"height":2048,"deviceScaleFactor":2}}'

```

Verify the PNG was created and is non-empty. This is a placeholder at 2× retina resolution — it will be replaced with a higher-quality Figma export when the diagram is curated via `/figma-curate`.

## Step 3 — Generate FigJam

Use `generate_diagram` MCP tool. The diagram lands on the `nodeId` provided by the user or the repo's agent profile — not the board's default page.

Read the repo's allowed page IDs from `docs/DIAGRAM-WORKFLOW.md § Central Board` or from the user. Then call:

```text

generate_diagram({
  name: "{RepoName} - {Diagram Title}",
  mermaidSyntax: "{contents of .mmd file}",
  userIntent: "{brief description of what this diagram shows}",
  fileKey: "{central-board-file-key}",
  nodeId:  "{repo-section-node-id}"    // from repo's allowed page IDs — required
})

```

**Naming convention:** Prefix with repo name: `"{RepoName} - {Diagram Title}"`

The diagram renders into the repo's designated section on the central board. No post-generation move is needed — the landing destination is the final location.

If no `nodeId` is configured for this repo yet, omit it and flag to the user that a destination section needs to be created before the next diagram.

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

- If PNG generation fails (puppeteer issue), try: `npx -y -p puppeteer -p @mermaid-js/mermaid-cli mmdc -i {input} -o {output} --puppeteerConfig '{"args":["--no-sandbox"],"defaultViewport":{"width":3072,"height":2048,"deviceScaleFactor":2}}'`

- The FigJam URL points to the repo's designated section on the central board — use `/figma-curate` to record the node-level URL in the registry. If `nodeId` was used at generation time, the diagram is already in the correct location; curation is registry-only (no board move needed)
