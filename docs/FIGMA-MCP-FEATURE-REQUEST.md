# Figma MCP Feedback: Diagram Lifecycle Gaps and `use_figma` as Workaround

**Author:** DVWDesign
**Date:** 2026-03-27
**Context:** Production ecosystem using Figma MCP (Claude AI remote server + figma-desktop local server) to manage 10+ FigJam diagrams across 14 repositories

---

## Summary

The Figma MCP has strong read capabilities and a powerful general-purpose write tool (`use_figma`). However, the **diagram-specific tools** lack lifecycle support: `generate_diagram` always creates a new standalone file and cannot update an existing one. This forces teams managing diagram collections into a manual curation workflow and significant external infrastructure.

We've investigated `use_figma` as a workaround and document both the gaps and the path forward below.

---

## API Landscape: REST vs Plugin vs MCP

Understanding which layer limits what is critical. The Figma ecosystem has three API tiers:

### Figma REST API (most restricted for writes)

| Can Write                                   | Cannot Write                        |
| ------------------------------------------- | ----------------------------------- |
| Comments (create, delete)                   | Files (create, modify, delete)      |
| Variables (Enterprise only, bulk CRUD)      | Design nodes (frames, shapes, text) |
| Dev Resources (bulk create, update, delete) | Components, styles, pages           |
| Webhooks (create, update, delete)           | Auto layout, constraints, images    |

The REST API is fundamentally read-oriented for design content. The `file_content:write` scope exists internally but is not publicly available.

### Figma Plugin API (full write access, requires open file)

Can create, modify, and delete any object in an open Figma/FigJam file: frames, text, stickies, connectors, components, variables, styles, pages. **Constraint:** requires the Figma editor to be running with the file open.

### Figma MCP (bridges the gap via `use_figma`)

| Tool                           | Operation             | Target                 |
| ------------------------------ | --------------------- | ---------------------- |
| `get_design_context`           | Read                  | Design files           |
| `get_screenshot`               | Read                  | Any file               |
| `get_metadata`                 | Read                  | Any file               |
| `get_figjam`                   | Read                  | FigJam files           |
| `get_variable_defs`            | Read                  | Design files           |
| `search_design_system`         | Read                  | Libraries              |
| `get_code_connect_map`         | Read                  | Code Connect           |
| `get_code_connect_suggestions` | Read                  | Code Connect           |
| `create_new_file`              | **Create**            | New file (drafts)      |
| `generate_diagram`             | **Create**            | New FigJam file        |
| `add_code_connect_map`         | **Create**            | Code Connect mapping   |
| `send_code_connect_mappings`   | **Create/Overwrite**  | Code Connect (bulk)    |
| `use_figma`                    | **Read/Write/Delete** | Any object in any file |

The `use_figma` tool executes arbitrary Plugin API JavaScript against any file via `fileKey`. It is the most powerful tool in the set but requires crafting raw JS code for each operation.

**Desktop server (`figma-desktop`):** Read-only. No write tools available.

---

## The Specific Problem: `generate_diagram` Lifecycle

`generate_diagram` accepts `name`, `mermaidSyntax`, and `userIntent`. It always creates a **new standalone FigJam file** and returns a URL. There is:

- No `fileKey` parameter to target an existing file
- No way to update a previously generated diagram in-place
- No way to generate into a specific page/section of an existing board

### What this means in practice

1. **Every diagram update creates a new file.** When Mermaid source changes, we generate a new FigJam file. The old one becomes orphaned. URLs break.

2. **Curation is entirely manual.** We maintain a central FigJam board organized by repository. Moving a diagram from its standalone file to the board requires manual copy/paste in the Figma UI.

3. **Two URL states per diagram.** We track both the `figjam_url` (standalone, from `generate_diagram`) and `curated_url` (central board, set after manual curation). All markdown references must be updated when curating.

4. **No file deletion via any API.** After curation, standalone files accumulate. Neither the REST API, Plugin API, nor MCP can delete files.

5. **No divergence detection.** If someone edits a diagram directly in FigJam, we cannot detect the change programmatically to sync back to the `.mmd` source.

---

## `use_figma` as a Workaround

`use_figma` can execute Plugin API code against any file. This theoretically enables:

### What `use_figma` CAN solve

| Gap                             | `use_figma` Approach                                 | Feasibility                                                                |
| ------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Update diagram in existing file | Clear old nodes, recreate from Mermaid               | Possible but complex — must replicate `generate_diagram`'s rendering logic |
| Add diagram to central board    | Create nodes on a specific page/section of the board | Possible — needs page ID and section coordinates                           |
| Read FigJam content for diff    | Query node tree via Plugin API                       | Possible — `figma.currentPage.children` etc.                               |
| Verify curation placement       | Check if expected nodes exist on target page         | Possible                                                                   |

### What `use_figma` CANNOT solve

| Gap                                    | Why Not                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Delete standalone FigJam files         | File deletion is not in the Plugin API — it operates within a file, not on files                                |
| Cross-file content move                | Plugin API operates on one file at a time; `use_figma` takes a single `fileKey`                                 |
| Background/batch operations            | Each `use_figma` call targets one file; no batch mode                                                           |
| Reproduce `generate_diagram` rendering | The Mermaid-to-FigJam rendering logic is internal to `generate_diagram`; recreating it in raw JS is non-trivial |

### The practical barrier

The biggest obstacle to using `use_figma` for diagram updates is that `generate_diagram` contains proprietary Mermaid-to-FigJam rendering logic (node layout, connector routing, styling). Reproducing this in raw Plugin API JavaScript would be fragile and would diverge from Figma's own rendering as they update it.

