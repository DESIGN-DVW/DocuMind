---

doc_title: DVWDesign Figma AI Framework — Full Report
date: 2026-05-21
version: 1.0-draft
status: in-progress
owner: DocuMind
contributors: "DocuMind, ProductMarketing, RandD, FigmaDSController, Figma-Plug-ins, RootDispatcher"
audience: all

---

# DVWDesign Figma AI Framework — Full Report

**Date:** 2026-05-21
**Version:** 1.0 Draft
**Status:** In Progress — Coordinated Build (see DISPATCH-066)
**Audience:** All stakeholders (technical + non-technical)

> This document is the single source of truth for all presentation decks, executive summaries, and slide exports. Chapters marked `[STUB]` are owned by the indicated repo and will be filled in by Day 2–3.

---

## Chapter 1 — Executive Overview

> **Owner:** ProductMarketing `[STUB — fill by 2026-05-22]` — Write 3 sentences: what the framework is, who benefits, what changed in the last 12 months. Audience = stakeholder who has never opened Figma. Zero jargon.

### Placeholder

DVWDesign has built an AI-powered operational layer that connects design tools, codebases,
and documentation — automatically. Teams that previously spent hours keeping design files,
code, and documentation in sync now have that synchronization happen in the background,
without human intervention. The arrival of Figma's AI Agent in May 2026 adds a canvas-native
collaborator that further accelerates the loop between design intent and shipped product.

---

## Chapter 2 — What We Built

### The Five-Layer Framework

Our Figma AI framework operates across five complementary layers. Each layer adds
capability without replacing what came before.

```text

┌─────────────────────────────────────────────────────────┐
│  Layer 5 — Skills & Commands                            │
│  /figma-diagram · /figma-curate · /figma-use            │
│  /figma-generate-design · /figma-code-connect           │
├─────────────────────────────────────────────────────────┤
│  Layer 4 — MCP Server                                   │
│  generate_diagram · get_design_context · get_figjam     │
│  get_screenshot · get_variable_defs · curate_diagram    │
│  register_diagram · get_diagrams                        │
├─────────────────────────────────────────────────────────┤
│  Layer 3 — Scripts                                      │
│  export-figma-png.mjs · sync-markdown-config.mjs        │
│  scan-all-repos.mjs · fix-markdown.mjs                  │
├─────────────────────────────────────────────────────────┤
│  Layer 2 — Plugins (Figma-Plug-ins repo)                │
│  Custom Figma plugins for design system operations      │
├─────────────────────────────────────────────────────────┤
│  Layer 1 — REST API                                     │
│  /v1/images/ (PNG export at scale=2) · /v1/files/       │
│  /v1/variables/ · /v1/nodes/                            │
└─────────────────────────────────────────────────────────┘

     + Figma Agent (May 2026) — canvas-native AI, complements all layers

```

### Layer 1 — Figma REST API

The foundation. Used for reading file structure, exporting assets, and querying variables.
Key usage: node PNG export at up to 4× scale via `/v1/images/` — the source of
high-quality diagram images that replace the lower-resolution Mermaid CLI output.

```bash

GET https://api.figma.com/v1/images/{fileKey}?ids={nodeId}&scale=2&format=png
X-Figma-Token: {FIGMA_PAT}

```

### Layer 2 — Plugins

Custom Figma plugins (Figma-Plug-ins repo) handle operations that require direct canvas
access: design system injection, naming convention enforcement, component inspection.
Plugins run inside Figma's sandboxed environment and complement the MCP server.

### Layer 3 — Scripts

Node.js automation scripts that bridge the gap between repos:

| Script                     | Purpose                                                   |
| -------------------------- | --------------------------------------------------------- |
| `export-figma-png.mjs`     | Export FigJam node as high-quality PNG via Figma REST API |
| `sync-markdown-config.mjs` | Deploy markdownlint config to all 14+ repos               |
| `scan-all-repos.mjs`       | Full-text scan of 620+ markdown files                     |
| `fix-markdown.mjs`         | Auto-fix markdown lint violations                         |

### Layer 4 — MCP Server (Figma MCP)

The Model Context Protocol server is the primary integration layer for AI-assisted
design workflows. Claude Code agents call MCP tools directly — no browser required.

