# MD vs MDX Usage Guide

**Version:** 1.0.0
**Created:** 2026-04-11
**Status:** Active — Applies to all DVWDesign repositories
**Maintainer:** DocuMind
**Related:** [MARKDOWN-FORMATTING-STANDARDS.md](MARKDOWN-FORMATTING-STANDARDS.md)

---

## Overview

This guide answers three questions that come up over and over when writing docs in the DVWDesign ecosystem:

1. When should I use `.md` vs `.mdx`?

2. How do I upgrade rough placeholder content (ASCII diagrams, flat tables) to real embeds without leaving Markdown?

3. Where should source content come from (DOCX, PDF, FigJam, Figma) and how does DocuMind ingest it?

The short answer to question 1: **almost always use `.md`**. The DVWDesign ecosystem has no MDX docs renderer — DocuMind, GitHub, VSCode, and `markdownlint` all read Markdown. The only place MDX is rendered is inside Storybook, via `@storybook/addon-docs`.

---

## 1. TL;DR — Decision Matrix

| Situation                                                        | Use                              | Why                                                                      |
| ---------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| Any doc in `docs/` (any repo)                                    | `.md`                            | DocuMind FTS5 indexes `.md` only; no MDX renderer in workspace           |
| `README.md`, `CLAUDE.md`, `AGENTS.md`, `CHANGELOG.md`            | `.md`                            | GitHub renders MD natively; MDX would break the preview                  |
| Storybook component docs (next to a `.tsx` file)                 | `.mdx`                           | `@storybook/addon-docs` is the only MDX renderer that exists here        |
| Tables that need `colspan` / `rowspan` / merged headers          | `.md` + raw HTML `<table>`       | HTML inside Markdown still parses as Markdown                            |
| Diagrams                                                         | `.md` + Mermaid fence (→ FigJam) | Mermaid is text-based and DocuMind tracks it; FigJam is the curated view |
| Long rationale, "alternatives considered", troubleshooting trees | `.md` + `<details>`              | Native HTML, collapses on GitHub and in DocuMind                         |

---

## 2. What MDX Is (and Is Not, Here)

- **MDX = Markdown + JSX.** It lets you `import` components and write `<MyComponent prop={value} />` inside what looks like a markdown file.

- **MDX requires a JSX runtime + an MDX compiler.** This workspace has neither: there is no `@mdx-js/*`, `next-mdx-remote`, `astro:content`, or any other MDX toolchain in any primary `package.json`.

- The 3 `.mdx` files that do exist in the workspace are **all Storybook addon-docs files**:

  - `FigmaAPI/FigmailAPP/packages/UploadTool-codesandbox/src/Component/UploadTool.doc.mdx`

  - `FigmaAPI/FigmailAPP/client/src/shared/components/forms/ValidatedTextField/ValidatedTextField.mdx`

  - `FigmaDSController/client/src/shared/components/uploaders/UploadTool/UploadTool.doc.mdx`

  They render only inside the Storybook iframe at `:6006` — not on GitHub, not in DocuMind, not in any other preview.

- **Consequence:** an `.mdx` file outside Storybook is a file no human and no tool in this ecosystem can render. Don't create one.

### A real-world smell from our repo

The 3 existing `.mdx` files barely use MDX features at all. They escape their JSX inside backticks:

```text

`import { Meta } from '@storybook/addon-docs';`

`<Meta title="Shared/Components/UploadTool" />`

```

This means even Storybook isn't actually rendering them as JSX — the imports and `<Meta>` calls are literal inline code. That's a strong tell: if you find yourself escaping the JSX, you didn't need MDX in the first place. **Rename to `.md` and move on.**

---

## 3. When to Use MDX (Storybook Component Docs)

The only legitimate place for `.mdx` in this ecosystem is alongside a Storybook component. Use it when you need any of the following inside Storybook's docs panel:

- A `<Canvas>` block embedding a live story

- An `<ArgTypes of={...} />` table generated from a component's props

