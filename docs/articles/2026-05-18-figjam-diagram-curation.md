# FigJam Diagram Curation — LinkedIn & Blog

**Date:** 2026-05-18
**Topic:** Diagram workflow — triple output, curation, Figma PNG export

---

## LinkedIn Post

We manage documentation across 14+ repositories. Every architecture decision, data flow, and agent handoff needs a diagram. And for months, those diagrams were scattered — standalone FigJam files, stale PNGs in repos, markdown links pointing at deleted boards.

We fixed it by building a diagram registry directly into our documentation system.

**The triple output rule:** every diagram produces three things in one command:

1. A `.mmd` source file — version-controlled, diffable, the source of truth

2. A `.png` preview — for GitHub, PRs, and inline docs

3. A FigJam board entry — for collaboration and presentation

The key insight was treating the FigJam board like a database table, not a canvas. Every diagram gets a stable node URL. When the Figma MCP updated `generate_diagram` to accept a `fileKey`, we could finally land diagrams directly onto a central board instead of creating a new standalone file each time.

Curation is the last step: once a diagram is placed in the right board section, one command rewrites every markdown reference across all 14 repos simultaneously. The registry tracks both the generated URL and the curated URL — so links never break.

And for PNG quality — we discovered the Figma REST API exports node content at up to 4× scale. 185kb from Figma vs 22kb from Mermaid CLI. The difference is immediately visible.

The whole system runs as a background daemon, detects stale diagrams automatically, and exposes an MCP interface so agents can query, register, and curate diagrams without touching the file system.

Docs that stay in sync with code aren't magic. They're a pipeline.

---

## Blog Article

### Keeping Architecture Diagrams Alive Across 14 Repositories

### The problem with diagrams

Architecture diagrams have a half-life. The day they're created, they're accurate. A week later, someone changes a service name. A month later, a whole layer is removed. The diagram is still there — just wrong.

We had this problem across 14+ repositories. Each repo had its own collection of `.mmd` Mermaid source files, PNGs that were generated once and never regenerated, and FigJam links that pointed to standalone files that had since been deleted or superseded.

The fix wasn't a new tool. It was a registry.

---

### The triple output rule

Every diagram in our ecosystem now produces three artifacts:

| Artifact       | Format         | Purpose                                         |

| -------------- | -------------- | ----------------------------------------------- |

| Mermaid source | `.mmd`         | Version-controlled, diffable source of truth    |

| PNG preview    | `.png`         | GitHub, PRs, inline markdown                    |

| FigJam view    | Board node URL | Collaboration, presentation, stakeholder review |

A fourth entry — a row in DocuMind's SQLite database — ties them together. It stores the source hash, the generated URL, the curated URL, and a staleness flag. When the `.mmd` changes, the staleness flag flips. When the PNG or FigJam view is regenerated, the hash updates.

The command that drives all of this is `/figma-diagram`. It writes the `.mmd`, generates the PNG, calls the Figma MCP, registers the entry, and prints a summary. One command, four artifacts.

---

### The fileKey breakthrough

For most of 2025, the `generate_diagram` Figma MCP tool had a significant limitation: every call created a new standalone FigJam file. Diagrams accumulated across dozens of disconnected files. Curation — moving content to a central board — was fully manual.

In May 2026, the tool gained a `fileKey` parameter. Pass the key of an existing FigJam board, and the diagram renders directly into that file. For us, this meant:

```text

generate_diagram({
  name: "RootDispatcher - Ecosystem Architecture",
  mermaidSyntax: "...",
  fileKey: "L8gOzoOCb90ur2g9fDI9hm"
})

```

The diagram lands on the central board's default page. Curation is still needed to move it to the right section and record the node-level URL — but the mandatory manual copy step is gone for new diagrams.

---

### Curation: stable URLs across all repos

Curation is what makes the registry useful long-term. Once a diagram is placed on the board in the correct section, `/figma-curate` takes the final node URL and propagates it everywhere:

```text

/figma-curate
Ecosystem Architecture -> https://www.figma.com/board/{fileKey}/...?node-id=184-327

```

Under the hood, this calls the `curate_diagram` MCP tool, which:

1. Updates the `diagrams` table with the curated URL

2. Regenerates `DIAGRAM-REGISTRY.md` in every affected repo

3. Replaces the old URL with the new one in every `.md` file across all 14 repos

A diagram that was referenced in eight markdown files across four repos gets all eight references updated in a single call. No grep-and-replace. No missed files.

---

### High-quality PNGs from the Figma REST API

The Mermaid CLI produces functional PNGs — but at default resolution, they're barely legible at full-page width. We'd been living with this tradeoff for months.

The solution was already in our stack. The Figma REST API's `/v1/images/` endpoint exports any node as a PNG at up to 4× scale:

```bash

GET https://api.figma.com/v1/images/{fileKey}?ids={nodeId}&scale=2&format=png
X-Figma-Token: {FIGMA_PAT}

```

The response is a short-lived S3 URL. Download it, write it to `docs/diagrams/{name}.png`, and the mmdc placeholder is gone. 185kb vs 22kb. The difference is immediately visible in a PR diff.

We wired this into the curation step. When `/figma-curate` runs, it now calls `scripts/export-figma-png.mjs` after the registry update. The curated PNG reflects the actual FigJam board state — not a Mermaid CLI approximation.

```javascript

// The two-step Figma export pattern
const res = await fetch(
  `https://api.figma.com/v1/images/${fileKey}?ids=${apiNodeId}&scale=2&format=png`,
  { headers: { 'X-Figma-Token': FIGMA_PAT } }
);
const { images } = await res.json();
const buffer = Buffer.from(await fetch(images[apiNodeId]).then(r => r.arrayBuffer()));
writeFileSync(outputPath, buffer);

```

Two fetches: one to get the export URL, one to download the image. The whole script is under 75 lines.

---

### What we can read from FigJam — and what we can't do yet

One thing we tested during this work: can we modify an existing FigJam shape in place? We used the `get_figjam` MCP tool to read a specific node:

```text

get_figjam(fileKey: "XdjRFvolvmPXAlNsF7So3g", nodeId: "11:736")

→ <shape-with-text id="11:736" x="528" y="384" width="224" height="128">
     Format Detection
   </shape-with-text>

```

We can read position, size, content, and type. What we can't do yet: write back to that node. `generate_diagram` is create-only — no in-place update. For diagram updates, the workflow is regenerate → user swaps old shape → curate new node URL. Not seamless, but auditable and reversible.

---

### The result

Sixteen diagrams registered. Four fully curated with stable node URLs. Twelve in progress. Staleness detection running on every scan. PNGs that are actually legible.

The system doesn't prevent diagrams from going stale — that's a people problem. But it makes the staleness visible, the update path clear, and the propagation automatic. That's enough to make the habit stick.