| Tool                 | Direction       | Purpose                                         |
| -------------------- | --------------- | ----------------------------------------------- |
| `generate_diagram`   | Code → Canvas   | Create FigJam diagram from Mermaid syntax       |
| `get_design_context` | Canvas → Code   | Read component structure, variants, properties  |
| `get_figjam`         | Canvas → Code   | Read FigJam node content (shapes, text, layout) |
| `get_screenshot`     | Canvas → Code   | Capture rendered PNG of any frame               |
| `get_variable_defs`  | Canvas → Code   | Read design tokens / variables                  |
| `curate_diagram`     | Code → Registry | Record curated URL, propagate to all repos      |
| `register_diagram`   | Code → Registry | Register new diagram in DocuMind database       |
| `get_diagrams`       | Registry → Code | Query diagram registry (pre-flight check)       |

### Layer 5 — Skills & Commands

Slash commands that orchestrate the full workflow for common tasks:

| Command                  | What it does                                            |
| ------------------------ | ------------------------------------------------------- |
| `/figma-diagram`         | 6-step: Mermaid → PNG → FigJam → Registry → Link insert |
| `/figma-curate`          | Record curated URL → export Figma PNG → propagate refs  |
| `/figma-use`             | Prerequisites before calling `use_figma`                |
| `/figma-generate-design` | Translate app layout into Figma design                  |
| `/figma-code-connect`    | Map Figma components to codebase components             |

### Figma Agent (May 2026 — Additive Layer)

Figma's own canvas-native AI, launched in beta May 20 2026. Operates directly inside
the design file alongside your team. Not a replacement for the MCP server — a complement.

#### Capabilities

- Design exploration: generate N parallel style variations on canvas

- Bulk automation: component swaps, dark mode conversion, typography standardization,

  naming convention enforcement across files

- Feedback integration: summarize comment threads into an actionable plan

#### The division of labor

```text

CLI / Claude Code session → MCP Server → Canvas artifacts
                                               ↕
                    Figma Agent ← Human refinement → MCP reads back to code

```

**Availability:** Full seat on Professional / Organization / Enterprise plans. Beta is
free (no AI credit consumption). Collab and Dev seats can use it in drafts only.

### The Triple Output Rule

Every diagram in the ecosystem produces four artifacts:

| Artifact | Format | Location | Purpose |
| --- | --- | --- | --- |
| Mermaid source | `.mmd` | `docs/diagrams/` in each repo | Version-controlled source of truth |
| PNG preview | `.png` | `docs/diagrams/` in each repo | GitHub, PRs, inline docs |
| FigJam view | Board node URL | Central FigJam board | Collaboration, presentation |
| Registry entry | SQLite row | DocuMind `diagrams` table | Tracking, staleness, URL management |

### The Diagram Registry

DocuMind maintains a SQLite database tracking every diagram across all 14+ repos.
SHA-256 hash comparison detects staleness automatically. One `curate_diagram` call
propagates URL changes across all repos simultaneously.

```text

get_diagrams({ repo }) → check state → generate if needed → register → curate
                                                                         ↓
                                              14 repos updated in one call

```

---

## Chapter 3 — What It Solves

> **Owner:** ProductMarketing `[STUB — enrich with business framing by 2026-05-22]`

| Problem                     | Before                                                    | After                                                                 |
| --------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| Diagram drift               | Stale `.mmd` files, broken FigJam links, outdated PNGs    | Registry + SHA-256 staleness detection + auto-relink                  |
| Design-code gap             | Manual handoff, screenshots in Notion, no version control | MCP bridges canvas ↔ code; `get_design_context` is the handoff        |
| Scattered documentation     | 14 repos, no search, no relationships                     | DocuMind FTS5 + graph traversal across 620+ files                     |
| Low-quality PNG previews    | 22kb mmdc output — barely legible at full-page width      | 185kb Figma REST export at scale=2 — 8× quality improvement           |
| Manual board organization   | Diagrams land on default page, manual move required       | Pre-configured `nodeId` destinations — diagrams land in right section |
| Redundant generation        | No visibility into what already exists                    | Pre-flight `get_diagrams` check before every generation               |
| Cross-repo link maintenance | Grep and replace across 14 repos manually                 | `curate_diagram` rewrites all references automatically                |
| Design system inconsistency | Manual component audits, naming drifts                    | Figma Agent bulk-updates component descriptions and naming            |

---

## Chapter 4 — What It Enhances

> **Owner:** FigmaDSController `[STUB — add design system perspective by 2026-05-22]`

### Design System Consistency

Figma Agent can audit and update component documentation, standardize naming conventions,
and document variant states in bulk — operations that previously required manual inspection
of every component. Combined with `get_variable_defs` (MCP), design tokens flow from
Figma variables directly into code without copy-paste.

