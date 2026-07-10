---

marp: true
theme: default
paginate: true
footer: "DVWDesign — Figma AI Framework — 2026"
style: |
  section {
    font-family: 'Inter', 'Helvetica Neue', sans-serif;
    background: #FFFFFF;
    color: #1A1A1A;
  }
  section.hero {
    background: #0D0D0D;
    color: #FFFFFF;
    text-align: center;
    justify-content: center;
  }
  section.hero h1 { font-size: 2.6em; margin-bottom: 0.2em; }
  section.hero p { font-size: 1.2em; color: #AAAAAA; }
  h1 { color: #0D0D0D; font-size: 1.8em; }
  h2 { color: #333333; font-size: 1.3em; }
  table { font-size: 0.85em; width: 100%; }
  th { background: #F0F0F0; }
  code { background: #F5F5F5; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
  blockquote { border-left: 4px solid #0066FF; padding-left: 1em; color: #555; }
  .highlight { color: #0066FF; font-weight: bold; }

---

<!-- markdownlint-disable MD025 MD024 MD036 -->

<!-- _class: hero -->

# AI-Powered Design Operations at Scale

## DVWDesign Figma AI Framework

May 2026

---

## The Problem Every Design Team Knows

When design, code, and documentation live in separate tools —

- Diagrams go **stale** the moment architecture changes
- Design handoffs **lose context** between Figma and the codebase
- N teams maintain **N disconnected** sets of documentation
- PNGs in pull requests are **barely legible**
- Links in docs point to **deleted FigJam files**

> **The result:** teams spend more time maintaining artifacts than creating value.

---

## One Framework. Five Layers

```text

  Skills & Commands   →  /figma-diagram  /figma-curate  /figma-use
      MCP Server      →  generate_diagram  get_design_context  curate_diagram
        Scripts       →  export-figma-png  sync-config  scan-all-repos
        Plugins       →  Custom Figma plugins for design system ops
       REST API       →  PNG export (scale=2)  Variables  Node structure

```

### Each layer adds capability without replacing what came before

---

## What Changed in May 2026

### Figma Agent — Now Live

Figma's own canvas-native AI, launched May 20 2026.

- Generate **multiple design directions simultaneously**
- **Bulk-edit** components, rename, convert to dark mode
- Summarize **design critique comments** into an action plan
- Works **inside your Figma file**, not in a separate tool

**With our MCP server:** Agent refines designs on canvas → MCP reads the result into code → no manual handoff.

---

## Before → After

| Before | After |
| --- | --- |
| Diagram updated in code, FigJam forgotten | SHA-256 staleness detection — stale diagrams surfaced automatically |
| Design handoff = screenshot in Notion | MCP reads Figma component tree directly into code |
| Grep across 14 repos manually | Full-text search: 620+ files, < 100ms |
| 22kb PNG — unreadable at full width | 185kb Figma REST export — retina quality |
| Diagrams land on default board page | Pre-configured section destinations — no manual moves |
| 14 markdown files with different URLs | One `curate_diagram` call updates all 14 simultaneously |

---

## The Numbers

| Metric | Result |
| --- | --- |
| PNG quality improvement | **8×** (22kb → 185kb) |
| Files searchable | **620+** across 14+ repos |
| Search latency | **< 100ms** |
| Repos updated per curation call | **14 simultaneously** |

---

## What It Solves

### For your design team

- Design tokens flow from Figma directly into code — no copy-paste
- Bulk component updates happen in minutes, not days
- Design critique → action plan without a facilitator

### For your developers

- Diagrams are always current — staleness is detected, flagged, and tracked
- Design context is readable from the CLI — no browser required
- Cross-repo documentation search works like Google

### For your stakeholders

- Stable FigJam URLs that never break
- Presentation-quality PNGs in every pull request
- One dashboard showing documentation health across all repos

---

## Training Program

Three tiers. Designed for scale.

| Tier | Who | Format | Duration | Outcome |
| --- | --- | --- | --- | --- |
| **T1 Awareness** | All stakeholders | Webinar + demo | 30 min | Understands what's possible |
| **T2 User** | Designers, PMs | Workshop + playbook | 1 day | Uses the framework independently |
| **T3 Admin** | Devs, agents | Deep-dive | 2 days | Extends and maintains the framework |

All sessions recorded. Playbook included. Quarterly updates as tools evolve.

---

## Pricing

Three packages. Choose by scope.

| | **Starter** | **Standard** | **Premium** |
| --- | --- | --- | --- |
| Framework Setup | ✓ | ✓ | ✓ |
| T1 Awareness | ✓ | ✓ | ✓ |
| T2 User Training | — | ✓ | ✓ |
| T3 Admin Training | — | — | ✓ |
| Coaching Sessions | 1 | 3 | Unlimited (6mo) |
| Material License | — | 1 year | 1 year |
| Retainer | — | — | 6 months |
| **Total** | **€3,500–6,000** | **€9,000–14,000** | **€18,000–28,000** |

### All prices indicative. Custom scoping available

---

## What Setup Looks Like

**Week 1** — Framework Setup

- Tool configuration: Figma MCP, Claude Code, DocuMind
- Repository onboarding: CLAUDE.md authored per repo
- Central FigJam board: sections created per team

**Week 2** — T1 Awareness Webinar

- Live 30-min session with all stakeholders
- Q&A recorded; deck + playbook distributed

**Week 3–4** — T2 User Workshop (optional)

- 1-day hands-on for design + product teams
- Real project applied during training

**Ongoing** — Retainer (optional)

- Monthly: tool updates, new skill releases, monitoring

---

## Why DVWDesign

- **Built this framework for ourselves** — 14+ repos, 620+ docs, production since 2025
- **Not a vendor pitch** — we run this stack daily; we know where it breaks
- **Training from practitioners** — every example is from real work
- **Framework-first** — we configure and extend; you own what we build for you

---

## Next Step

Let's scope your setup.

**30-minute discovery call** — we map your current workflow to the framework, identify
quick wins, and propose a phased engagement.

**Contact:** <david@dvw.design>

> Questions about specific capabilities? We have live demos for every layer of the framework.

---

<!-- _class: hero -->

# Thank You

## DVWDesign — Figma AI Framework

`david@dvw.design`

## Deck generated with Marp · Export: PDF · PPTX · Web

## Source: DocuMind/docs/slides/external/2026-05-21-figma-ai-pitch-deck.md
