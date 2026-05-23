---

marp: true
theme: default
paginate: true
footer: "DVWDesign — Internal — Figma AI Framework — 2026 — CONFIDENTIAL"
style: |
  section {
    font-family: 'Inter', 'Helvetica Neue', sans-serif;
    background: #FAFAFA;
    color: #1A1A1A;
  }
  section.title {
    background: #0D0D0D;
    color: #FFFFFF;
    text-align: center;
    justify-content: center;
  }
  section.chapter {
    background: #0066FF;
    color: #FFFFFF;
    justify-content: flex-end;
  }
  section.chapter h1 { font-size: 2.2em; }
  section.chapter p { opacity: 0.7; }
  section.stub {
    border: 3px dashed #FF6600;
    background: #FFF8F0;
  }
  h1 { color: #0D0D0D; font-size: 1.7em; }
  h2 { color: #333; font-size: 1.2em; border-bottom: 2px solid #E0E0E0; padding-bottom: 4px; }
  table { font-size: 0.8em; width: 100%; }
  th { background: #E8E8E8; }
  code { background: #F0F0F0; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; }
  blockquote { border-left: 4px solid #FF6600; padding-left: 1em; background: #FFF8F0; }
  .stub-note { color: #FF6600; font-style: italic; font-size: 0.9em; }

---

<!-- markdownlint-disable MD025 MD024 MD036 -->

<!-- _class: title -->

# DVWDesign Figma AI Framework

## Internal Strategy Deck

### 2026-05-21 — CONFIDENTIAL

Coordinated build: DocuMind · ProductMarketing · RandD · FigmaDSController · Figma-Plug-ins · RootDispatcher

---

## Agenda

1. Framework Overview (5 layers + Figma Agent)

2. What We Solved — Technical + Business View

3. Capability Inventory by Repo

4. R&D Study & Gains

5. Training Program Design

6. Pricing (Internal Costs + Client Rates)

7. Team Assignments (who owns what)

8. CRON Meeting Structure

9. Open R&D Questions

10. Roadmap — Now / Next / Later

---

<!-- _class: chapter -->

# Chapter 1

## Framework Overview

---

## The Five Layers

```text

┌───────────────────────────────────────────────────────┐
│  L5 Skills & Commands                                 │
│  /figma-diagram · /figma-curate · /figma-use          │
│  /figma-generate-design · /figma-code-connect         │
├───────────────────────────────────────────────────────┤
│  L4 MCP Server (Figma MCP — programmatic bridge)      │
│  generate_diagram · get_design_context · get_figjam   │
│  curate_diagram · register_diagram · get_diagrams     │
├───────────────────────────────────────────────────────┤
│  L3 Scripts (Node.js automation)                      │
│  export-figma-png.mjs · sync-markdown-config.mjs      │
│  scan-all-repos.mjs · fix-markdown.mjs                │
├───────────────────────────────────────────────────────┤
│  L2 Plugins (Figma-Plug-ins repo)                     │
│  Canvas-native operations: DS injection, inspection   │
├───────────────────────────────────────────────────────┤
│  L1 REST API (Figma /v1/images/ · /v1/files/)         │
│  PNG export scale=2 · Variables · Node structure      │
└───────────────────────────────────────────────────────┘

              + Figma Agent (May 2026, additive)

```

---

## Figma Agent vs Our MCP — Key Distinction

| | **Figma Agent** | **Our MCP Server** |

| --- | --- | --- |

| Where it runs | Inside Figma canvas | CLI / agent sessions |

| Who triggers it | Human designer | AI agent / script |

| What it can do | Bulk canvas edits, design exploration | Design→Code, Code→Canvas, registry |

| Scriptable? | No (interactive only) | Yes (fully programmatic) |

| Available on | Professional+ (full seat) | Any Claude Code session |

| Launched | May 2026 (beta) | Production since 2025 |

### They work in sequence, not competition

---

## The Triple Output Rule

Every diagram produces 4 artifacts:

| Artifact | Format | Where | Role |

| --- | --- | --- | --- |

| Mermaid source | `.mmd` | `docs/diagrams/` each repo | Version control source of truth |

| PNG preview | `.png` | `docs/diagrams/` each repo | GitHub, PRs, docs |

| FigJam node | Board URL | Central board | Collaboration, presentation |

| Registry row | SQLite | DocuMind `diagrams` table | Tracking, staleness, relink |

**Central board:** `fileKey = L8gOzoOCb90ur2g9fDI9hm`

---

## Diagram Registry Flow

```text

/figma-diagram invoked
        ↓
get_diagrams({ repo }) → pre-flight check
        ↓
[skip if current] [regenerate if stale] [generate if new]
        ↓
Write .mmd → render .png (mmdc 2× retina placeholder)
        ↓
generate_diagram({ fileKey, nodeId }) → FigJam section
        ↓
register_diagram → DocuMind DB (SHA-256 hash stored)
        ↓
/figma-curate → curate_diagram → 14 repos updated
                              ↓
                   export-figma-png.mjs → 185kb PNG

```

---

<!-- _class: chapter -->

# Chapter 2

## What We Solved

---

## Problems → Solutions (Technical View)

| Problem                 | Root Cause                            | Solution                                   |

| ----------------------- | ------------------------------------- | ------------------------------------------ |

| Diagram drift           | `.mmd` changes after FigJam generated | SHA-256 staleness detection                |

| Broken FigJam links     | Standalone files deleted              | Curated node URLs (permanent)              |

| Low PNG quality         | mmdc default = 22kb                   | Figma REST export = 185kb (8×)             |

| Manual board placement  | No destination config                 | Pre-configured `nodeId` per repo           |

| Duplicate generation    | No pre-flight visibility              | `get_diagrams` check before every run      |

| Cross-repo link drift   | 14 repos, manual grep                 | `curate_diagram` rewrites all refs at once |

| Scattered documentation | No central index                      | DocuMind FTS5 + graph (620+ files)         |

---

## Business Problems → Solutions

| Business Problem                     | Solution Layer                                    |

| ------------------------------------ | ------------------------------------------------- |

| "Is this design still current?"      | DocuMind staleness detection + dashboard          |

| "What changed between handoffs?"     | `.mmd` diffs in git, SHA-256 hash tracking        |

| "Where's the latest diagram?"        | Registry `active_url` field (always current)      |

| "Docs in 14 places, nothing synced"  | Single curate call propagates everywhere          |

| "Design and code keep diverging"     | MCP `get_design_context` → direct code generation |

| "Components renamed, docs still old" | Figma Agent bulk naming standardization           |

---

<!-- _class: chapter -->

# Chapter 3

## Capability Inventory by Repo

---

## DocuMind — Documentation Intelligence

### Capabilities

- SQLite FTS5 full-text search (620+ files, < 100ms)

- Diagram registry: register, curate, stale detection

- Document graph: 8 relationship types, recursive CTE

- Scheduled scans: incremental (hourly), full (daily 2am), PDF (weekly)

- MCP tools: `search_docs`, `get_diagrams`, `register_diagram`, `curate_diagram`

- REST API on port 9000; PM2-managed daemon

**Active diagrams:** 16+ registered, 4 fully curated

---

## RootDispatcher — Coordination Hub

### Capabilities

- Dispatch system: 66+ cross-repo dispatches coordinated

- Repository registry: 19+ repos, authoritative config

- AgentHub integration: availability broadcast, discovery feed

- PM2 ecosystem config: all services registered

- Memory system: changelog, decisions, per-repo profiles

### Current blockers

- AgentHub API key invalid (blocks feed coordination)

- DesignCreation repo not cloned locally

---

## FigmaDSController + Figma-Plug-ins

### FigmaDSController

- Design token / variable management

- Component library maintenance

- `get_variable_defs` MCP integration

- Design-to-code via `get_design_context`

### Figma-Plug-ins

- Custom plugins for canvas operations

- DS injection, naming enforcement, component inspection

- Complement to MCP (handles canvas-only operations)

- Plugin API where MCP has no access

> *Chapter 4 content (What It Enhances) owned by FigmaDSController — fill by 2026-05-22*

---

## FigmailAPP + CampaignManager

### FigmailAPP

- Email design from Figma → MJML → rendered HTML

- 7-layer pricing model integrated

- Figma Buzz candidate: dark mode variants, layout exploration

### CampaignManager

- Campaign orchestration (planning, approvals, publishing)

- Figma Buzz integration: 0% overlap, 100% synergistic

- ROI: 311% over 3 years, $316K–$480K vs build-in-house

---

## RandD — Research & Proposals

### Existing assets we can draw from

| Asset                                 | Key Numbers                                  |

| ------------------------------------- | -------------------------------------------- |

| Figma Buzz + CampaignManager analysis | 311% ROI, $316K–$480K saved                  |

| Pricing & invoicing strategy          | 7-layer model, SDK `@design-dvw/pricing`     |

| Figma Buzz integration proposal       | Platform analysis, capabilities, limitations |

| Compliance registry                   | AI Act, GDPR, legal templates                |

> *Chapters 5, 8 owned by RandD — fill by 2026-05-22*

---

<!-- _class: chapter -->

# Chapter 4

## R&D Study & Gains

### Full content: RandD — see DISPATCH-066

---

## R&D Gains — Quantified

| Metric             | Before             | After              | Delta              |

| ------------------ | ------------------ | ------------------ | ------------------ |

| PNG quality        | 22kb               | 185kb              | **8×**             |

| Search latency     | Manual grep        | < 100ms            | Instant            |

| URL propagation    | Manual in 14 repos | 1 call             | **14× faster**     |

| Board placement    | Manual move        | Auto (nodeId)      | **0 manual moves** |

| Duplicate diagrams | Common             | Pre-flight blocked | **Eliminated**     |

| Figma Buzz ROI     | Build in-house     | Integrate          | **311% / $316K+**  |

---

## Figma Agent — R&D Assessment

### High value for

- FigmaDSController: bulk component naming, variant documentation

- FigmailAPP: dark mode generation, email layout exploration

- Design reviews: comment-to-action plan conversion

### Not useful for (yet)

- CLI automation — interactive only

- In-place FigJam editing — create-only, no write-back

- Scriptable dispatches — no programmatic API exposed

**Watch for:** Figma Agent REST/MCP API (if released — changes everything)

---

<!-- _class: chapter -->

# Chapter 5

## Training Program

### Full content: ProductMarketing — see DISPATCH-066

---

## Training Tiers

| Tier             | Who            | Format              | Duration | Price        |

| ---------------- | -------------- | ------------------- | -------- | ------------ |

| **T1 Awareness** | All            | Webinar + Q&A       | 30 min   | Free         |

| **T2 User**      | Designers, PMs | Workshop + playbook | 1 day    | €3,500–5,000 |

| **T3 Admin**     | Devs, agents   | Deep-dive           | 2 days   | €6,000–9,000 |

### Scale model

- Recordings + playbook licensed annually (€1,500/yr)

- Train-the-trainer available (1 additional day)

- Quarterly material updates (tools evolve fast)

---

<!-- _class: chapter -->

# Chapter 6

## Pricing

### Validate: RandD — see DISPATCH-066

---

## Internal Costs (Running the Stack)

| Item                    | Cost           | Cadence   |

| ----------------------- | -------------- | --------- |

| Figma Professional seat | $15–25/seat    | Monthly   |

| Claude API              | Usage-based    | Monthly   |

| DocuMind server         | Infrastructure | Monthly   |

| Figma MCP               | Free           | —         |

| Training material dev   | Internal time  | Quarterly |

**Note:** Total monthly cost scales with seat count. DocuMind is self-hosted — no SaaS fee.

---

## Client Packages

|                  | **Starter**      | **Standard**      | **Premium**        |

| ---------------- | ---------------- | ----------------- | ------------------ |

| Setup            | ✓                | ✓                 | ✓                  |

| T1               | ✓                | ✓                 | ✓                  |

| T2 User          | —                | ✓                 | ✓                  |

| T3 Admin         | —                | —                 | ✓                  |

| Coaching         | 1 session        | 3 sessions        | Unlimited (6mo)    |

| Material License | —                | 1yr               | 1yr                |

| Retainer         | —                | —                 | 6mo                |

| **Price**        | **€3,500–6,000** | **€9,000–14,000** | **€18,000–28,000** |

### Finalize with RandD 7-layer model before quoting

---

<!-- _class: chapter -->

# Chapter 7

## Team Assignments

---

## Who Owns What

| Chapter                | Owner              | Due        |

| ---------------------- | ------------------ | ---------- |

| 1 — Executive Overview | ProductMarketing   | 2026-05-22 |

| 2 — What We Built      | DocuMind ✓         | Done       |

| 3 — What It Solves     | ProductMarketing   | 2026-05-22 |

| 4 — What It Enhances   | FigmaDSController  | 2026-05-22 |

| 5 — R&D Study          | RandD              | 2026-05-22 |

| 6 — R&D Gains          | RandD + DocuMind ✓ | 2026-05-22 |

| 7 — Training Program   | ProductMarketing   | 2026-05-22 |

| 8 — Pricing Model      | RandD              | 2026-05-23 |

| 9 — UX Review          | FigmaDSController  | 2026-05-23 |

| 10 — Roadmap           | RootDispatcher     | 2026-05-23 |

---

## Slide Contributions

### External pitch deck (12 slides — DocuMind builds)

- Slides 1–3: DocuMind (framework, layers, agent)

- Slides 4–6: ProductMarketing (problems, gains, value)

- Slides 7–9: RandD (Figma Buzz, numbers, training)

- Slides 10–12: ProductMarketing (pricing, setup, CTA)

### Internal deck (this file — DocuMind builds)

- All chapters above + chapter contribution slides from each repo

---

<!-- _class: chapter -->

# Chapter 8

## CRON Meeting Structure

---

## Scheduled Agent Sessions

| Session         | Cron           | Job ID     | Output                                        |

| --------------- | -------------- | ---------- | --------------------------------------------- |

| Daily Standup   | 09:03 weekdays | `787398bb` | `docs/meetings/YYYY-MM-DD-standup.md`         |

| Decision Log    | 18:03 weekdays | `5ce3f001` | `docs/meetings/YYYY-MM-DD-decisions.md`       |

| Weekly Strategy | 08:33 Mondays  | `158951a3` | `docs/meetings/YYYY-MM-DD-weekly-strategy.md` |

**Note:** CRONs are session-scoped. Re-run CRON setup at each session start.
Auto-expire after 7 days.

### Meeting report format

- Done / In Progress / Blocked

- Decisions made + reasoning

- Next actions + owner

---

<!-- _class: chapter -->

# Chapter 9

## Open R&D Questions

---

## Unresolved (Action Required)

| Question                                                      | Owner              | Urgency |

| ------------------------------------------------------------- | ------------------ | ------- |

| FigJam `nodeId` per repo — where do users fill this in?       | User action        | High    |

| AgentHub API key invalid — which key is it?                   | RootDispatcher     | High    |

| DesignCreation repo not cloned — needed for design team agent | User action        | Medium  |

| DISPATCH-064 Group B — 9 old redirect URLs uncurated          | DocuMind           | Medium  |

| "shared-package-hub" node `234-3965` — what diagram?          | User clarification | Low     |

**Answer to nodeId question:** Fill in `repository-registry.json` — add `figma_destination: { fileKey, nodeId }` per active repo entry. User creates board sections first, then provides node IDs.

---

## Future R&D Directions

| Direction                               | Status               | Value     |

| --------------------------------------- | -------------------- | --------- |

| Figma Agent programmatic API            | Waiting on Figma     | Very high |

| In-place FigJam node editing            | Waiting on Figma MCP | High      |

| Figma Slides generation via `use_figma` | Available now        | High      |

| Multi-agent Figma design reviews        | Possible now         | Medium    |

| DocuMind ↔ Figma full sync              | Architecture TBD     | High      |

---

<!-- _class: chapter -->

# Chapter 10

## Roadmap

### RootDispatcher to validate — see DISPATCH-066

---

## Now — May 2026

| Item                                        | Status                                |

| ------------------------------------------- | ------------------------------------- |

| FigJam section nodeId per repo              | Blocked — user creates board sections |

| DISPATCH-065 rollout (destination workflow) | Pending — all repos applying          |

| DISPATCH-064 Group B (9 diagrams)           | Pending — needs user node URLs        |

| DISPATCH-066 (this presentation)            | In progress                           |

| AgentHub API key fix                        | Blocked                               |

---

## Next — Q3 2026

| Item                             | Effort           | Value  |

| -------------------------------- | ---------------- | ------ |

| Training program v1 launch       | Medium           | High   |

| Figma Slides via `use_figma` MCP | Medium           | High   |

| In-place FigJam editing          | Waiting on Figma | High   |

| CRONs persisted to disk          | Low              | Medium |

## Later — H2 2026

- Figma Agent programmatic API integration

- Full DocuMind ↔ Figma sync

- Multi-agent cross-repo design reviews

- Design system compliance scanner (code vs. variables)

---

<!-- _class: title -->

# Summary

## Today (2026-05-21)

- Pre-plan ✓ · DISPATCH-066 ✓ · Full report ✓

- External pitch deck ✓ · Internal deck ✓

- Neophyte exec summary ✓ · CRON meetings ✓

## Tomorrow (2026-05-22)

- Repo agents fill their chapters (Chapters 1, 3, 4, 5, 7, 8, 9, 10)

- Marp exports: HTML + PDF + PPTX

**Day 3–4:** Polish · Figma Slides attempt · Final exports

**Day 5:** Presentation ready.
