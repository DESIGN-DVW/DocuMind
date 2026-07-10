---

id: PREPLAN-001
doc_title: Figma AI Framework — Presentation Pre-Planning Proposal
date: 2026-05-21
status: draft
urgency: this-week
owner: DocuMind
stakeholders: "ProductMarketing, RandD, FigmaDSController, Figma-Plug-ins, FigmailAPP, RootDispatcher"

---

# Pre-Planning Proposal: Figma AI Framework Presentation

**Date:** 2026-05-21
**Prepared by:** DocuMind Agent
**Status:** Draft — Pending Approval
**Urgency:** This Week

---

## Objective

Produce a full report and two-track presentation deck showcasing DVWDesign's Figma AI
framework. The deliverables serve two audiences simultaneously:

| Track        | Audience                      | Framing                                          |

| ------------ | ----------------------------- | ------------------------------------------------ |

| A — Internal | DVW team, partners            | Strategy, capability inventory, adoption roadmap |

| B — External | Clients, prospects, investors | Value proposition, ROI, pricing, training offer  |

Both tracks are derived from the same full report — Track B is a curated subset.

---

## What We Have (Existing Assets — Do Not Duplicate)

Before building anything new, the following R&D exists:

| Asset                            | Location                                                             | Relevant Section                            |

| -------------------------------- | -------------------------------------------------------------------- | ------------------------------------------- |

| Figma Buzz integration proposal  | `RandD/docs/proposals/figma-buzz/FIGMA-BUZZ-INTEGRATION-PROPOSAL.md` | Platform analysis, capabilities             |

| Figma Buzz executive summary     | `RandD/docs/proposals/figma-buzz/EXECUTIVE-SUMMARY-FIGMA-BUZZ-CM.md` | ROI: 311% over 3 years, $316K–$480K savings |

| Pricing & invoicing strategy     | `RandD/docs/proposals/pricing/PRICING-INVOICING-STRATEGY.md`         | 7-layer pricing model                       |

| Diagram workflow documentation   | `DocuMind/docs/DIAGRAM-WORKFLOW.md`                                  | Triple output rule, curation, registry      |

| FigJam article (LinkedIn + blog) | `DocuMind/docs/articles/2026-05-18-figjam-diagram-curation.md`       | PNG export, curation workflow               |

| Agent architecture proposal      | `RootDispatcher/docs/AGENT-ARCHITECTURE-PROPOSAL.md`                 | Multi-agent coordination                    |

---

## Deliverables

### 1. Full Report

`DocuMind/docs/reports/2026-05-21-figma-ai-framework-full-report.md`

Ten chapters. All audiences. Maximum depth. Source of truth for all other deliverables.

### 2. Executive Summary (Neophyte Edition)

`DocuMind/docs/reports/2026-05-21-figma-ai-framework-exec-summary.md`

Plain language. No code. No jargon. Explains what the framework does for people who have
never used Figma, AI agents, or design systems. 4-page equivalent.

### 3. Internal Strategy Deck

`DocuMind/docs/slides/internal/2026-05-21-figma-ai-internal-deck.md`

Markdown → web (Marp). Covers full capability inventory, team workflow changes, roadmap,
P&L. 20–30 slides.

### 4. External Pitch Deck

`DocuMind/docs/slides/external/2026-05-21-figma-ai-pitch-deck.md`

Markdown → web (Marp). Simplified. ROI-centric. Pricing packages. CTA. 12–15 slides.
Exports: PDF, PPTX, Keynote-compatible, .odp.

### 5. Figma Slides Version (stretch goal, Day 4)

Figma Slides file generated from the external pitch deck content. Requires `use_figma` MCP.
Used for live presentation; PDF export for stakeholders without Figma access.

### 6. Dispatches (DISPATCH-066 series)

Targeted dispatch to each repo with their specific chapter ownership and slide contribution.

### 7. CRON Meeting Schedule

Three recurring agent sessions configured via CronCreate:

| Session                | Schedule       | Duration | Output                        |

| ---------------------- | -------------- | -------- | ----------------------------- |

| Daily standup          | Weekdays 09:00 | 15 min   | Progress report + blockers    |

| Evening decision log   | Weekdays 18:00 | 10 min   | Decisions made, next actions  |

| Weekly strategy review | Mondays 08:30  | 30 min   | Priorities, scope adjustments |

---

## Chapter → Team Mapping

| Chapter                              | Owner Repo        | Supporting        |

| ------------------------------------ | ----------------- | ----------------- |

| 1. Executive Overview                | ProductMarketing  | DocuMind          |