- An `<IconGallery>` / `<ColorPalette>` from `@storybook/blocks`

- Long-form usage prose, do/don't tables, decorator setup notes

If you don't need any of those, write a `.md` file in the repo's `docs/` folder instead.

### Required structure

```text

ComponentName/
├── ComponentName.tsx
├── ComponentName.stories.tsx
└── ComponentName.mdx          ← co-located, NOT in /docs

```

### Required imports (real, not backtick-escaped)

```mdx

import { Meta, Canvas, Story, ArgTypes } from '@storybook/blocks';
import * as ComponentNameStories from './ComponentName.stories';

<Meta of={ComponentNameStories} />

# ComponentName

Long-form usage prose…

## Props

<ArgTypes of={ComponentNameStories.Default} />

## Examples

<Canvas of={ComponentNameStories.WithCropping} />

```

> **Note:** `@storybook/addon-docs` is the legacy package; `@storybook/blocks` is the modern one and is what new files should import from. The 3 existing files in this repo use `addon-docs` and should be migrated when they're next touched.

### When to write `.mdx` instead of just stories

- You need long-form prose (more than a `<Description>` block fits)

- You need do/don't tables, decorator setup notes, or accessibility guidance specific to this component

- You need to embed multiple stories in a curated narrative flow

### When NOT to write `.mdx`

- Short component summary → JSDoc on the component itself

- Props documentation → `argTypes` in `*.stories.tsx`, rendered via `<ArgTypes>`

- Cross-component architecture → plain `.md` in `docs/03-frontend/`

- Anything that should be searchable by DocuMind → plain `.md` in `docs/`

### Hard rule

**Never put `.mdx` inside a `docs/` folder.** Storybook MDX lives next to its component file. Doc-site Markdown lives in `docs/`. There is no overlap.

---

## 4. Replacing Draft / Placeholder Content with Real Embeds

The "draft markdown → real embed" upgrade path. Each subsection: rough draft → upgraded version.

### 4.1 Diagrams: ASCII Stub → Mermaid → FigJam (Curated)

Three tiers — pick the lowest one that's good enough:

| Tier | Use when                                                              | How                                                                               |
| ---- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1    | Quick draft / scratch sketch                                          | Don't ship it. Replace before committing.                                         |
| 2    | Source-controlled diagram, single source of truth, agents can read it | Mermaid fenced block in `.md`                                                     |
| 3    | Canonical, collaborative, frequently updated by humans                | FigJam file, with Mermaid kept as the source-of-truth and a FigJam URL beneath it |

#### Tier 1 → Tier 2

Don't do this:

```text

[Browser] -----> [API] -----> [DB]

                   |

                   v
                [Cache]

```

Do this:

```diagram

graph LR
    Browser --> API
    API --> DB
    API --> Cache

```

Use ` ```mermaid ` if you want GitHub to render it visually. Use ` ```diagram ` if you want it to satisfy MD040 without committing to any specific renderer (DocuMind treats both).

#### Tier 2 → Tier 3 (curation)

When a diagram graduates from "agent-readable Mermaid" to "human-curated, canonical visual reference":

