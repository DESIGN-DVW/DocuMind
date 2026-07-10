# Feature Research

**Domain:** Docs-as-code presentation pipeline (Marp markdown decks → translated, rendered, deployed slides)
**Researched:** 2026-07-10
**Confidence:** MEDIUM-HIGH (Marp/DeepL mechanics verified against official docs/GitHub; daemon-orchestration and Figma Slides specifics partly inferred from community sources — flagged per item)

## Context Note

This file replaces the prior (v3.3 Kuzu graph DB) research content, which is obsolete — Kuzu was
retired per ADR-001 (2026-07, SQLite recursive CTEs cover graph traversal). This research covers the
v3.4 Presentation Pipeline milestone only: automated translate → render → deploy pipeline for Marp
markdown decks, agent-orchestrated by the DocuMind daemon. Already built and NOT re-researched: markdown
indexing/lint/fix, chokidar watcher + cron scheduler, MCP tools, diagram registry, REST API.

## Feature Landscape

### Table Stakes (Users Expect These)

Features any docs-as-code slide pipeline (translate → render → deploy) is assumed to have. Missing these = the pipeline feels broken or unsafe to trust as "single source of truth."

| Feature | Why Expected | Complexity | Notes |
| --------- | -------------- | ------------ | ------- |
| Marp render to HTML/PDF/PPTX from one command | Every docs-as-code slide tool (Marp, reveal-md, Slidev) treats multi-format export as baseline; `marp-cli` supports `--pdf`, `--pptx`, `--html`, `--images` natively via CLI flags or `.marprc.yml` config | LOW | `marp-cli` is the whole point of the tool — no custom rendering logic needed, just flag orchestration in `slides:build` npm script |
| `.marprc.yml` central config (theme paths, output dirs, allow-local-files) | Docs-as-code tools externalize build config so CI and local runs stay identical | LOW | One file, checked into repo; avoids CLI flag drift between manual runs and daemon-triggered runs |
| Front-matter/directive preservation during translation | Marp decks use YAML front-matter (`marp: true`, `theme:`, `paginate:`, `style: \|` CSS block) and inline HTML-comment directives (`<!-- _class: hero -->`, `<!-- markdownlint-disable -->`) as **structural**, not prose — a naive full-text translation call will mangle or translate these and break rendering | MEDIUM-HIGH | This is the highest-risk table-stakes feature. See "Translation-Fidelity Expectations" below — DeepL has no native Markdown/Marp awareness (confirmed via `deepl-node` GitHub issue #26, still open) |
| Code fence / inline code preservation | Fenced blocks (`` ```text ``, `` ```diagram ``) and inline code spans (`` `slides:build` ``) must survive translation byte-identical — DeepL's plain-text mode will translate code content or corrupt fence markers (community reports of ` ``` ` becoming ` `` ` after MT) | MEDIUM | Requires placeholder-swap strategy (extract → protect → translate → restore), not raw API passthrough |
| Proper-noun / brand-term protection | Product and brand names (DVWDesign, Figma, Marp, DeepL, MCP, DocuMind, FigJam, PPTX) must never be auto-translated or transliterated | MEDIUM | DeepL glossary API (`POST /v3/glossaries`, `glossary_id` on translate calls) is purpose-built for this — confirmed official capability |
| Table structure preservation (GFM pipes/separators) | DocuMind's own DVW001/DVW002 lint rules require no blank lines mid-table and minimal `\| - \|` separators — a translated table that reflows cell width or inserts a blank line breaks the deck AND fails the repo's own lint gate | MEDIUM | Only cell **text** should be translated; pipe/separator syntax is structural and must pass through untouched |
| Incremental rebuild (skip unchanged decks) | Standard docs-as-code CI behavior — MkDocs `--dirty`, Hugo, and static-site pipelines all skip unchanged source to keep builds fast; DocuMind already has a `content_hash` pattern for markdown indexing that this can reuse | LOW-MEDIUM | Reuse existing `content_hash` column/pattern rather than inventing a new mechanism — hash the EN `.md` to decide whether to re-translate/re-render |
| Deploy dry-run mode | Every FTP-deploy tool surveyed (`ftp-deploy`, `@samkirkland/ftp-deploy` GitHub Action) ships a dry-run flag that lists what *would* change without touching the remote — non-negotiable when creds don't exist yet | LOW | Matches the milestone's explicit gap (FTP creds pending) — dry-run must be the default until `.env` creds land |
| Deploy manifest / state tracking | `@samkirkland/ftp-deploy` tracks a `.ftp-deploy-sync-state.json` so only diffed files upload on subsequent runs — avoids full-tree re-upload every deploy | MEDIUM | Needed for both correctness (avoid clobbering) and status reporting (what shipped, when) |
| Status/log output per pipeline run | Any daemon-orchestrated multi-stage pipeline (translate → render → deploy) needs a per-stage pass/fail/skip record — otherwise silent partial failures (e.g., translate OK, deploy blocked on missing creds) are invisible | LOW-MEDIUM | DocuMind already has a `scan_runs` table pattern for scheduler jobs — reuse the same shape (run id, stage, status, timestamp, error) for pipeline runs |
| Watcher loop protection | chokidar (already used by DocuMind's watcher) will re-trigger on its own generated output unless explicitly ignored — confirmed pattern from chokidar docs/issues: function-form `ignored`, `awaitWriteFinish`, and debounce | MEDIUM | Must ignore `*.fr.md`, `/dist`, `/html`, `/pdf`, `/pptx` output globs, or the daemon will translate→render→write→re-detect→re-translate forever |

### Differentiators (Competitive Advantage)

Not required to be "a working slides pipeline," but this is where the DocuMind-specific value shows: agent-orchestrated, single-user, ecosystem-integrated.

| Feature | Value Proposition | Complexity | Notes |
| ------- | ----------------- | ---------- | ----- |
| Daemon-orchestrated trigger (chokidar + cron, no manual CI) | Most docs-as-code slide setups rely on a human running `npm run build` or a GitHub Action on push. DocuMind already runs a persistent watcher + scheduler — wiring the pipeline into that means decks publish themselves the moment the EN source changes, with zero manual step | MEDIUM | Direct extension of existing `daemon/watcher.mjs` — this is the actual differentiator, everything else is standard tooling |
| Glossary-backed DeepL translation (not just tag-handling) | Generic markdown-translator tools (md-translator, OpenL) protect syntax but don't guarantee brand-term consistency across every deck; a shared DeepL glossary (`glossary_id`) keeps "DocuMind," "MCP," "FigJam" etc. identical across all decks and re-translations, forever | LOW-MEDIUM | One-time glossary creation via DeepL API, referenced on every translate call — cheap to build, high consistency payoff |
| ProductMarketing content updates arriving as RootDispatcher dispatches | Other repo agents can propose slide content changes without touching this repo directly or bypassing the "EN is the only hand-edited source" rule — dispatch lands as a diff/PR-like artifact into `docs/slides/`, pipeline picks it up automatically | MEDIUM | Depends on RootDispatcher dispatch mechanism (already built ecosystem-wide) — this repo just needs to treat `dispatches/pending/DocuMind/` as a trigger source, same as existing dispatch protocol |
| Editable PPTX via LibreOffice (`soffice`) | Marp's own PPTX export is image-per-slide (uneditable) — confirmed via Marp CLI docs/community reports. Routing through `soffice --headless --convert-to pptx` (or `--pptx-editable` flag path) produces text-editable PowerPoint, which matters for a sales/pitch-deck use case where a human may want to tweak a slide post-export | MEDIUM-HIGH | Known prereq gap: `soffice` not on PATH — this differentiator is currently blocked, same class of gap as DeepL/FTP/Figma creds |
| Figma Slides push as canonical "live" document | Official Figma MCP now ships a `figma-use-slides` skill (confirmed via `figma/mcp-server-guide` repo) that lets `use_figma` update a Slides deck against a template from markdown/content — turning the pipeline's terminal stage into a real, presentable Figma file instead of a static HTML page nobody visits live | HIGH | Currently blocked on Figma MCP auth per milestone context — ship as a documented runbook now, automate once auth unblocks. This is the single highest long-term differentiator (competitors stop at static HTML/PDF) |
| AgentHub `publish_discovery` on successful deploy | Other repos/agents in the ecosystem learn "a new deck shipped" without polling — standard DVWDesign ecosystem pattern already used elsewhere, applied here for the first time to a content pipeline rather than code | LOW | Pure integration work — AgentHub publish call already exists as a pattern, just needs a deploy-stage hook |
| Single `slides:build` command spanning EN+FR+all formats | Reduces the entire pipeline surface to one invocable command for both manual (`npm run slides:build`) and daemon-triggered paths — no drift between "what a human runs" and "what the watcher runs" | LOW | Straightforward npm script composition once render/translate stages exist independently |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
| ------- | ------------- | ---------------- | ----------- |
| WYSIWYG / browser-based slide editor | "Let non-technical stakeholders edit slides directly" | Directly contradicts the milestone's core decision: EN Marp `.md` is the *only* hand-edited artifact. A WYSIWYG editor writing back to rendered HTML/PPTX creates a second source of truth and breaks the translate/render/deploy determinism the whole pipeline depends on | Edit the EN `.md` in any text editor / Claude Code; use Figma Slides (once live) as the presentation-layer editing surface for last-mile tweaks, never as the source |
| Multi-language beyond French | "While we're translating, why not ES/DE/JA too?" | Milestone explicitly scopes to "French always required" — every additional language multiplies glossary maintenance, translation-fidelity test surface, and render/deploy matrix size for zero validated demand | Ship EN+FR pipeline first; if a second language is ever needed, the translation stage is already generalized (DeepL supports target-language param) — add it as its own future milestone, not scope creep now |
| Real-time / live-reload slide preview server | Feels natural for a "docs-as-code" workflow (like Hugo/Vite dev servers) | Marp CLI already ships `marp -s` server mode for local preview — building a custom live-reload layer duplicates an existing tool for a single-user setup where `marp --preview` or the VS Code Marp extension already solves it | Use `marp-cli`'s built-in `--server`/`--preview` flag locally; no custom infra needed |
| Continuous re-render on every keystroke/save | "Instant feedback while editing" | For a daemon-orchestrated pipeline (not a live dev server), firing translate+render+deploy on every keystroke would spam the DeepL API (metered/costly), hammer the FTP host, and risk the exact watcher loop this milestone explicitly calls out as needing protection | Debounce watcher events (chokidar `awaitWriteFinish` + short debounce window); trigger pipeline on settled file-save, not per-keystroke |
| Auto-translating arbitrary repo docs through this pipeline | "We already have DeepL wired up, why not translate all 620+ docs?" | Scope explosion — this milestone is `docs/slides/` only. General doc translation has different fidelity requirements (no Marp directives, different table conventions) and belongs to a separate future milestone if ever pursued | Keep the translation stage scoped to `docs/slides/**/*.md`; if broader doc translation is wanted later, treat it as a new pipeline, not an extension of this one |
| Allowing direct hand-edits to generated `.fr.md`, HTML, PDF, or PPTX outputs | "I just need to fix one typo in the French deck quickly" | Silently overwritten on the next EN-triggered pipeline run — creates a false sense of persistence and eventually a "why did my fix disappear" support burden | Fix the typo (or glossary entry) in the EN source or DeepL glossary; let the pipeline regenerate. If a typo is FR-only (bad translation), fix via glossary override, not manual `.fr.md` edit |

## Feature Dependencies

```text
Marp toolchain (marp-cli + .marprc.yml)
    └──requires──> nothing new (pure devDependency + config)

DeepL translation stage (EN → .fr.md)
    └──requires──> Marp toolchain (defines what "preserve directive" even means — need to parse front-matter/directives before protecting them)
    └──requires──> DEEPL_API_KEY (known gap)
    └──requires──> Glossary created in DeepL account (proper-noun protection)

Render stage (EN + FR → HTML/PDF/PPTX)
    └──requires──> Marp toolchain
    └──requires (FR branch only)──> DeepL translation stage output (.fr.md must exist before FR render)
    └──requires (editable PPTX)──> soffice on PATH (known gap)

FTP deploy stage
    └──requires──> Render stage output (HTML files to upload)
    └──requires──> FTP credentials in .env (known gap)
    └──enhances (dry-run)──> Deploy manifest (diff against previous state)

Figma Slides push
    └──requires──> Figma MCP auth unblocked (known gap — runbook only until then)
    └──may require──> Render stage output OR raw EN/FR markdown (unconfirmed which figma-use-slides skill consumes — LOW confidence, verify during phase research)

Daemon watcher orchestration (trigger on deck change)
    └──requires──> Existing chokidar watcher (daemon/watcher.mjs)
    └──requires──> Watcher loop protection (ignore .fr.md, /dist, /html, /pdf, /pptx globs)
    └──requires──> Incremental rebuild / content-hash check (avoid re-running unchanged decks)
    └──enhances──> All four pipeline stages (translate/render/deploy/Figma) — this is the glue, not a stage itself

ProductMarketing dispatch → EN source updates
    └──requires──> Existing RootDispatcher dispatch mechanism (ecosystem-wide, already built)
    └──enhances──> Daemon watcher orchestration (dispatch-applied change is just another EN .md change that triggers the pipeline)

AgentHub publish_discovery on deploy
    └──requires──> FTP deploy stage (or Figma push) reaching a terminal success state
    └──enhances──> Ecosystem awareness (not a hard pipeline dependency — pipeline works without it, just less visible)

Deploy manifest / state tracking ──conflicts──> "always full re-upload" naive approach
    (manifest-based diffing is strictly better once dry-run mode proves the diff logic is correct)
```

### Dependency Notes

- **DeepL translation requires Marp toolchain first, not just DeepL API access:** you cannot design the placeholder-protection scheme (front-matter, directives, code fences) without first enumerating exactly which Marp syntax elements exist in the corpus — this argues for building/finalizing the Marp render stage's understanding of directives *before* writing the translation-preservation logic, even though translation logically "comes before" render in the pipeline order.
- **FR render requires translation stage output:** the render stage is otherwise stage-order-agnostic (EN render has zero dependency on translation), so EN rendering can be built, tested, and shipped independently of DeepL entirely — useful sequencing if DeepL API key delivery is delayed.
- **Watcher loop protection requires incremental rebuild (content-hash) to be reliable, not just glob-ignore:** glob-ignore alone (`ignored: '**/*.fr.md'`) prevents the watcher from *reacting* to generated files, but content-hash comparison is what prevents *needless re-translation* of an EN deck whose content hasn't actually changed (e.g., a `touch` or metadata-only save). Both are needed; glob-ignore is the safety net, content-hash is the efficiency layer.
- **Figma Slides push dependency is genuinely uncertain (LOW confidence):** the `figma-use-slides` skill's actual input contract (rendered HTML? raw markdown? structured JSON?) wasn't confirmed from public sources during this research pass — flag for phase-specific research when the Figma MCP auth gap is resolved, since it determines whether Figma push depends on the render stage or can bypass it.
- **AgentHub publish is a soft dependency, not a hard one:** deploy can succeed with FTP creds present and AgentHub notification omitted (e.g., AgentHub temporarily down) — treat as best-effort, non-blocking, not a pipeline gate.

## Translation-Fidelity Expectations (What Must Survive Round-Trip Untouched)

Concrete, testable rules derived from the example deck (`docs/slides/external/2026-05-21-figma-ai-pitch-deck.md`) and DeepL's documented capabilities:

1. **YAML front-matter keys and structural values** — `marp: true`, `theme: default`, `paginate: true`, the entire `style: |` CSS block — must be byte-identical in `.fr.md`. Only genuinely human-facing string values inside front-matter (e.g., `footer: "DVWDesign — Figma AI Framework — 2026"`) are candidates for translation, and that's a product decision to make explicit (default recommendation: **do not translate footer/brand strings** — treat as proper-noun-adjacent, protect via glossary or placeholder).
2. **Inline directive comments** — `<!-- _class: hero -->`, `<!-- markdownlint-disable MD025 MD024 MD036 -->` — pass through verbatim; these are not prose and DeepL's tag_handling has no awareness of Marp comment-directive syntax.
3. **Fenced code blocks** (`` ```text ``, `` ```diagram ``, `` ```bash `` etc.) — content inside fences must not be sent through translation at all; extract-protect-restore, not tag_handling alone (confirmed risk: fence markers themselves have been reported corrupted by naive DeepL passthrough).
4. **Inline code spans** (`` `slides:build` ``, `` `curate_diagram` ``) — preserved verbatim.
5. **Proper nouns / brand and product terms** — DVWDesign, Figma, Figma Agent, Marp, MCP, DocuMind, FigJam, DeepL, PPTX, Claude Code, and any other product name appearing in the corpus — pinned via a DeepL glossary (`entries_format: tsv`, EN→FR pairs mapping each term to itself) so they're immune to future MT model drift, not just a one-time manual fix.
6. **Email addresses and URLs** (`david@dvw.design`) — untouched; standard DeepL behavior for non-linguistic tokens, but should be explicitly tested, not assumed.
7. **Numeric metrics and units** (`8×`, `620+`, `< 100ms`, `€3,500–6,000`) — the numbers/symbols themselves untouched; only surrounding prose translated. Currency symbols must not be localized (stay `€`, do not become alternate formatting).
8. **GFM table syntax** — pipe/separator rows (`| - | - |`) untouched; only cell *text content* translated. Post-translation output must still pass DVW001/DVW002 lint (no blank lines inserted mid-table, no padding added) — this should be an automated check in the pipeline, not a manual review step.
9. **Heading markers** (`#`, `##`) untouched; only text after the marker translated.
10. **Slide-separator horizontal rules** (`---` used as Marp slide breaks) must never be reinterpreted as a second YAML front-matter boundary by the translation step — this is a parsing-order risk specific to Marp's dual use of `---`.
11. **`.fr.md` is always fully regenerated, never diffed/patched** — because partial-patch translation of a multi-hundred-line deck risks context loss (DeepL's per-request context differs from a full-document translate), the safest default is: any EN change → full re-translation of that deck, not incremental sentence-level patching. This trades a bit of DeepL API cost for correctness; revisit only if API costs become a real constraint at current single-user scale.

## MVP Definition

### Launch With (v1 — matches milestone's "Active" scope)

- [ ] Marp toolchain (`marp-cli` devDependency, `.marprc.yml`, `slides:*` npm scripts) — foundation everything else builds on
- [ ] DeepL translation stage with placeholder-protection for directives/code/proper nouns — the single highest-risk, highest-value piece; must be correct before anything downstream trusts `.fr.md`
- [ ] Single `slides:build` rendering EN + FR → HTML/PDF/PPTX — proves the full local pipeline works end-to-end without deploy
- [ ] FTP deploy stage in dry-run mode (real deploy activates once creds land) — ships the deploy *logic* now so it's a config flip, not a build project, once creds arrive
- [ ] Daemon watcher trigger with debounce + loop protection (ignore generated globs, content-hash check) — this is the actual product differentiator per PROJECT.md, must not be deferred to "v1.x"
- [ ] Deploy manifest / run-status tracking (reuse `scan_runs`-style table pattern) — needed from day one so dry-run output is inspectable, not just console noise

### Add After Validation (v1.x)

- [ ] Figma Slides live push automation via `use_figma` — trigger: Figma MCP auth unblocked
- [ ] Editable PPTX via `soffice`/LibreOffice — trigger: `soffice` installed and on PATH
- [ ] Real FTP deploy (flip dry-run off) — trigger: FTP creds land in `.env`
- [ ] AgentHub `publish_discovery` on deploy — trigger: deploy stage proven reliable in dry-run for at least one full cycle
- [ ] ProductMarketing dispatch → EN source auto-apply — trigger: at least one manual dispatch-to-slide-edit cycle validated by hand first

### Future Consideration (v2+)

- [ ] Additional target languages beyond FR — defer until a validated business need exists (explicitly out of current scope)
- [ ] Onboarding other repos'/teams' decks onto this same pipeline — defer until DocuMind's own pipeline has run reliably through several real deploy cycles
- [ ] Glossary self-service management (UI or MCP tool to add/edit DeepL glossary terms without touching DeepL dashboard) — defer until glossary size/change-frequency justifies tooling investment

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
| ------- | ---------- | -------------------- | -------- |
| Marp toolchain + `slides:build` | HIGH | LOW | P1 |
| Translation-preservation (directives/code/proper nouns) | HIGH | HIGH | P1 |
| Daemon watcher orchestration + loop protection | HIGH | MEDIUM | P1 |
| FTP deploy dry-run + manifest | MEDIUM | MEDIUM | P1 |
| Deploy/pipeline run-status tracking | MEDIUM | LOW | P1 |
| DeepL glossary for proper nouns | HIGH | LOW | P1 |
| Editable PPTX (`soffice`) | MEDIUM | MEDIUM | P2 |
| Real FTP deploy (creds live) | HIGH | LOW (once creds exist) | P2 |
| ProductMarketing dispatch → EN source | MEDIUM | MEDIUM | P2 |
| AgentHub discovery on deploy | LOW-MEDIUM | LOW | P2 |
| Figma Slides live push | HIGH (long-term) | HIGH | P2 (blocked → runbook now, automate later) |
| Multi-language beyond FR | LOW (unvalidated demand) | HIGH | P3 |

**Priority key:**

- P1: Must have for v3.4 launch
- P2: Should have, activates as external blockers (creds/auth/binaries) clear
- P3: Nice to have, future consideration — not in current milestone

## Competitor / Reference Pattern Analysis

| Feature | Docusaurus i18n (+ MT tools) | MkDocs + static-i18n | DocuMind v3.4 Approach |
| ------- | ----------------------------- | ---------------------- | ------------------------ |
| Translation trigger | Manual export → drop into i18n folder, or CI step on PR | Manual `mkdocs build` per locale, plugin-assisted | Daemon watcher auto-triggers on EN deck save — no manual/CI step needed (single-user differentiator) |
| Code/front-matter preservation | Third-party MT tools (md-translator, OpenL) use placeholder-swap; Docusaurus itself doesn't translate, just routes locale folders | Plugin-dependent, varies | Custom placeholder-swap tailored to Marp's specific directive/comment syntax (no off-the-shelf tool understands Marp specifically) |
| Deploy | Git-push → CI → static host (Netlify/Vercel/GH Pages) | Same pattern, CI-driven | FTP push (older/simpler hosting model, matches existing DVWDesign web host) with dry-run gate |
| "Live" presentation surface | None — static HTML only | None — static HTML only | Figma Slides push (unique to this pipeline — no docs-as-code competitor reference found targeting Figma Slides as a deploy target) |
| Incremental rebuild | Framework-level (only changed MDX rebuilt) | `--dirty` flag, monorepo plugin | Content-hash reuse of existing DocuMind `content_hash` pattern — consistent with how the rest of the platform already avoids redundant work |

## Sources

- [Marp CLI (marp-team/marp-cli) — GitHub](https://github.com/marp-team/marp-cli) — HIGH confidence, official repo
- [Marp: Markdown Presentation Ecosystem](https://marp.app/) — HIGH confidence, official site
- [Marpit Directives documentation](https://marpit.marp.app/directives) — HIGH confidence, official docs
- [marp-team/marp directives.md](https://github.com/marp-team/marp/blob/main/website/docs/guide/directives.md) — HIGH confidence, official source
- [DeepL API — XML and HTML handling](https://developers.deepl.com/docs/xml-and-html-handling/html) — HIGH confidence, official docs
- [DeepL API — Multilingual Glossaries reference](https://developers.deepl.com/api-reference/multilingual-glossaries) — HIGH confidence, official docs
- [DeepL Help Center — Use a glossary with DeepL API](https://support.deepl.com/hc/en-us/articles/4405021321746-Use-a-glossary-with-DeepL-API) — HIGH confidence, official support docs
- [deepl-node GitHub Issue #26 — Feature Request: Markdown Handling](https://github.com/DeepLcom/deepl-node/issues/26) — MEDIUM confidence, confirms no native markdown support (open issue as of research date)
- [md-translator — GitHub](https://github.com/rockbenben/md-translator) — MEDIUM confidence, community tool confirming placeholder-swap as the standard pattern for markdown+MT
- [chokidar — GitHub](https://github.com/paulmillr/chokidar) — HIGH confidence, official repo (already a DocuMind dependency)
- [ftp-deploy — npm](https://www.npmjs.com/package/ftp-deploy) — MEDIUM confidence, widely-used reference implementation
- [SamKirkland/FTP-Deploy-Action — GitHub](https://github.com/SamKirkland/FTP-Deploy-Action) — MEDIUM confidence, confirms dry-run + manifest-state pattern
- [figma/mcp-server-guide — figma-use-slides skill](https://github.com/figma/mcp-server-guide/blob/main/skills/figma-use-slides/SKILL.md) — MEDIUM confidence, official Figma repo but input-contract details not fully verified in this pass — flag for later phase research
- [Docusaurus i18n Introduction](https://docusaurus.io/docs/i18n/introduction) — MEDIUM confidence, reference pattern comparison only
- Project source examined directly: `docs/slides/external/2026-05-21-figma-ai-pitch-deck.md` (existing example deck — used to derive concrete translation-fidelity rules)

---
*Feature research for: DocuMind v3.4 Presentation Pipeline*
*Researched: 2026-07-10*