### Collaboration Quality

- Stable FigJam URLs per diagram — links in markdown files point to permanent board nodes,

  not ephemeral standalone files that get deleted

- Section-scoped access: each repo's agent writes only to its designated board section;

  cross-team collisions are structurally prevented

- Team review loop: Figma Agent summarizes design critique comments into an actionable plan

### Documentation Intelligence

- Automatic re-index after every file edit (DocuMind daemon watches all repos)

- Full-text search across 620+ files in under 100ms

- Deviation detection flags markdown files that drift from conventions

- Graph traversal finds related documents 2+ hops away

### Scale

- 14+ repositories, one central FigJam board, one registry

- Single command propagates diagram URL changes to all repos simultaneously

- Scheduled scans run daily; PDF re-index weekly — no manual triggers

---

## Chapter 5 — R&D Study

> **Owner:** RandD `[STUB — synthesize from existing proposals + Figma Agent findings by 2026-05-22]`

### Figma Agent (May 2026)

**What it is:** Canvas-native AI that operates directly inside Figma files. Not an external
integration — it runs in the same environment as your design team.

#### Key capabilities

- Parallel design exploration (multiple style directions simultaneously)

- Bulk operations: dark mode conversion, typography refresh, component swap at scale

- Feedback-to-plan: ingests comment threads, produces an ordered action list

- Design system maintenance: naming conventions, component descriptions, variant documentation

**Integration with our stack:** Figma Agent works with the canvas; the MCP server works with
the code. They are complementary — Agent creates/refines on canvas, MCP reads the result
into code or writes code back to canvas. Neither replaces the other.

**Status:** Beta, rolling out May 2026. Free during beta; billing at GA. Professional+
full seats only (not Dev, Collab, Starter, Education, Government).

**Our assessment:** High value for FigmaDSController (bulk design system updates), FigmailAPP
(dark mode, layout exploration), and design review workflows. Not scriptable — interactive
only. Cannot be integrated into CLI dispatches yet.

### Figma MCP Server

The programmatic bridge between our AI agents and the Figma canvas. Unlike the Figma Agent,
the MCP server is fully callable from scripts and agent sessions — no browser required.

Key MCP tools already in production:

- `generate_diagram`: Mermaid syntax → FigJam shape, with `nodeId` destination targeting

- `get_design_context`: Read component tree, variants, auto-layout properties

- `get_variable_defs`: Read design tokens/variables

- `get_figjam`: Read FigJam node structure (READ ONLY — cannot write to existing nodes yet)

- `get_screenshot`: Render any frame to PNG

**Current limitation:** `generate_diagram` is create-only. In-place node editing is not yet
supported. Update workflow: regenerate → user swaps old shape → curate new node URL.

### Figma REST API

Three key endpoints actively used:

```text

/v1/images/{fileKey}?ids={nodeId}&scale=2&format=png   → PNG export (up to 4×)
/v1/files/{fileKey}/nodes?ids={nodeId}                 → Node structure
/v1/files/{fileKey}/variables/local                    → Design variables/tokens

```

The image export endpoint is the backbone of the high-quality PNG workflow: 185kb at
scale=2 versus 22kb from Mermaid CLI — legible at any document width.

### Figma Buzz (from RandD existing analysis)

Template-based asset creation for marketing teams. Enables non-designers to generate
on-brand assets without design expertise. Key integration: CampaignManager orchestrates
campaigns while Figma Buzz generates assets at scale.

- 311% ROI over 3 years vs building in-house

- $316K–$480K savings (build-in-house avoided)

- 0% overlap with CampaignManager, 100% synergistic

> Full analysis: `RandD/docs/proposals/figma-buzz/EXECUTIVE-SUMMARY-FIGMA-BUZZ-CM.md`

### DocuMind

Documentation intelligence layer that underpins the whole system:

- SQLite FTS5 full-text search across 620+ markdown files

- SHA-256 diagram staleness detection

- Graph traversal: 8 relationship types, recursive CTE queries

- REST API + MCP interface for agent access

- Scheduled scans: incremental (hourly), full (daily), PDF (weekly)

---

## Chapter 6 — R&D Gains

Quantified improvements observed in production use.

### Diagram Quality

| Metric | Before | After | Delta |
| --- | --- | --- | --- |
| PNG file size | ~22kb (mmdc) | ~185kb (Figma REST scale=2) | **8× improvement** |
| PNG resolution | Default viewport | 3072×2048 @ 2× deviceScaleFactor | Retina quality |
| Board placement | Default page (manual move) | Pre-configured `nodeId` section | **0 manual moves** |
| Duplicate diagrams | No visibility | Pre-flight registry check | **Eliminated** |