1. Write the Mermaid source into `docs/diagrams/<slug>.mmd` (per-repo, picked up by DocuMind's `tree-processor`).

2. Build the FigJam manually (Figma REST API is read-only — see [FIGJAM-DIAGRAM-GENERATION-GUIDE](../../FigmaAPI/FigmailAPP/docs/04-architecture/FIGJAM-DIAGRAM-GENERATION-GUIDE.md) for the template-+-API-read workflow).

3. DocuMind's `mermaid-processor.mjs` registers the diagram in the `diagrams` table with a `source_hash`, then inserts a FigJam URL into the `.md` alongside the fenced Mermaid block.

4. **Keep the Mermaid block.** Do not delete it. DocuMind uses `source_hash` to flag stale FigJam exports; without the source it can't detect drift.

The final pattern in the markdown file:

```text

` ` `mermaid
graph LR
    Browser --> API
    API --> DB
` ` `

> 📊 [View in FigJam](https://www.figma.com/file/abc123/architecture)

```

### 4.2 Tables: GFM → Raw HTML

GFM tables are enough for ~95% of cases. Reach for raw HTML when you need any of:

- `colspan` or `rowspan` (merged cells)

- Two header rows (super-headers)

- Block content inside cells (lists, code fences, multi-paragraph)

- Per-cell alignment (GFM only does column-level alignment)

#### Upgrade pattern

This is impossible in GFM — it needs HTML:

```html

<table>
  <thead>
    <tr><th rowspan="2">Endpoint</th><th colspan="2">Auth</th></tr>
    <tr><th>Read</th><th>Write</th></tr>
  </thead>
  <tbody>
    <tr><td><code>/api/foo</code></td><td>✅ public</td><td>token</td></tr>
    <tr><td><code>/api/bar</code></td><td>token</td><td>token + role</td></tr>
  </tbody>
</table>

```

#### Rules when using HTML tables

- Still inside an `.md` file. Markdown allows inline HTML.

- markdownlint **will not** enforce DVW001 (table separator spacing) on HTML tables — that's expected. The trade-off is losing the `npm run fix:custom` auto-fix safety net.

- Keep one blank line above and below the `<table>` element (MD031-compatible behaviour for surrounding content).

- **Don't mix GFM and HTML table syntax in the same table.** Pick one.

- Wrap inline code in `<code>` not backticks (backticks don't parse inside HTML blocks in some renderers).

### 4.3 Collapsible / Long-Form Content: `<details>`

For rationale, alternatives-considered, troubleshooting trees, or anything that shouldn't dominate the page on first read, use the native HTML `<details>` element:

```html

<details>
<summary>Why we picked option X over option Y</summary>

Markdown still works inside — headings, lists, code fences, all of it.

- Reason 1

- Reason 2

```javascript

const example = "still parses";

```text

</details>

```

- Renders on GitHub, in DocuMind, in any standard MD viewer.

- **The blank line after `<summary>` is required** for the inner Markdown to parse. Skip it and the body collapses into a single paragraph.

- Don't nest `<details>` more than one level deep — most renderers handle it but it gets confusing fast.

### 4.4 Other Inline HTML That's Safe

These tags work inside `.md` and are safe to reach for:

| Tag                      | Use for                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `<kbd>`                  | Keyboard shortcuts: `<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>` |
| `<sub>`, `<sup>`         | Subscript / superscript (chemistry, math, footnote refs)           |
| `<mark>`                 | Highlighting key terms in a sentence                               |
| `<abbr title="...">`     | Tooltipped abbreviations                                           |
| `<dl>` / `<dt>` / `<dd>` | Definition lists (no GFM equivalent)                               |
| `<picture>` + `<source>` | Dark/light mode image swapping                                     |
| `<video>` / `<source>`   | Embedding short demo clips                                         |

Avoid: `<br>` (a paragraph break is almost always better), `<center>` (deprecated), arbitrary `<div>` wrappers (they break Markdown parsing inside).

---

## 5. Doc Sources — Where Content Comes From

Most docs aren't written from scratch — they come from a Word doc, a PDF, a FigJam, or a Figma file. Here's how each source becomes a doc DocuMind can index.

| Source                           | Tool                                               | Output                                                                |
| -------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| `.docx` / `.rtf`                 | DocuMind `word-processor.mjs` (mammoth + turndown) | `.md` with frontmatter, markdownlint-clean                            |
| `.pdf`                           | DocuMind `pdf-processor.mjs` (pdf-parse)           | Text + summary indexed in the `documents` table; reference from `.md` |
| FigJam                           | Manual build + DocuMind `mermaid-processor.mjs`    | FigJam URL inserted into `.md`; `.mmd` source kept as truth           |
| Figma design tokens              | Figma MCP (`mcp__Figma__get_variable_defs`)        | Raw token JSON → format manually into a `.md` table                   |
| Library docs (React, Next, etc.) | Context7 MCP (`mcp__context7__*`)                  | Live docs in conversation; cite, don't copy                           |
| Existing ecosystem docs          | DocuMind `search_docs` / `get_related`             | Ground new docs in existing ones — avoid duplication                  |

### Protocol notes

- **Convert once, edit the `.md`, never re-convert.** Re-running the converter overwrites your edits. DocuMind's `conversions` table tracks what was converted from what.

- **Reference PDFs as source-of-truth via metadata, not by pasting the contents.** Add a line like `**Source of truth:** [filename.pdf](path/to/filename.pdf)` near the top of the `.md`.

- **Run DocuMind's existence check before writing a new doc.** Use `search_docs` (or the MCP equivalent) — it catches near-duplicates via FTS5 + Levenshtein. If something close already exists, fold this content in instead of creating a new file.

- **For diagrams that round-trip** (Mermaid ↔ FigJam), the `.mmd` is the source of truth and the FigJam URL is the rendered view. Never delete the `.mmd`.

- **Context7 for library docs.** Don't copy React or Next.js docs into the workspace — they go stale. Cite via Context7 MCP and let it serve the live version.

---

## 6. Quick Reference Card

- **Default:** `.md`

- **Storybook component doc:** `.mdx`, co-located, never inside `docs/`

- **Diagram, draft:** replace before commit

- **Diagram, MVP:** Mermaid fence in `.md`

- **Diagram, canonical:** Mermaid fence + FigJam URL beneath it (don't delete the Mermaid)

- **Table GFM can't do:** raw HTML `<table>` inside `.md`

- **Hide reasoning / long rationale:** `<details>` inside `.md`

- **DOCX / PDF source:** convert via DocuMind, edit the `.md`, never re-convert

- **Library docs:** cite via Context7, don't copy

- **Always check:** [MARKDOWN-FORMATTING-STANDARDS.md](MARKDOWN-FORMATTING-STANDARDS.md) for DVW001 + MD040

---

## 7. Anti-Patterns (Don't Do This)

| Anti-pattern                                        | Why it's wrong                                                | Do this instead                           |
| --------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| `.mdx` file inside `docs/`                          | No renderer for it; DocuMind won't index it                   | Rename to `.md`                           |
| `.mdx` with backtick-escaped JSX                    | The escapes mean you didn't need MDX                          | Rename to `.md`                           |
| Pasting PDF contents into a `.md`                   | Goes stale; loses provenance                                  | Reference the PDF, let DocuMind index it  |
| Deleting the Mermaid `.mmd` after building FigJam   | DocuMind can't detect staleness without the source            | Keep both                                 |
| Copying React/Next/MUI docs into the workspace      | Goes stale immediately                                        | Cite via Context7 MCP                     |
| Mixing GFM and HTML table syntax in one table       | Renders inconsistently across viewers                         | Pick one syntax for the whole table       |
| Empty fenced code blocks (` ``` ` with no language) | Violates MD040                                                | Use `md`, `diagram`, or `text` as default |
| Compact table separators (no spaces inside pipes)   | Violates DVW001; agent-generated tables get auto-fixed anyway | Use spaced separators (see standards doc) |

---

## 8. Enforcement

This guide is a reference, not a linter. The actual enforcement layers are documented in [MARKDOWN-FORMATTING-STANDARDS.md](MARKDOWN-FORMATTING-STANDARDS.md):

- **markdownlint-cli2** — checks DVW001, MD040, and 8 other rules

- **`npm run fix:custom`** — auto-fixes table separators and other DVW custom patterns

- **lint-staged + husky** — pre-commit hook

- **DocuMind daemon** — re-indexes on file change, flags drift

- **markdown-fixer agent** — applies the rules when generating new files

If you're an agent reading this: when in doubt, write `.md`, never `.mdx`, and run `npm run lint:fix && npm run fix:custom` before committing.
