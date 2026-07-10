# Project Research Summary

**Project:** DocuMind v3.4 — Presentation Pipeline
**Domain:** Daemon-orchestrated docs-as-code presentation pipeline (Marp Markdown → DeepL translation → multi-format render → FTP/Figma Slides deploy), added to an existing chokidar/node-cron/PM2/SQLite documentation daemon
**Researched:** 2026-07-10
**Confidence:** HIGH

This document fully replaces the prior (2026-04-07) SUMMARY.md, which synthesized v3.3 Kuzu graph-database research. Kuzu was retired per ADR-001 (SQLite recursive CTEs cover graph traversal); all four underlying research files (STACK, FEATURES, ARCHITECTURE, PITFALLS) were rewritten from scratch on 2026-07-10 for the v3.4 milestone and contain zero Kuzu content.

## Executive Summary

DocuMind v3.4 bolts a four-stage content pipeline — translate (DeepL), render (Marp CLI), deploy (FTP), and eventually push to Figma Slides — onto its existing chokidar-watched, PM2-managed, SQLite-backed daemon. This is not a greenfield build: every stack choice, architectural boundary, and integration pattern is constrained by code already present (`daemon/watcher.mjs`, `daemon/scheduler.mjs`, `daemon/registry-lock.mjs`, `config/env.mjs`, `scripts/db/schema.sql`). The recommended stack — `@marp-team/marp-cli`, `deepl-node`, `basic-ftp` — is deliberately minimal: no new markdown-AST library, no bundled Chromium (reuse the `puppeteer` devDependency already resolved for `@mermaid-js/mermaid-cli`), no SFTP client until the deploy protocol is confirmed with the hosting provider. The single highest-risk, highest-value piece of the whole milestone is the DeepL translation stage: DeepL has zero native Markdown or Marp-directive awareness, so front-matter, HTML-comment directives, code fences, and GFM tables (governed by this repo's own DVW001/DVW002 lint rules) must be placeholder-protected and round-trip-validated before any deck is trusted — this is table-stakes, not a nice-to-have, since even the two existing fixture decks contain code blocks and tables.

The recommended approach is additive and staged: build the render pipeline in isolation first (proves the `execFile`/marp-cli subprocess pattern against real fixture decks with zero watcher/translate/deploy risk), then translation (independently CLI-testable, degrades gracefully with no API key), then a ledger table (`slide_pipeline_runs`) so pipeline state is queryable before the watcher is wired in, then watcher integration (where loop-protection is proven end-to-end), then deploy (dry-run by default, atomic staged-then-rename upload), then ecosystem notification (AgentHub REST, not MCP — the daemon is a headless process with no LLM host, so MCP tools are structurally uncallable from it) and Figma Slides (deliberately kept out of the automated loop as an agent-invoked runbook, since it too requires an MCP-capable session).

The primary risk across all four research files is the daemon's own generated output re-entering its own watch scope — a classic file-watcher feedback loop, compounded here because DeepL calls and headless-Chrome renders take seconds, not milliseconds, unlike the fast single-file writes the existing `writingNow` lock was designed for. ARCHITECTURE.md and PITFALLS.md propose different primary defenses for this (see the reconciliation below); both agree that a second, independent risk is overlapping pipeline runs for the same deck, requiring a dedicated per-deck run-lock rather than reliance on the existing shared debounce/lock machinery. Secondary risks — FTP protocol mismatch, `soffice`/Chrome PATH resolution differing between interactive shell and PM2 environment, secrets baked into the public GHCR image, and stale committed binaries already in git history — are all well-understood, single-repo problems with documented fixes, not open research questions.

## Key Findings

### Recommended Stack

Three new dependencies, all officially maintained and directly verified against the npm registry: `@marp-team/marp-cli` (devDependency, shelled out via `execFile` — never imported as a library, matching the existing `markdownlint-cli2`/`@mermaid-js/mermaid-cli` pattern), `deepl-node` (official DeepL SDK, `DeepLClient` class with `tagHandling`/`ignoreTags` and v3 multilingual glossary support), and `basic-ftp` (already transitively present via a `pnpm.overrides` security-patch entry — promoting it to a direct dependency adds nothing new to the tree). No new markdown-parsing library is needed; `gray-matter` and `markdown-it` (both already installed) are sufficient for the placeholder-protection masking scheme. Critically, `puppeteer` is already a devDependency (pulled in by `@mermaid-js/mermaid-cli`, with `pnpm.onlyBuiltDependencies` already forcing its Chromium download) — Marp's PDF/PPTX/PNG export needs a Chromium-family browser via `puppeteer-core`, and reusing `puppeteer.executablePath()` via `--browser-path` avoids a second ~200MB browser download and keeps Docker portability intact.

**Core technologies:**

- `@marp-team/marp-cli` (`^4.4.1`) — renders Marp Markdown decks to HTML/PDF/PPTX/PNG — the only actively maintained CLI renderer for the format; config via `.marprc.yml`/`marp.config.mjs` (cosmiconfig-loaded)
- `deepl-node` (`^1.27.0`) — EN→FR translation via the official DeepL API SDK — ships the `tagHandling`/`ignoreTags`/glossary primitives needed to protect Marp syntax during translation; no native Markdown mode exists (confirmed via open `deepl-node` issue #26), so a custom masking layer is required regardless of SDK choice
- `basic-ftp` (`^6.0.1`) — FTP/FTPS deploy client — promise-based, ESM-native, zero runtime deps, already in the dependency tree; **does not speak SFTP** — protocol must be confirmed with the hosting provider before this choice is locked in (fallback: `ssh2-sftp-client`)
- LibreOffice (`soffice`, system install, not npm) — required only for the experimental `--pptx-editable` flag; confirmed prereq gap (not on PATH), must be pinned via `SOFFICE_PATH` env var rather than relied-upon auto-discovery

### Expected Features

**Must have (table stakes):**

- Marp render to HTML/PDF/PPTX from one command/config (`.marprc.yml`)
- Front-matter, HTML-comment directive, code-fence, and GFM-table preservation during translation — the highest-risk table-stakes item; a naive full-text DeepL call corrupts all four
- Proper-noun/brand-term protection via a DeepL glossary
- Incremental rebuild via content-hash (reuse the existing `documents.content_hash` pattern)
- Deploy dry-run mode (default until FTP creds land) and a deploy manifest/state record
- Per-run status/log tracking (ledger table, same shape as existing `scan_runs`)
- Watcher loop protection (glob-exclude generated output; see Pitfall reconciliation below)

**Should have (differentiators):**

- Daemon-orchestrated trigger — decks publish themselves on EN source save, zero manual/CI step (the actual product differentiator; direct extension of `daemon/watcher.mjs`)
- Glossary-backed translation for cross-deck brand-term consistency
- RootDispatcher-sourced EN content updates (no special-case code needed — a dispatch application is just another file write the watcher already sees)
- AgentHub `publish_discovery` notification on successful deploy (REST, non-fatal, best-effort)
- Editable PPTX via LibreOffice (blocked on `soffice` prereq — build as opt-in, not default)
- Figma Slides push as the eventual "live" presentation surface (blocked on Figma MCP auth; ship as a documented runbook now, automate later — this is the single highest long-term differentiator since no competitor docs-as-code pipeline targets Figma Slides as a deploy target)

**Defer (v2+):**

- Additional target languages beyond French (no validated demand; scope explosion of glossary/QA surface)
- Onboarding other repos'/teams' decks onto this pipeline
- Glossary self-service management tooling
- Real-time/live-reload preview (Marp CLI's own `--server`/`--preview` already covers this for a single-user setup)

### Architecture Approach

The pipeline is a single new processor module (`processors/slides-processor.mjs`, matching the existing one-processor-per-concern convention used by `relink-processor.mjs`) exposing `translateDeck()` / `renderDeck()` / `deployDeck()` / `recordRun()`, called identically from four entry points: the chokidar watcher, a thin CLI script (`scripts/publish-slides.mjs`), a REST endpoint (`POST /slides/publish`), and an MCP tool (`publish_slides`) — no orchestration-logic duplication across surfaces. A new `slide_pipeline_runs` table (not a reuse of the existing `conversions` table, whose `CHECK` constraint and one-row-per-format-conversion shape don't fit a multi-stage run) is the single source of truth for pipeline state, mirroring the `stale_diagrams`/`latest_slide_runs` "last known good" view pattern already established for the diagram registry. Daemon-to-daemon notification (AgentHub) is plain REST `fetch()`, never MCP — MCP tools only exist inside an LLM agent's tool-call loop, and the daemon is a headless PM2 process with no agent host attached; this same reasoning is why Figma Slides push is architected as a manual, agent-invoked runbook step rather than an automated pipeline stage.

**Major components:**

1. `daemon/watcher.mjs` (MODIFIED) — detects EN deck changes via an `isSlidesEnSource()` predicate, dispatches to the pipeline (still indexes the file too, unchanged)
2. `processors/slides-processor.mjs` (NEW) — owns the translate→render→deploy chain, per-deck in-flight guard, ledger writes
3. `slide_pipeline_runs` table + `latest_slide_runs` view (NEW) — pipeline run ledger, single source of truth read by REST/MCP/CLI alike
4. `scripts/publish-slides.mjs` (NEW) — thin CLI wrapper, mirrors `scripts/fix-markdown.mjs` convention, works standalone without the daemon running
5. AgentHub REST integration (`fetch()` to port 3004) — non-fatal, best-effort ecosystem notification on successful deploy

### Critical Pitfalls

1. **Watcher feedback loop from the pipeline's own generated output** — `.fr.md`, `.html`, `.pdf`, `.pptx` writes match existing broad watch globs; without exclusion, the watcher re-indexes (and, once translate/render exist, could re-trigger) on its own artifacts. See reconciliation below for the agreed primary defense.
2. **DeepL mangles Marp front-matter, directives, code fences, and proper nouns** — DeepL has no Markdown/Marp awareness; `tag_handling` only covers `xml`/`html`. Mitigation: placeholder-protect front-matter/directives/code before translation, restore verbatim after, validate by diffing EN vs. FR directive-comment counts (hard-fail on mismatch), and pin proper nouns via a DeepL glossary.
3. **DeepL breaks GFM tables under this repo's own DVW001/DVW002 lint rules** — table rows/separators are not row-aware to DeepL's sentence-reflow behavior; a blank line inserted mid-table silently breaks GFM parsing. Mitigation: placeholder-protect entire table blocks, translate cell text only, then run `markdownlint-cli2` against every generated `.fr.md` as a pipeline gate (fail the run on violation, don't auto-fix-and-continue).
4. **marp-cli headless Chrome / `soffice` flakiness specifically under PM2** — auto-discovery that works in an interactive shell can silently resolve differently (or not at all) under PM2's environment. Mitigation: pin `--browser-path` (via `puppeteer.executablePath()`) and `SOFFICE_PATH` explicitly in the daemon's env, verify with `pm2 env <id>`, and test render success via `pm2 restart`, not just CLI invocation.
5. **FTP deploy publishes half-rendered output, or targets the wrong protocol entirely** — `basic-ftp` speaks FTP/FTPS only, not SFTP; passive-mode data channels can be silently blocked by firewalls even after a successful login. Mitigation: confirm the actual protocol with the hosting provider before locking in `basic-ftp`, stage-then-atomic-rename every deploy (never write directly to the live path file-by-file), and keep dry-run as the default until both the protocol and the rename path are verified end-to-end.

## Reconciled Recommendation: Loop Protection & Overlap Prevention

ARCHITECTURE.md and PITFALLS.md propose different primary mechanisms for the same problem — the pipeline's own writes re-entering the watcher — and this must be resolved explicitly before implementation:

- **ARCHITECTURE.md's proposal:** reuse `daemon/registry-lock.mjs`'s existing `writingNow` Set (add path before write, delete after ~2.5s hold) as loop-protection layer 2, on top of a filename-convention check as layer 1 and content-hash idempotency as layer 3.
- **PITFALLS.md's objection:** `writingNow`'s current usage pattern is a `setTimeout(() => writingNow.delete(path), 3000)` sized for `relink-processor.mjs`'s small, fast, single-file registry rewrites. DeepL translation calls plus headless-Chrome multi-format renders (EN+FR × HTML/PDF/PPTX) routinely exceed that 3000ms window, combined with chokidar's own `awaitWriteFinish` (2000ms) and 5s debounce — there is no guarantee the lock is still held when the corresponding fs event actually fires, reopening exactly the loop it's meant to prevent. PITFALLS.md's recommendation is instead to keep generated globs (`**/*.fr.md`, `docs/slides/**/*.{html,pdf,pptx}`) out of the watch set entirely via `IGNORE_PATTERNS`, and to give the pipeline its own dedicated per-deck run-lock (independent of the shared debounce/lock machinery) to prevent overlapping runs — not to lean on the 3s registry lock for either purpose.

**Reconciled recommendation, adopted for the roadmap:**

1. **Primary, unconditional gate — glob exclusion:** add every generated pattern (`**/*.fr.md`, `docs/slides/**/*.html`, `docs/slides/**/*.pdf`, `docs/slides/**/*.pptx`, any FTP staging temp path) to `watcher.mjs`'s `IGNORE_PATTERNS`, so generated artifacts never enter chokidar's watch set at all. This removes the timing race entirely rather than managing it, and is checked before any lock or hash logic runs (ARCHITECTURE.md's `isSlidesEnSource()` filename-convention check — "does this path end in `.fr.md`?" — is folded into this same gate rather than treated as a separate layer).
2. **Overlap prevention — a dedicated pipeline run-lock, not the shared registry lock:** a per-deck in-flight guard (`Map<deckPath, Promise>` or equivalent) scoped to `processors/slides-processor.mjs` itself, sized for multi-second/multi-stage work and completely independent of `daemon/registry-lock.mjs`'s `writingNow` Set. A second trigger for a deck already mid-pipeline coalesces (queues one rerun) rather than firing a concurrent run — this directly addresses PITFALLS.md's Pitfall 10 (overlapping runs corrupting deploy ordering via last-writer-wins-by-accident), which glob exclusion alone does not solve.
3. **Defense-in-depth — content-hash idempotency:** `slide_pipeline_runs.source_hash` (SHA-256 of the EN source at trigger time) compared against the last successful run's hash before executing, and re-checked immediately before the final FTP publish/rename step so a newer in-flight run always wins over a slower, stale one. This catches the residual cases glob exclusion and the run-lock don't — daemon restarts mid-render, clock skew, or a manually-triggered re-run racing a watcher-triggered one.

`writingNow` remains exactly as-is for its existing, proven use case (`relink-processor.mjs`'s fast registry rewrites) — it is **not** extended to cover slide-pipeline writes, and the roadmap should treat "reuse `writingNow` for multi-second pipeline writes" as an explicitly rejected approach, not an open option, when phase plans are written.

## Implications for Roadmap

Based on combined research, the dependency-ordered build sequence from ARCHITECTURE.md's "Suggested Build Order" is sound and should anchor phase structure. Suggested phases:

### Phase 1: Foundation

**Rationale:** Every downstream stage needs config, a ledger to record into, and correct git/gitignore hygiene before any pipeline code runs. Also the cheapest phase to get fully right before anything depends on it.
**Delivers:** `slide_pipeline_runs` migration; `config/env.mjs` additions (`DEEPL_API_KEY`, `SLIDES_FTP_*`, `SLIDES_SOFFICE_PATH`); `.marprc.yml`; `IGNORE_PATTERNS` additions in `watcher.mjs` for all generated globs; `.gitignore` rules + `git rm --cached` on the already-committed May-21 binaries; `.dockerignore` verification for `.env`.
**Addresses:** Watcher loop protection (table stakes), deploy manifest/state tracking (table stakes)
**Avoids:** Pitfall 8 (stale committed binaries / mis-scoped gitignore), Pitfall 9 (secrets baked into Docker image), lays the glob-exclusion groundwork for Pitfall 1

### Phase 2: Render Stage (isolated)

**Rationale:** Proves the `execFile`/marp-cli subprocess pattern against the two existing fixture decks with zero watcher/translate/deploy risk in the loop. Also resolves the open MEDIUM-confidence question (one-call-vs-three-calls for multi-format output) via a small spike before it's load-bearing elsewhere.
**Delivers:** `renderDeck()` in `processors/slides-processor.mjs`, callable via `scripts/publish-slides.mjs --render-only`; explicit `--browser-path` pinned to `puppeteer.executablePath()`; `SOFFICE_PATH` pre-flight check for `--pptx-editable`.
**Uses:** `@marp-team/marp-cli`, existing `puppeteer` devDependency, `execFileAsync` pattern from `daemon/scheduler.mjs`
**Implements:** `processors/slides-processor.mjs` render function

### Phase 3: Translation Stage (isolated)

**Rationale:** Independently CLI-testable and unblocked even before `DEEPL_API_KEY` lands (graceful no-key skip is the default state today). This is the single highest-risk piece per all four research files and must be correct before render/watcher trust its output.
**Delivers:** `translateDeck()` with placeholder-protection for front-matter/directives/code-fences/tables, DeepL glossary wiring, directive-count round-trip validation, and a `markdownlint-cli2` gate on generated `.fr.md` (fail the run on DVW001/DVW002 violation).
**Addresses:** Front-matter/directive preservation, code-fence preservation, proper-noun protection, table preservation (all table stakes)
**Avoids:** Pitfall 2 (DeepL mangles directives/code/proper nouns), Pitfall 3 (DeepL breaks GFM tables), Pitfall 7 (endpoint/quota mismatch — use `deepl-node`'s auto-detection, pre-check quota before batch runs)

### Phase 4: Ledger Wiring

**Rationale:** Needed before watcher integration so a bad trigger is debuggable via the DB, not just console logs — matches ARCHITECTURE.md's explicit sequencing rationale.
**Delivers:** `recordRun()` wrapping stages 2+3, `latest_slide_runs` view live and queried.
**Implements:** Data layer described in ARCHITECTURE.md's Data Model section

### Phase 5: Watcher Integration & Loop Protection

**Rationale:** This is where the reconciled loop-protection strategy (glob exclusion + dedicated run-lock + content-hash) is proven end-to-end — deliberately sequenced after render/translate are independently trusted, so a loop bug can't masquerade as a translation or render bug.
**Delivers:** `isSlidesEnSource()`/glob-exclusion wiring in `daemon/watcher.mjs`, per-deck in-flight `Map` in `slides-processor.mjs` (dedicated run-lock, not `writingNow`), content-hash gate against `latest_slide_runs`.
**Addresses:** Daemon-orchestrated trigger (differentiator), incremental rebuild (table stakes)
**Avoids:** Pitfall 1 (watcher feedback loop) and Pitfall 10 (overlapping pipeline runs) — verified per the reconciled recommendation above, tested by editing a fixture deck and confirming exactly one run fires, the `.fr.md` write does not re-trigger, and a rapid second edit coalesces rather than double-running

### Phase 6: Deploy Stage

**Rationale:** Independent of translate/render internals but naturally consumes their output paths — build once there's something real to deploy. Protocol confirmation (FTP/FTPS/SFTP) is a hard external dependency that should be resolved in parallel, not discovered mid-phase.
**Delivers:** `deployDeck()` via `basic-ftp`, dry-run-by-default, atomic stage-then-rename upload pattern.
**Addresses:** Deploy dry-run mode, deploy manifest/state tracking (table stakes)
**Avoids:** Pitfall 6 (half-rendered/protocol-mismatched deploy) — confirm protocol with the hosting provider in writing before flipping dry-run off

### Phase 7: Ecosystem Surface & Notification

**Rationale:** Trivial once the core loop (2-6) exists; low risk, correctly built last so it never blocks the deploy-critical path.
**Delivers:** `notifyAgentHub()` REST call (non-fatal), `POST /slides/publish` + `GET /slides/runs` on `server.mjs`, `get_slide_runs`/`publish_slides` MCP tools, Figma Slides runbook (documented, agent-invoked, explicitly decoupled from the automated daemon loop — blocked on Figma MCP auth).
**Addresses:** AgentHub discovery notification, Figma Slides push (differentiators — the latter deferred to v1.x per FEATURES.md pending the auth unblock)

### Phase Ordering Rationale

- Render-before-translate (Phase 2 before 3) inverts the pipeline's logical execution order deliberately: you cannot design the translation placeholder-protection scheme without first enumerating exactly which Marp directive/front-matter syntax exists in the corpus, which the render stage's own tooling surfaces naturally while being built.
- Watcher integration is deliberately the fifth phase, not the first or second: both ARCHITECTURE.md and PITFALLS.md agree loop-protection is only trustworthy once render and translate are independently proven — wiring the watcher early would make loop bugs indistinguishable from translation/render bugs during debugging.
- Deploy is sequenced after the ledger and watcher phases specifically so dry-run output is inspectable via the DB (`slide_pipeline_runs`) from day one, not just console noise, per FEATURES.md's MVP definition.
- Figma Slides and full AgentHub automation are last because both are structurally decoupled from the daemon's automated loop (MCP tools require an LLM agent host, which the headless daemon process is not) — they cannot be "built early" even if desired; they're runbook/agent-invoked steps by architecture, not sequencing preference.

### Research Flags

Needs research during phase planning:

- **Phase 2 (Render Stage):** MEDIUM confidence on whether `.marprc.yml`'s per-format boolean config (`pdf: true`, `pptx: true`) actually produces multiple output files from one invocation, or whether marp-cli genuinely requires one CLI invocation per format — flagged explicitly in ARCHITECTURE.md as needing a quick spike before the render stage's invocation pattern is finalized.
- **Phase 7 (Figma Slides):** LOW confidence on the `figma-use-slides` skill's actual input contract (rendered HTML? raw markdown? structured JSON?) — FEATURES.md flags this as unconfirmed from public sources; must be resolved when Figma MCP auth unblocks, before this phase's design is finalized.
- **Phase 6 (Deploy Stage):** Deploy protocol (FTP vs. FTPS vs. SFTP) is an external unknown, not a documentation gap — must be confirmed with the hosting provider before `basic-ftp` vs. an SFTP client decision is locked in; treat as a phase blocker, not a research task.

Phases with standard, well-documented patterns (skip `/gsd:research-phase`):

- **Phase 1 (Foundation):** Migration files, `.gitignore`/`.dockerignore` hygiene, and env var centralization all follow established, already-used patterns in this repo.
- **Phase 4 (Ledger Wiring):** Directly mirrors the existing `scan_runs`/`stale_diagrams` table-and-view pattern already proven in this codebase.
- **Phase 7 (AgentHub REST portion only):** `fetch()` to a known, already-documented REST payload shape — no new pattern needed.

## Confidence Assessment

| Area | Confidence | Notes |
| ------ | ------------ | ------- |
| Stack | HIGH | All three core packages verified directly against the npm registry (version, engines, dependency tree); DeepL's Markdown-handling gap confirmed via the official SDK's own open issue tracker, not inference |
| Features | MEDIUM-HIGH | Marp/DeepL mechanics verified against official docs/GitHub; daemon-orchestration value proposition is DocuMind-specific reasoning (sound, but not externally validated); the Figma Slides `figma-use-slides` input contract is explicitly flagged LOW confidence within this otherwise MEDIUM-HIGH file |
| Architecture | HIGH | Every integration point read directly from current source (`watcher.mjs`, `scheduler.mjs`, `registry-lock.mjs`, `env.mjs`, `schema.sql`, `server.mjs`, `mcp-server.mjs`) plus the sibling `AgentHub/src/index.ts`; only the multi-format single-invocation question is MEDIUM (needs the Phase 2 spike) |
| Pitfalls | MEDIUM-HIGH | Grounded in direct codebase inspection plus official docs/GitHub issues for marp-cli, DeepL, and basic-ftp; explicitly flags where DocuMind-specific behavior is inferred rather than tested (e.g., PM2-environment PATH resolution differences) |

**Overall confidence:** HIGH

### Gaps to Address

- **Loop-protection mechanism (RESOLVED in this document):** ARCHITECTURE.md and PITFALLS.md disagreed on whether to reuse `writingNow` as a second defensive layer. Reconciled above — glob exclusion is primary, a dedicated per-deck run-lock (not `writingNow`) handles overlap, content-hash is defense-in-depth. This should be treated as decided going into roadmap/phase planning, not re-litigated.
- **Marp multi-format invocation (one call vs. three):** Needs a short spike in Phase 2 before the render stage's `execFile` pattern is finalized — build as three sequential/`Promise.all`'d calls as the safe baseline per ARCHITECTURE.md's recommendation, collapse only if the spike proves the config-driven single call works.
- **FTP vs. FTPS vs. SFTP deploy protocol:** Genuinely unconfirmed (external dependency on hosting provider, not a documentation gap) — must be resolved before Phase 6 locks in `basic-ftp` as final rather than provisional.
- **`.fr.md` tracked-vs-gitignored:** ARCHITECTURE.md flags this as an open decision point (recommends tracking, since it's diffable markdown and benefits the FTS5 index) that the roadmap/phase-planning step should explicitly confirm rather than assume.
- **Figma Slides `use_figma` input contract:** Cannot be resolved until Figma MCP auth unblocks; Phase 7's Figma-related scope should stay a documented runbook until then, not a coded integration.
- **DeepL Free-tier quota headroom at real usage volume:** No current data on actual deck-edit frequency; PITFALLS.md and STACK.md both recommend a quota pre-check before batch runs plus `deeplClient.getUsage()` monitoring rather than assuming Free tier is sufficient indefinitely.

## Sources

### Primary (HIGH confidence)

- npm registry direct (`npm view`) — `@marp-team/marp-cli@4.4.1`, `deepl-node@1.27.0`, `basic-ftp@6.0.1` — versions, engines, dependency trees
- [marp-team/marp-cli GitHub README](https://github.com/marp-team/marp-cli/blob/main/README.md) — CLI flags, config precedence, Docker/container auto-detection
- [DeepLcom/deepl-node GitHub](https://github.com/DeepLcom/deepl-node) — `DeepLClient` API, `tagHandling`, glossary API (v2 vs. v3)
- [DeepLcom/deepl-node Issue #26](https://github.com/DeepLcom/deepl-node/issues/26) — confirms no native Markdown handling exists, still open
- Direct codebase inspection: `daemon/watcher.mjs`, `daemon/scheduler.mjs`, `daemon/registry-lock.mjs`, `config/env.mjs`, `scripts/db/schema.sql`, `daemon/server.mjs`, `daemon/mcp-server.mjs`, `processors/relink-processor.mjs`, `package.json`, `pnpm-lock.yaml`, `.planning/PROJECT.md`, `.planning/STATE.md`
- `/Users/Shared/htdocs/github/DVWDesign/AgentHub/src/index.ts` (sibling repo) — confirmed `POST /api/discoveries` REST payload shape, port 3004

### Secondary (MEDIUM confidence)

- [marp-cli Issue #631](https://github.com/marp-team/marp-cli/issues/631) — `SOFFICE_PATH` workaround for non-standard LibreOffice installs
- [marp-cli Issue #671](https://github.com/marp-team/marp-cli/issues/671), [Issue #673](https://github.com/marp-team/marp-cli/issues/673), [Discussion #82](https://github.com/orgs/marp-team/discussions/82) — sandboxed-launch and `--pptx-editable` reproducibility caveats
- [DeepL API — XML/HTML tag handling docs](https://developers.deepl.com/docs/xml-and-html-handling/html), [Multilingual Glossaries reference](https://developers.deepl.com/api-reference/multilingual-glossaries), [Error handling docs](https://developers.deepl.com/docs/best-practices/error-handling)
- [izznat/deepmark](https://github.com/izznat/deepmark), [rockbenben/md-translator](https://github.com/rockbenben/md-translator), [hanabu/cmark-translate](https://github.com/hanabu/cmark-translate) — prior art confirming placeholder-swap is the standard community pattern (deepmark itself rejected as abandoned/incompatible — see STACK.md "What NOT to Use")
- [patrickjuchli/basic-ftp](https://github.com/patrickjuchli/basic-ftp) — FTP/FTPS-only scope, download-count comparison vs. `ssh2-sftp-client`
- [figma/mcp-server-guide — figma-use-slides skill](https://github.com/figma/mcp-server-guide/blob/main/skills/figma-use-slides/SKILL.md) — official repo, input contract not fully verified

### Tertiary (LOW confidence)

- Figma Slides push input contract (HTML vs. markdown vs. structured JSON) — flagged for phase-specific research once Figma MCP auth unblocks
- PM2-specific `$PATH`/environment divergence from interactive shell for Chrome/`soffice` resolution — inferred from PM2/launchd's general daemon-environment behavior, not directly tested against this repo's PM2 config

---
*Research completed: 2026-07-10*
*Ready for roadmap: yes*