**The simplest fix would be adding a `fileKey` parameter to `generate_diagram`** so it can render into an existing file instead of always creating a new one.

---

## What We Built to Compensate

### External diagram registry

A SQLite database tracking every diagram with dual URLs, source hashes, and staleness detection. Two custom MCP tools (`register_diagram`, `curate_diagram`) manage metadata and propagate URL changes across 14 repositories.

### URL propagation system

When a diagram is curated, our system walks all markdown files across all repos and replaces old URLs with new ones — the kind of operation that wouldn't be needed if `generate_diagram` could update in-place.

### Triple output standard

Every diagram produces `.mmd` (version-controlled source), `.png` (static preview), and FigJam (interactive). We maintain all three independently because we cannot rely on programmatic sync between them.

Full technical details: [DIAGRAM-WORKFLOW.md](DIAGRAM-WORKFLOW.md)

---

## Feature Requests (Revised)

### Priority 1: Add `fileKey` to `generate_diagram`

Allow `generate_diagram` to accept an optional `fileKey` (and optionally `pageId` or `sectionId`) to render into an existing FigJam file instead of always creating a new one.

**Impact:** Eliminates orphaned files, preserves URLs, removes the need for dual URL tracking and propagation. This single change would eliminate ~70% of our external infrastructure.

### Priority 2: `generate_diagram` with board targeting

Extend the above to support rendering into a specific page or section of a FigJam board. Parameters like `fileKey` + `pageId` + `sectionName` would allow direct-to-board generation.

**Impact:** Eliminates the manual curation step entirely.

### Priority 3: File deletion endpoint

Add a REST API endpoint or MCP tool to delete Figma/FigJam files. This is the only CRUD operation missing from every API tier.

**Impact:** Enables automated cleanup of orphaned standalone files.

### Priority 4: Richer `get_figjam` content

Return actual node content (text, connector labels, sticky content) from `get_figjam`, not just structural metadata. This would enable divergence detection between `.mmd` source and FigJam content.

**Impact:** Enables two-way sync and automated staleness detection.

---

## Summary: What's Missing Where

| Operation                  | REST API | Plugin API       | MCP Dedicated Tool     | MCP via `use_figma` |
| -------------------------- | -------- | ---------------- | ---------------------- | ------------------- |
| Create new file            | No       | No               | `create_new_file`      | No                  |
| Create diagram             | No       | Yes (manual)     | `generate_diagram`     | Possible (complex)  |
| Update diagram in-place    | No       | Yes              | **Missing**            | Possible (complex)  |
| Render into existing board | No       | Yes              | **Missing**            | Possible            |
| Delete file                | No       | No               | **Missing**            | **Not possible**    |
| Read FigJam content        | Partial  | Yes              | `get_figjam` (limited) | Yes                 |
| Move content between files | No       | No (single file) | **Missing**            | **Not possible**    |

The core issue is that `generate_diagram` is a convenience tool that handles the hard part (Mermaid rendering) but lacks lifecycle parameters. The general-purpose `use_figma` has the write access but not the rendering logic. The gap between them is where all our workarounds live.

---

## Additional Barriers Discovered During Investigation

### `generate_diagram` returns redirect URLs, not file keys

The URLs returned by `generate_diagram` are not persistent file references:

```text
https://www.figma.com/online-whiteboard/create-diagram/d3b296e5-...?utm_source=claude
```

These are one-time redirect URLs that create the FigJam file when first opened. They do not contain a `fileKey` that `use_figma` or `get_figjam` can target. This means even if `use_figma` could update FigJam content, there is no programmatic way to get the actual file key of a diagram created by `generate_diagram` without a human opening the link first.

**Implication:** `generate_diagram` is currently a fire-and-forget tool. Once the diagram is created, there is no API path back to it.

### Figma plan/seat constraints on the central board

Our central FigJam board lives under a Starter plan with a View seat. The `use_figma` tool requires a Full seat to write. Even read operations via `get_figjam` failed on this board. Enterprise org files (DDB Worldwide) are accessible, but personal/team boards used for development coordination are not.

This creates a split where diagram generation works (it creates files in the user's drafts) but diagram management on shared boards does not.

---

## Environment Details

- **Figma MCP servers:** `claude.ai Figma` (remote), `figma-desktop` (local, port 3845)
- **Figma REST API:** Used via FigmailAPP (comments, file reads, design tokens) and Figma plugins (stickies, connectors via Plugin API)
- **Figma plan:** DDB Worldwide (Enterprise, Full seat) + personal team (Starter, View seat)
- **Usage pattern:** 10 diagrams across 6 repositories, growing; centralized on one FigJam board
- **Diagram types:** flowchart, folder_tree, relationship_graph, sequence, state, gantt, decision_tree
- **Integration:** Claude Code CLI with MCP, Node.js documentation daemon, SQLite FTS5 database
- **Workaround complexity:** ~1,200 lines of custom code (registry, propagation, MCP tools, processors)

---

## Conclusion

The `use_figma` tool theoretically enables write operations on existing FigJam files, but three barriers prevent it from solving the diagram lifecycle problem:

1. **`generate_diagram` returns redirect URLs** — no file key is available to target with `use_figma`
2. **Mermaid rendering logic is internal** — reproducing `generate_diagram`'s layout in raw Plugin API JS is impractical
3. **Plan/seat constraints** — shared boards may not be accessible for writes depending on the org

The simplest path forward remains: **add `fileKey` (and optionally `pageId`) to `generate_diagram`** so it can render into an existing file. Alternatively, have `generate_diagram` return a real file key instead of a redirect URL, enabling `use_figma` follow-up calls.

*This report documents real production experience with the Figma MCP beta. We've invested significant engineering effort into workarounds that a small API surface change would largely eliminate.*