### Documentation

| Metric | Value |
| --- | --- |
| Files indexed | 620+ markdown files across 14+ repos |
| Search latency | < 100ms full-text search |
| Cross-repo URL propagation | 14 repos updated per `curate_diagram` call |
| Staleness detection | SHA-256 hash comparison, automatic |

### Ecosystem Scale

| Metric | Value |
| --- | --- |
| Repositories managed | 14+ |
| Diagrams registered | 16+ (growing) |
| Curated diagrams (stable URLs) | 4 fully curated, 12 in progress |
| Dispatches coordinated | 66+ cross-repo dispatches |

### Figma Buzz (existing RandD analysis)

| Metric | Value |
| --- | --- |
| ROI (3 years) | 311% |
| Cost savings vs build-in-house | $316K–$480K |
| Asset generation speed | 100s of assets in minutes |

---

## Chapter 7 — Training Program Design

> **Owner:** ProductMarketing `[STUB — add delivery details and pricing by 2026-05-22]`

### Why a Training Program

The framework works. Adoption doesn't. The gap between "the tools exist" and "the team
uses the tools fluently" is always a training problem, not a technology problem.

Our training program bridges that gap in three structured tiers.

### The Three Tiers

#### T1 — Awareness (30 minutes)

**Who:** All stakeholders. Designers, PMs, executives, clients, partners.
**Format:** Live webinar + slide deck + Q&A recording
**Outcome:** Participant understands what exists, what changed, and what they can ask for

Content:

- What the Figma AI framework does (this report, Chapter 1-3)

- Live demo: diagram from Mermaid to FigJam in one command

- Live demo: design-to-code via MCP

- Q&A

**Price:** Free / included in Framework Setup engagement

#### T2 — User (1 day)

**Who:** Designers, product managers, content producers who will use the tools daily
**Format:** Hands-on workshop + written playbook + follow-up office hours session
**Outcome:** Participant can run `/figma-diagram`, `/figma-curate`, design-to-code handoff,
and DocuMind search independently

Content:

- Morning: Framework overview (2h) + guided exercises

- Afternoon: Apply to real project (3h) + retrospective (1h)

- Take-home: Illustrated playbook, command reference card

**Price:** €3,500–5,000 per day (up to 5 participants); additional participants +€500/pp

#### T3 — Admin / Agent (2 days)

**Who:** Developers, AI agents, team leads who will extend and maintain the framework
**Format:** Deep-dive workshop + CLAUDE.md authoring + paired implementation session
**Outcome:** Participant can add new repos to the ecosystem, author skills/commands,
configure CRON meetings, extend DocuMind

Content:

- Day 1: Framework internals — MCP, skills, dispatches, registry, DocuMind

- Day 2: Implement one real extension; author CLAUDE.md for a new repo; configure CRON

**Price:** €6,000–9,000 total (2 days, up to 3 participants)

### At Scale

- Recorded sessions licensed annually (€1,500/year for playbook + recordings + updates)

- Quarterly update cycle: tools evolve fast — training material refreshed each quarter

- Train-the-trainer option: certify an internal champion (additional workshop day)

---

## Chapter 8 — Pricing Model

> **Owner:** RandD `[STUB — validate against 7-layer model, finalize rates by 2026-05-23]` — Pull from `RandD/docs/proposals/pricing/PRICING-INVOICING-STRATEGY.md`

### Internal Costs (DVW Running the Framework)

| Item | Unit Cost | Cadence | Notes |
| --- | --- | --- | --- |
| Figma Professional seat | $15–25/month | Monthly per seat | Required for Figma Agent beta |
| Anthropic Claude API | Usage-based | Monthly | Volume discounts available |
| DocuMind server | Infrastructure | Monthly | Self-hosted — compute + storage only |
| Figma MCP server | Free | — | Open source, Anthropic-maintained |
| Export-figma-png script | Free | — | Internal script, no license cost |
| Training material dev | Internal time | Quarterly | One-time build + quarterly refresh |

### Client-Facing Rates (DVW as Vendor)

All prices are indicative. RandD agent to validate against 7-layer pricing model.