| 2. What We Built (framework layers)  | DocuMind          | RootDispatcher    |

| 3. What It Solves                    | ProductMarketing  | FigmaDSController |

| 4. What It Enhances                  | FigmaDSController | Figma-Plug-ins    |

| 5. R&D Study (Figma Agent + MCP)     | RandD             | DocuMind          |

| 6. R&D Gains (metrics, time savings) | RandD             | DocuMind          |

| 7. Training Program Design           | ProductMarketing  | RandD             |

| 8. Pricing Model (internal + client) | RandD             | ProductMarketing  |

| 9. UX Review (user/team needs)       | FigmaDSController | FigmailAPP        |

| 10. Roadmap                          | RootDispatcher    | All               |

---

## Full Report — Chapter Outline

### Chapter 1 — Executive Overview

What the Figma AI framework is in 3 sentences. Who benefits. What is different now
versus 12 months ago.

### Chapter 2 — What We Built

The five framework layers:

```text

REST API → Plugins → Scripts → MCP Server → Skills / Commands

```

Plus: Figma Agent (canvas-native, launched May 2026, complements MCP).

Key tools per layer: `generate_diagram`, `get_design_context`, `export-figma-png.mjs`,
`figma-diagram` command, `figma-curate` command.

### Chapter 3 — What It Solves

| Problem | Before | After |

| --- | --- | --- |

| Diagram drift | Stale `.mmd`, broken FigJam links | Registry + staleness detection + auto-relink |

| Design-code gap | Manual handoff, no version control | MCP bridges canvas ↔ code |

| Scattered docs across 14 repos | No single source of truth | DocuMind FTS5 + graph |

| Low-quality PNG previews | 22kb mmdc output | 185kb Figma REST export at scale=2 |

| Manual board organization | Diagrams on default page | Pre-configured `nodeId` destinations |

| Redundant diagram generation | No registry | Pre-flight `get_diagrams` check |

### Chapter 4 — What It Enhances

- Design system consistency (bulk updates via Figma Agent)

- Collaboration (stable FigJam URLs, board sections per team)

- Documentation quality (automatic re-index, FTS5 search, deviation detection)

- Scale (14+ repos, 620+ files, single registry)

### Chapter 5 — R&D Study

- Figma Agent beta (May 2026): canvas-native AI, bulk edits, design system management,

  feedback integration. Complements MCP, not competitive.

- Figma MCP server: programmatic design-to-code, diagram generation, screenshot export

- Figma REST API: node export at scale=2–4×, variables, thumbnails

- AgentHub: cross-repo coordination, availability broadcast, discovery feed

- DocuMind: documentation intelligence, graph traversal, staleness detection

### Chapter 6 — R&D Gains

Quantified where possible. Draw from RandD existing analysis:

- Figma Buzz: 311% ROI over 3 years vs build-in-house ($316K–$480K saved)

- Diagram curation: PNG quality 8× improvement (22kb → 185kb)

- Doc search: full-text across 620+ files in < 100ms

- Cross-repo URL propagation: 14 repos updated in single `curate_diagram` call

- Agent pre-flight check: eliminates duplicate FigJam generation

### Chapter 7 — Training Program Design

Three tiers (at scale):

| Tier | Target | Format | Duration | Outcome |

| --- | --- | --- | --- | --- |

| T1 — Awareness | All stakeholders | 30-min webinar + slide deck | 1 session | Understand what exists |

| T2 — User | Designers, PMs | Hands-on workshop + playbook | 1 day | Can use the framework |

| T3 — Admin | Devs, agents | Deep-dive + CLAUDE.md | 2 days | Can extend the framework |

Delivery: live sessions, recorded playback, Figma Slides walkthrough, PDF workbook.
Maintenance: quarterly update cycle (tools evolve fast).

### Chapter 8 — Pricing Model

Two views:

#### Internal Costs (DVWDesign)

| Item | Cost | Cadence |

| --- | --- | --- |

| Figma Professional seat | $15–25/seat/month | Monthly |

| Anthropic Claude API | Variable (usage-based) | Monthly |

| DocuMind hosting (self-hosted) | Infrastructure cost | Monthly |

| Figma MCP server | Free (open source) | — |

| Training material development | Dev time (internal) | One-time + quarterly |

#### Client-Facing Rates (DVW as vendor)

Draw from `PRICING-INVOICING-STRATEGY.md` 7-layer model. Proposed packages:

| Package | Scope | Price (indicative) |

| --- | --- | --- |

| Framework Setup | Tool config, MCP setup, CLAUDE.md | €2,500–5,000 one-time |

| Coaching (per session) | 2h hands-on with team | €800–1,200/session |

| Training Program (T2) | 1-day workshop, 5 attendees | €3,500–5,000/day |

| Training Program (T3) | 2-day deep-dive | €6,000–9,000 |

| Training Material License | Slides + playbook + recordings | €1,500/year |

| Maintenance Retainer | Monthly framework updates | €500–1,500/month |

| UX Review | 2-day audit (user/team needs) | €3,000–5,000 |

##### All prices indicative — finalize with RandD pricing model

### Chapter 9 — UX Review

Current team workflow pain points the framework addresses. Open questions for next
iteration (what users still find friction-heavy). Status of adoption across DVW repos.

### Chapter 10 — Roadmap

Short (this month), medium (Q3), long (H2):

- Short: NodeId destinations per repo, DISPATCH-065 rollout, DISPATCH-064 Group B curation

- Medium: Figma Slides generation via MCP, in-place diagram editing (pending Figma API)

- Long: Figma Agent programmatic API (if Figma releases one), full DocuMind ↔ Figma sync

---

## Slide Deck Structure (Both Tracks)

### External Pitch (12–15 slides)

```text

01. Hero — "AI-Powered Design Operations at Scale"

02. The Problem — Design chaos: drift, broken links, scattered docs

03. Our Answer — The Figma AI Framework (5 layers in one image)

04. What It Does — 3 capabilities (diagram, design-to-code, bulk editing)

05. Before vs After — Side-by-side: old workflow / new workflow

06. Results — Numbers: 311% ROI, 8× PNG quality, 14 repos synced

07. Figma Agent — What's new in May 2026 (canvas AI)

08. Training Offer — 3 tiers, delivery formats

09. Pricing — 3 packages (starter / standard / full)

10. Timeline — What setup looks like (Week 1-4)

11. About DVWDesign — Why us

12. Next Step — CTA

```

### Internal Strategy (20–25 slides)

All of the above + framework layer deep-dives, team assignment map, CRON meeting
schedule, per-repo capability inventory, P&L breakdown, open R&D questions.

---

## Slide Format Decision

**Recommended: Marp** (`@marp-team/marp-cli`)

- Markdown-first, no framework lock-in

- Exports: HTML (web-hosted), PDF, PPTX (PowerPoint), ODP (LibreOffice)

- Keynote: open PPTX in Keynote (native import)

- No build system needed: `npx @marp-team/marp-cli slides.md --html --pdf --pptx`

### Stretch: Figma Slides

After Marp decks are final, push to Figma Slides via `use_figma` MCP for live
presentation quality. Figma Slides exports PDF natively.

---

## Timeline (This Week)

| Day   | Date               | Milestone                                                           |

| ----- | ------------------ | ------------------------------------------------------------------- |

| Day 1 | 2026-05-21 (today) | Pre-plan approved; report skeleton + dispatch sent; CRON configured |

| Day 2 | 2026-05-22         | Full report first draft; slide outlines per team confirmed          |

| Day 3 | 2026-05-23         | Internal deck complete; external deck v1; pricing validated         |

| Day 4 | 2026-05-24         | External deck polished; Figma Slides attempt; exports generated     |

| Day 5 | 2026-05-25         | Final review; all artifacts indexed in DocuMind; presentation ready |

---

## Blockers & Dependencies

| Blocker                                | Unblocked by                                                    |

| -------------------------------------- | --------------------------------------------------------------- |

| AgentHub API key invalid               | Check key in `~/.claude/settings.json` or RootDispatcher config |

| DesignCreation repo not cloned locally | Clone or delegate to remote agent                               |

| NodeId per repo still missing          | User creates FigJam sections + fills `repository-registry.json` |

| Final pricing figures                  | RandD agent validates against 7-layer model                     |

| Figma Slides MCP availability          | Check `use_figma` tool schema before Day 4                      |

---

## CRON Meeting Spec

Each CRON fires a DocuMind/RootDispatcher agent that:

1. Reads today's dispatch state (`dispatches/pending/` vs `dispatches/applied/`)

2. Checks AgentHub feed for new discoveries

3. Reads `docs/reports/` and `docs/slides/` for progress

4. Writes a `docs/meetings/YYYY-MM-DD-HH-MM-{type}.md` report

5. Posts a summary to AgentHub (`publish_discovery`)

Duration tracked via timestamp diff between start and report write.
Decisions logged as `decisions.jsonl` entries in RootDispatcher.

---

## Questions Before Full Execution

None blocking. Proceeding to dispatch and report skeleton on approval.