| Package | What's Included | Indicative Price |
| --- | --- | --- |
| **Framework Setup** | Tool config, MCP setup, CLAUDE.md, repo onboarding | €2,500–5,000 one-time |
| **Coaching Session** | 2h hands-on with team, live problem-solving | €800–1,200 per session |
| **Training T1** | Awareness webinar (up to 20 participants) | Free / included in Setup |
| **Training T2 — User** | 1-day workshop, up to 5 participants | €3,500–5,000 per day |
| **Training T3 — Admin** | 2-day deep-dive, up to 3 participants | €6,000–9,000 total |
| **Material License** | Slides + playbook + recordings (annual) | €1,500/year |
| **Maintenance Retainer** | Monthly framework updates + monitoring | €500–1,500/month |
| **UX Review** | 2-day workflow audit (user/team needs assessment) | €3,000–5,000 |

### Suggested Packages

| Starter | Standard | Premium |
| --- | --- | --- |
| Framework Setup | Setup + T2 Training | Setup + T2 + T3 + Retainer |
| T1 Awareness webinar | Material License (1yr) | Full Material License |
| 1 Coaching session | 3 Coaching sessions | Unlimited Coaching (6 months) |
| €3,500–6,000 | €9,000–14,000 | €18,000–28,000 |

---

## Chapter 9 — UX Review

> **Owner:** FigmaDSController `[STUB — fill with actual team workflow assessment by 2026-05-23]`

### Current State Assessment

Areas to assess per team:

| Area | Questions |
| --- | --- |
| Design handoff | How does a finished Figma design become a coded component today? |
| Diagram maintenance | Who updates `.mmd` files when architecture changes? |
| Doc search | Do team members use DocuMind search, or still grep manually? |
| Training gap | Which T-tier does each team member currently need? |
| Friction inventory | What do people still do manually that should be automated? |

### Known Friction Points (Pre-Assessment)

- In-place FigJam node editing: not yet possible via MCP (`generate_diagram` is create-only)

- Figma Agent: interactive only — not callable from scripts

- AgentHub API key: currently invalid (blocks cross-repo coordination feed)

- DesignCreation repo: not locally cloned — design team agent inaccessible

- FigJam section `nodeId` per repo: still missing from `repository-registry.json`

---

## Chapter 10 — Roadmap

> **Owner:** RootDispatcher `[STUB — validate with DISPATCH status by 2026-05-23]`

### Now (May 2026)

| Item | Status |
| --- | --- |
| FigJam section `nodeId` per repo | Blocked — user must create board sections |
| DISPATCH-065 rollout | Pending — all repos applying new destination workflow |
| DISPATCH-064 Group B curation | Pending — 9 old redirect URLs need new node URLs |
| DISPATCH-066 (this presentation) | In progress |
| AgentHub API key fix | Blocked — needs settings check |

### Next (Q3 2026)

| Item | Effort | Value |
| --- | --- | --- |
| Figma Slides generation via `use_figma` MCP | Medium | High — live presentation quality |
| In-place FigJam node editing | Waiting on Figma API | High — eliminates regenerate-swap workflow |
| Figma Agent programmatic API | Waiting on Figma | Very high — closes the CLI↔canvas loop |
| Training program v1 launch | Medium | High — enables scale |

### Later (H2 2026)

- Full DocuMind ↔ Figma sync: every indexed doc has a corresponding FigJam representation

- Multi-agent design reviews: agents from multiple repos collaborate on a shared FigJam file

- Design system compliance scanning: DocuMind flags code that diverges from Figma variables

---

## Appendix — Glossary for Neophytes

| Term | Plain English |
| --- | --- |
| MCP Server | A translator between our AI agent (Claude) and design tools (Figma). Like a phone interpreter. |
| FigJam | Figma's whiteboard tool. Where diagrams and architecture maps live. |
| Mermaid / `.mmd` | A text file that describes a diagram (like writing a recipe instead of drawing a cake). The computer draws the diagram from the text. |
| Registry | A central list that tracks every diagram: where it lives, whether it's up to date, and what URL to use. |
| Curation | The act of placing a diagram in the right spot on the board and recording its permanent URL. After curation, all links point to the right place automatically. |
| CRON | A scheduler. "CRON at 9am" means "run this agent automatically at 9am every day." |
| Dispatch | A message sent from one repo to another with specific instructions. Like a memo between departments. |
| Staleness | A diagram is "stale" when the source text has changed but the visual hasn't been updated yet. |
| Figma Agent | A new AI assistant built directly into Figma (not our agent — Figma's own). It can make bulk changes to designs on the canvas. |
| Design Token | A design decision stored as a variable (e.g., "primary color = #0066FF"). Changes to the token propagate everywhere the token is used. |
