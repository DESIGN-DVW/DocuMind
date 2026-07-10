# Architecture Research — v3.4 Presentation Pipeline

**Domain:** Daemon-orchestrated document pipeline (translate → render → deploy) bolted onto an existing chokidar/cron/SQLite service
**Researched:** 2026-07-10
**Confidence:** HIGH (integration points read directly from current source: `daemon/watcher.mjs`, `daemon/scheduler.mjs`, `config/env.mjs`, `scripts/db/schema.sql`, `daemon/server.mjs`, `daemon/mcp-server.mjs`, `daemon/registry-lock.mjs`, plus sibling repo `AgentHub/src/index.ts`) — MEDIUM on exact marp-cli multi-format CLI invocation (see note in Pattern 2)

**Supersedes:** the previous version of this file (Kuzu dual-DB architecture for v3.3) — Kuzu was retired per ADR-001 (2026-07); that research is obsolete and has been replaced below.

## Standard Architecture

### System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ TRIGGER SOURCES                                                          │
│  Human edit (docs/slides/**/*.md)  │  RootDispatcher dispatch applied    │
│  (Claude Code agent writes the same EN .md file — no special-case path)  │
└───────────────────────────────────┬──────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ WATCHER LAYER — daemon/watcher.mjs (MODIFIED)                            │
│  chokidar → queueChange() → pendingChanges Set (5s debounce, dedup)      │
│  → processPendingChanges() .md branch:                                   │
│     if isSlidesEnSource(path)  → slidesProcessor.enqueue(path)  [NEW]    │
│     else                       → indexMarkdown()                 [as-is]│
└───────────────────────────────────┬──────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ PIPELINE LAYER — processors/slides-processor.mjs (NEW)                   │
│  per-deck in-flight Map (Marp renders take seconds; coalesce reruns)     │
│  1. translateDeck()  — DeepL → writes  <name>.fr.md                      │
│  2. renderDeck()     — marp-cli subprocess → .html/.pdf/.pptx per locale │
│  3. deployDeck()     — basic-ftp upload (dry-run unless creds present)   │
│  4. recordRun()      — writes slide_pipeline_runs row (ledger)           │
│  5. notifyAgentHub() — HTTP POST to AgentHub REST API on success         │
│  Every generated-file write wraps writingNow.add()/delete() (reused      │
│  from daemon/registry-lock.mjs) so the watcher ignores its own writes.   │
└───────────────────────────────────┬──────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ DATA LAYER — SQLite (better-sqlite3)                                     │
│  slide_pipeline_runs (NEW table)  │  documents (.fr.md indexed as-is)    │
└──────────────────────────────────────────────────────────────────────────┘

Parallel entry points (both call the same processors/slides-processor.mjs):
  scripts/publish-slides.mjs   — CLI: npm run slides:build / slides:deploy
  daemon/server.mjs            — POST /slides/publish, GET /slides/runs
  daemon/mcp-server.mjs        — get_slide_runs (read), publish_slides (write)
```

### Component Responsibilities

| Component | Responsibility | Status |
| ----------- | ---------------- | -------- |
| `daemon/watcher.mjs` | Detect EN deck changes, dedup/debounce, dispatch to pipeline vs. normal index | MODIFIED |
| `processors/slides-processor.mjs` | Own the translate→render→deploy chain, ledger writes, loop guards | NEW |
| `scripts/publish-slides.mjs` | Thin CLI wrapper (manual/CI runs), mirrors `scripts/fix-markdown.mjs` convention | NEW |
| `scripts/db/migrations/00X-slide-pipeline-runs.sql` | Ledger table schema | NEW |
| `config/env.mjs` | Centralize `DEEPL_API_KEY`, `SLIDES_FTP_*`, `SLIDES_SOFFICE_PATH` | MODIFIED |
| `daemon/registry-lock.mjs` (`writingNow` Set) | Loop-protection primitive — reused, not duplicated | REUSED |
| `daemon/scheduler.mjs` | Optional nightly drift check (stale render vs. EN hash) | MODIFIED (later phase, optional) |
| `daemon/server.mjs` | Manual trigger + ledger read endpoints | MODIFIED |
| `daemon/mcp-server.mjs` | Agent-facing read/write tools over the ledger | MODIFIED |
| `.marprc.yml` | Shared Marp render config (theme defaults, output flags) | NEW |
| `docs/slides/**` | EN `.md` (hand-edited) + generated `.fr.md`/`.html`/`.pdf`/`.pptx` (gitignored) | EXISTING (2 decks already present as E2E fixtures) |
| AgentHub (`/api/discoveries`, port 3004) | Ecosystem discovery feed | EXTERNAL — REST, not MCP (see Anti-Pattern 3) |

## Recommended Project Structure

This is an addition to an existing codebase, not a greenfield layout — shown as a diff against the current tree read in `daemon/`, `processors/`, `scripts/`, `config/`:

```text
DocuMind/
├── daemon/
│   ├── watcher.mjs                       # MODIFIED: isSlidesEnSource() predicate + dispatch
│   ├── scheduler.mjs                     # MODIFIED (later): optional drift-check cron
│   ├── server.mjs                        # MODIFIED: POST /slides/publish, GET /slides/runs
│   ├── mcp-server.mjs                    # MODIFIED: get_slide_runs, publish_slides tools
│   └── registry-lock.mjs                 # UNCHANGED — writingNow reused as-is
├── processors/
│   └── slides-processor.mjs              # NEW — translateDeck/renderDeck/deployDeck/recordRun
├── scripts/
│   ├── publish-slides.mjs                # NEW — CLI entry, flags: --translate/--render/--deploy/--dry-run
│   └── db/migrations/
│       └── 006-slide-pipeline-runs.sql   # NEW — ledger table
├── config/
│   └── env.mjs                           # MODIFIED — DEEPL_API_KEY, SLIDES_FTP_*, SLIDES_SOFFICE_PATH
├── .marprc.yml                           # NEW — shared marp-cli config (theme, allowLocalFiles)
├── docs/slides/
│   ├── internal/2026-05-21-figma-ai-internal-deck.md       # EN source (hand-edited, tracked)
│   ├── internal/2026-05-21-figma-ai-internal-deck.fr.md    # generated (tracked or ignored — see decision below)
│   ├── internal/2026-05-21-figma-ai-internal-deck.{html,pdf,pptx}  # generated, GITIGNORED
│   └── external/... (same pattern)
├── .gitignore                            # MODIFIED — add docs/slides/**/*.{html,pdf,pptx}
└── package.json                          # MODIFIED — marp-cli (dev), deepl-node, basic-ftp deps + slides:* scripts
```

### Structure Rationale

- **`processors/slides-processor.mjs` as one module, not three:** matches the existing `processors/relink-processor.mjs` convention — one processor per *concern* (diagram relink), exporting several composable functions (`relinkDiagram`, `propagateRelinkAllRepos`, `syncRegistryFromDb`, `reverseSyncFromRegistry`). The slides pipeline is a single concern (publish a deck) with a linear stage sequence, so `translateDeck`/`renderDeck`/`deployDeck`/`recordRun` live together and are individually unit-testable and individually callable from the CLI script (`--render` only, `--deploy` only, etc.) without duplicating orchestration logic.
- **`scripts/publish-slides.mjs` stays thin:** every existing `scripts/*.mjs` file in this repo is a CLI wrapper around a processor/orchestrator (`scripts/index-markdown.mjs` → `processors/markdown-processor.mjs`, `scripts/fix-markdown.mjs` → fix logic). Keeping the pipeline logic in `processors/` means the daemon (watcher), the CLI, the REST endpoint, and the MCP tool all call the exact same functions — no drift between "what the watcher does" and "what `npm run slides:build` does."
- **New migration file, not a schema.sql edit:** `scripts/db/schema.sql` documents itself as reflecting "migrations through 005-remove-check-constraints" — the established pattern is additive migration files under `scripts/db/migrations/`, applied via `npm run db:migrate`. Follow that, don't hand-edit `schema.sql` directly (update it afterward to stay in sync, as the header comment implies).
- **`.fr.md` tracked-vs-ignored is a real decision point:** `PROJECT.md` already commits to "EN Marp `.md` = only hand-edited artifact; FR/HTML/PDF/PPTX are generated, never edited." The render outputs are decided (gitignored). The `.fr.md` is ambiguous — recommend **tracking it in git** (it's markdown, diffable, reviewable, and DocuMind's FTS5 index benefits from having it as a real `documents` row) while still gitignoring the binary/HTML renders. Flag this as a decision the roadmap phase should confirm.

## Architectural Patterns

### Pattern 1: Filename-convention + `writingNow` + content-hash triple guard (loop protection)

**What:** Three independent, cheap checks stacked so no single failure mode causes a translate/render loop.

1. **Filename convention (primary, cheapest):** the watcher's slides-dispatch branch only fires for `docs/slides/**/*.md` paths that do **not** end in `.fr.md`. This is checked before anything else — a generated French deck can never re-trigger translation, even if `writingNow` or hashing fail.
2. **`writingNow` Set (existing primitive, reused):** `daemon/registry-lock.mjs` already exports `writingNow = new Set()`, and `watcher.mjs`'s `queueChange()` already does `if (writingNow.has(filePath)) return;` before queuing. Every write the pipeline makes (`.fr.md`, `.html`, `.pdf`, `.pptx`) should `writingNow.add(path)` immediately before the write and `writingNow.delete(path)` after — held through chokidar's `awaitWriteFinish.stabilityThreshold` (2000ms) window, not just the write() call, since the fs event can arrive up to ~2s after the write completes.
3. **Content-hash idempotency (defense-in-depth, matches `documents.content_hash` pattern already in schema):** `slide_pipeline_runs` stores the SHA-256 of the EN source at trigger time. Before running, compare against the hash from the last **successful** run for that deck; skip if unchanged. This catches cases where guard #2's timing window is missed (daemon restart mid-render, clock skew, etc.) and gives the pipeline a "did the EN content actually change" answer independent of mtime/fs-event noise.

**When to use:** Any daemon feature where the watcher's own output could re-enter its own watch scope — this same pattern is worth generalizing later if more generate-and-watch features are added.

**Trade-offs:** Three checks is more code than one, but each is O(1)/cheap, and the combination is why the diagram-registry reverse-sync feature (which has the identical "our own write must not re-trigger us" problem) hasn't had loop bugs — reuse its proven primitive rather than inventing a new one.

**Example (watcher predicate):**

```javascript
// daemon/watcher.mjs — new helper, used inside the existing '.md' case
const FR_SUFFIX_RE = /\.fr\.md$/i;

function isSlidesEnSource(filePath) {
  return filePath.includes('/docs/slides/') && !FR_SUFFIX_RE.test(filePath);
}

// inside processPendingChanges(), '.md' case, before the DIAGRAM-REGISTRY check:
if (isSlidesEnSource(change.path)) {
  console.log(`[watcher] EN slide deck changed: ${change.path} — dispatching pipeline`);
  slidesProcessor.enqueuePipelineRun(db, change.path, repoMatch, CTX, { trigger: 'watcher' });
  // still index it — it's a real document too
}
await indexMarkdown(db, change.path, repoMatch, CTX);
```

### Pattern 2: Subprocess execution via `execFile`, not npm scripts, not `npm run`

**What:** `daemon/scheduler.mjs` already establishes the pattern for daemon-invoked subprocesses: `execFileAsync('npx', ['markdownlint-cli2', '--fix', '**/*.md'], { cwd, timeout })`. The slides pipeline should follow this exactly — `execFileAsync('npx', ['marp', enDeckPath, '--pdf', '--output', outPath], { cwd: ROOT, timeout: 120_000 })` — rather than shelling out to `npm run slides:build` (extra process layer, harder error propagation, npm's own stdout noise mixed into the pipeline's logs).

**When to use:** Any daemon-triggered subprocess. `npm run` scripts remain useful as the **human-facing** entry points (`slides:build`, `slides:deploy` in `package.json`), but they should be thin aliases to `node scripts/publish-slides.mjs ...`, and the daemon calls the underlying binary/script directly via `execFile`, never through `npm run`.

**Trade-offs / open question (MEDIUM confidence):** marp-cli's documented behavior is **one output format per invocation** driven by `--pdf` / `--pptx` / default-HTML flags — the README does not show a single command producing all three outputs simultaneously; the config file (`.marprc.yml`) does support setting `pdf: true`, `pptx: true`, etc. as **defaults** for CLI flags, but this needs a quick spike to confirm whether combining them in one invocation actually emits three files or just changes which single default applies. **Recommend building the render stage as three sequential (or `Promise.all`'d) `execFile` calls — one per format — as the safe, verified-correct baseline**, and only collapse to one config-driven call if a spike proves it works. Either way, `--pptx-editable` requires LibreOffice's `soffice` on `PATH` (confirmed gap in `.planning/STATE.md`) and marp-cli's PDF/PPTX/image conversion requires a Chromium-family browser — note `puppeteer` is **already a devDependency** here (for `@mermaid-js/mermaid-cli`), so a Chromium binary is likely already resolvable on this machine; point `--browser-path` at it if marp-cli's own browser auto-detection fails, rather than installing a second Chromium.

### Pattern 3: Daemon-to-daemon integration is REST, not MCP

**What:** MCP tools (`mcp__agenthub__publish_discovery`) are invoked by an **LLM agent host** (Claude Code) that decides to call a tool mid-conversation. `daemon/watcher.mjs` runs as a plain Node process under PM2 with no LLM in the loop — it cannot "call an MCP tool." AgentHub is *also* a PM2-managed Express daemon (port 3004, confirmed in global CLAUDE.md service registry) with a plain REST surface: `POST /api/discoveries` accepting `{ repo_source, title, content, discovery_type, topics }` (read directly from `AgentHub/src/index.ts`). The DocuMind daemon should call that HTTP endpoint directly with `fetch()`, exactly the same way it would call any other internal service — not attempt to invoke an MCP tool from a headless process.

**When to use:** Any daemon-initiated cross-repo notification. If a *Claude Code agent session* (not the daemon) is the one publishing (e.g., a `/gsd` command or CRON-triggered agent per the existing `docs/proposals/2026-05-21-figma-ai-presentation-preplan.md` meeting-spec pattern), MCP is correct there instead — the distinction is "who/what is making the call," not "which feature."

**Trade-offs:** One more env var to manage (`AGENTHUB_URL`, default `http://localhost:3004`), and a soft dependency on AgentHub being up — treat as non-fatal (`try/catch`, log-and-continue) so a down AgentHub never fails a slide deploy.

**Example:**

```javascript
// processors/slides-processor.mjs
async function notifyAgentHub(deckPath, deployTargets) {
  try {
    await fetch(`${AGENTHUB_URL}/api/discoveries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repo_source: 'DocuMind',
        title: `Slides published: ${path.basename(deckPath)}`,
        content: `Deployed to ${deployTargets.join(', ')}`,
        discovery_type: 'pattern',
        topics: ['slides', 'presentation-pipeline'],
      }),
    });
  } catch (err) {
    console.error('[slides-processor] AgentHub notify failed (non-fatal):', err.message);
  }
}
```

## Data Flow

### Pipeline Run Flow

```text
[EN deck saved]  (human, or agent applying a RootDispatcher dispatch)
    ↓
[chokidar 'change' event] → queueChange() → writingNow check → pendingChanges.add()
    ↓ (5s debounce, per-file dedup via existing Set<JSON string>)
[processPendingChanges()] → isSlidesEnSource(path)?
    ↓ yes                                    ↓ no
[slidesProcessor.enqueue(path)]      [indexMarkdown() only, as today]
    ↓
[per-deck in-flight guard] — already running for this path?
    ↓ no                                    ↓ yes
[run pipeline now]                  [mark pendingRerun=true, return —
    ↓                                 re-invoke once when current run finishes]
[recordRun: INSERT slide_pipeline_runs, status='running', source_hash=sha256(EN)]
    ↓
[compare source_hash to last SUCCESSFUL run's hash] — unchanged? → mark 'skipped', done
    ↓ changed
[translateDeck()] — DeepL, skip gracefully if DEEPL_API_KEY unset (log + continue EN-only)
    ↓ writingNow.add(fr.md) → write → hold ~2.5s → writingNow.delete(fr.md)
[renderDeck()] — marp-cli execFile per {EN, FR} × {html, pdf, pptx[-editable]}
    ↓ writingNow.add(each output) → write → hold ~2.5s → writingNow.delete(each output)
[deployDeck()] — basic-ftp; DRY RUN if SLIDES_FTP_HOST unset, else real upload
    ↓
[recordRun: UPDATE slide_pipeline_runs, status='completed'|'failed', stages JSON, duration_ms]
    ↓ (only on full success)
[notifyAgentHub()] — POST /api/discoveries (non-fatal on failure)
```

### Key Data Flows

1. **Cross-agent content flow:** ProductMarketing's edits never touch DocuMind directly — they land as a RootDispatcher dispatch in `RootDispatcher/dispatches/pending/DocuMind/`, a Claude Code agent applies it (edits the EN `.md` file on disk per the standard dispatch-application protocol already in this repo's `CLAUDE.md`), and that file write is indistinguishable from a human edit to the watcher. No DocuMind-specific RootDispatcher integration code is needed — the filesystem + existing watcher is the integration.
2. **Ledger as single source of truth for pipeline state:** `GET /slides/runs` (REST), `get_slide_runs` (MCP), and any future dashboard widget all read the same `slide_pipeline_runs` table — no separate in-memory status tracking that could drift from the DB (mirrors how `diagrams` table is already documented as "single source of truth" for the diagram registry in `global-rules.md`).
3. **FR deck is both an output and an input:** the `.fr.md` written by `translateDeck()` is a pipeline *output*, but it also gets indexed into `documents` by the normal `indexMarkdown()` call the watcher already makes on every `.md` change — so French decks become full-text searchable via the existing FTS5 index for free, without special-casing.

## Data Model — `slide_pipeline_runs` (NEW)

Reasoning for a new table instead of reusing `conversions`: `conversions.source_format` has a `CHECK` constraint limited to `docx|rtf|pdf|html|txt` (no `markdown`→`markdown` case for DeepL translation), and semantically `conversions` logs **one** file-format conversion event, while a slide-publish run is a **multi-stage orchestration** (translate + N renders + deploy) that needs stage-level status and a single row to query "is this deck's last run green." Overloading `conversions` would require weakening its constraint and losing the one-row-per-run query shape.

```sql
CREATE TABLE IF NOT EXISTS slide_pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_path TEXT NOT NULL,              -- EN source path (the ledger key)
  repository TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('watcher', 'manual', 'dispatch', 'scheduler')),
  source_hash TEXT NOT NULL,            -- SHA-256 of EN content at trigger time
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  stages TEXT,                          -- JSON: { translate: {status,ms,error?}, render: {...}, deploy: {...} }
  outputs TEXT,                         -- JSON: { fr_md, html, pdf, pptx, pptx_editable } paths
  deploy_target TEXT,                   -- FTP remote path, or 'dry-run'
  agenthub_notified BOOLEAN DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_slide_runs_deck ON slide_pipeline_runs(deck_path);
CREATE INDEX IF NOT EXISTS idx_slide_runs_status ON slide_pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_slide_runs_started ON slide_pipeline_runs(started_at DESC);

-- Mirrors the existing `stale_diagrams` view pattern for a "last known good" lookup
CREATE VIEW IF NOT EXISTS latest_slide_runs AS
SELECT sr.*
FROM slide_pipeline_runs sr
INNER JOIN (
  SELECT deck_path, MAX(started_at) AS max_started
  FROM slide_pipeline_runs
  GROUP BY deck_path
) latest ON sr.deck_path = latest.deck_path AND sr.started_at = latest.max_started;
```

## Scaling Considerations

This is a solo-user internal tool (per `PROJECT.md` constraints: "no auth needed, just Dave"), so classic user-count scaling doesn't apply. The realistic axes are **deck count**, **render frequency**, and **external API limits**:

| Concern | Today (2 decks) | Growth (10-20 decks) | Heavy use (frequent edits/day) |
| --------- | ------------------ | ------------------------ | ---------------------------------- |
| Marp render time | Seconds per format, fine synchronously | Still fine — per-deck in-flight guard prevents pile-up | Debounce (5s) + coalesce-on-rerun already absorbs rapid-save bursts |
| DeepL API | Free/low tier likely sufficient | Watch character-count quota; glossary calls are cheap, cached per deck | Consider caching: skip translation if only non-text directives changed (future optimization, not MVP) |
| FTP deploy | Dry-run only (no creds yet) | One deploy per successful pipeline run — fine | If deploys become frequent, consider only uploading files whose local hash changed vs. last successful deploy (avoid redundant transfer) |
| SQLite ledger | Negligible | Negligible — same order of magnitude as `scan_history` | `slide_pipeline_runs` grows unbounded like `scan_history` already does; no pruning exists for that table either — not a new problem to solve here |

### Scaling Priorities

1. **First real bottleneck:** DeepL glossary/character quota if many decks are edited frequently — mitigate later by hashing per-slide content and only re-translating changed sections (not needed for MVP; the whole-deck retranslate is simplest and correct).
2. **Second:** concurrent renders if two different decks are edited within the same debounce window — the per-deck in-flight Map naturally supports this (different keys, no contention), so this is already handled by the design, not a future risk.

## Anti-Patterns

### Anti-Pattern 1: Trigger the pipeline from the generic `.md` watcher branch without the `.fr.md` exclusion

**What people do:** Add "if a `.md` file changed under `docs/slides/`, run the pipeline" without excluding the pipeline's own translation output.
**Why it's wrong:** `translateDeck()` writing `deck.fr.md` is itself a `.md` change under `docs/slides/` — without the suffix exclusion this immediately loops (translate → write .fr.md → watcher sees .md change → translate the French text back into "French" → write → loop), even with `writingNow` guarding the synchronous window, because the loop would resume once `writingNow` clears.
**Do this instead:** The filename-convention check (`isSlidesEnSource`) must be the first, unconditional gate — not just a hash/lock check. See Pattern 1.

### Anti-Pattern 2: Overload the `conversions` table for pipeline audit history

**What people do:** Reuse the existing `conversions` table (already has `status`, `error`, `metadata` columns) to avoid a migration.
**Why it's wrong:** `conversions.source_format` CHECK constraint doesn't include `markdown`, and the table models "one format conversion," not "a multi-stage pipeline run" — you'd end up needing 4+ rows per pipeline run (translate, render-html, render-pdf, render-pptx, deploy) with no natural way to query "what's the current state of deck X's last publish" without a self-join, which is exactly what `slide_pipeline_runs` + `latest_slide_runs` give you directly.
**Instead:** New table (see Data Model section above) — small, additive, matches the existing `scan_history` row-per-run pattern already used for scheduler jobs.

### Anti-Pattern 3: Call MCP tools from the daemon process

**What people do:** Because `mcp__agenthub__publish_discovery` is documented as "pre-approved, call directly," it's tempting to wire the daemon to call it after a successful deploy.
**Why it's wrong:** MCP tools exist inside an agent's tool-call loop; `daemon/watcher.mjs` and `processors/*.mjs` run as plain Node code with no MCP client and no LLM host attached. There is nothing to "call" — the tool only exists in a Claude Code session's context.
**Instead:** Call AgentHub's REST endpoint directly (`POST http://localhost:3004/api/discoveries`) — see Pattern 3.

### Anti-Pattern 4: Block the watcher's debounce callback on a synchronous multi-format render

**What people do:** Run render stages in a tight `for` loop with `execFileSync`, inside the same tick as `processPendingChanges()`.
**Why it's wrong:** `processPendingChanges()` already handles multiple queued changes (markdown indexing, diagram reverse-sync) in the same batch — a slow synchronous Marp render (which can take several seconds per format, longer with `--pptx-editable`) would stall indexing of unrelated files queued in the same debounce window.
**Instead:** Use `execFileAsync` (already the established pattern via `promisify(execFile)` in `scheduler.mjs`) so the render stage yields the event loop; keep the per-deck in-flight Map so a slow render doesn't get double-triggered, but don't let it block processing of other queued file changes.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
| --------- | --------------------- | ------- |
| DeepL API | `deepl-node` client (NEW dependency), `DEEPL_API_KEY` from `config/env.mjs` | Missing key today (confirmed gap in `.planning/STATE.md`) — pipeline must degrade gracefully (skip translate stage, log, continue render EN-only) rather than fail the whole run |
| marp-cli | `execFileAsync('npx', ['marp', ...])` subprocess (NEW devDependency `@marp-team/marp-cli`) | Requires a Chromium-family browser for PDF/PPTX/image output — `puppeteer` already a devDependency here (for `@mermaid-js/mermaid-cli`), likely reusable via `--browser-path` |
| LibreOffice (`soffice`) | Shelled out to by marp-cli itself for `--pptx-editable`, not called directly by DocuMind | Confirmed not on `PATH` (`.planning/STATE.md`); resolve via `SLIDES_SOFFICE_PATH` env pointing at `/Applications/LibreOffice.app/Contents/MacOS/soffice`, or skip `--pptx-editable` gracefully if unresolvable |
| FTP host | `basic-ftp` client (already present as a `pnpm.overrides` security-patch entry in `package.json` — promote to a real `dependencies` entry) | Dry-run by default (no `SLIDES_FTP_HOST` set); real upload only when host/user/pass all present |
| AgentHub REST API (port 3004) | Plain `fetch()` `POST /api/discoveries` | NOT via MCP — see Pattern 3/Anti-Pattern 3. Non-fatal on failure. |
| Figma Slides (`use_figma` MCP) | Manual runbook / slash-command, NOT part of the daemon loop | Blocked on Figma MCP auth per `PROJECT.md`; MCP tools require an agent session, so this can never be daemon-automated the way translate/render/deploy are — design it as an agent-invoked follow-up step, not a pipeline stage |
| RootDispatcher | No code integration — dispatch application is a file write, indistinguishable from a human edit | See "Key Data Flows" #1 |

### Internal Boundaries

| Boundary | Communication | Notes |
| ---------- | --------------- | ------- |
| `watcher.mjs` ↔ `slides-processor.mjs` | Direct function call (`enqueuePipelineRun(db, path, repo, ctx, opts)`) | Same pattern as `watcher.mjs` ↔ `relink-processor.mjs` today |
| `slides-processor.mjs` ↔ SQLite | Direct `better-sqlite3` calls, same `db` handle passed down from `server.mjs` | No new DB connection — reuse the singleton |
| `scripts/publish-slides.mjs` ↔ `slides-processor.mjs` | Direct import, opens its own short-lived `db` handle (matches `scripts/index-markdown.mjs` convention for standalone CLI runs) | Needed so `npm run slides:build` works without the daemon running |
| `server.mjs` (`POST /slides/publish`) ↔ `slides-processor.mjs` | Direct call, manual-trigger REST parity with `POST /scan` | For dashboard/manual re-run use |
| `mcp-server.mjs` (`get_slide_runs`, `publish_slides`) ↔ SQLite / `slides-processor.mjs` | Same dual pattern as existing `get_diagrams`/`register_diagram` read+write tool pairs | Agent-facing surface for Claude Code sessions |
| `slides-processor.mjs` ↔ AgentHub | HTTP `fetch()`, non-fatal | See Pattern 3 |

## Suggested Build Order

Dependency-ordered — each phase's tools are needed by the phase after it:

1. **Foundation:** `slide_pipeline_runs` migration + `config/env.mjs` additions (`DEEPL_API_KEY`, `SLIDES_FTP_*`, `SLIDES_SOFFICE_PATH`) + `.marprc.yml` + `.gitignore` rules for rendered outputs + remove the stale May-21 committed binaries. Everything downstream needs config and a place to record runs.
2. **Render stage in isolation:** `renderDeck()` callable from `scripts/publish-slides.mjs --render-only` against the two existing fixture decks, no watcher/translate/deploy involved yet. Proves the `execFile`/marp-cli subprocess pattern and resolves the multi-format-invocation question flagged in Pattern 2 (spike before committing to one-call-vs-three-calls).
3. **Translate stage:** `translateDeck()` with graceful no-key skip, writes `.fr.md`. Independently testable via CLI flag; unblocked even before `DEEPL_API_KEY` lands (skip path is the default state today).
4. **Ledger wiring:** `recordRun()` around stages 2+3, `latest_slide_runs` view. Needed before watcher integration so a bad trigger is debuggable via the DB rather than only console logs.
5. **Watcher integration:** `isSlidesEnSource()` + per-deck in-flight Map + `writingNow` guards wired into `daemon/watcher.mjs`, calling the already-proven stage functions. This is where loop-protection is proven end-to-end — test by editing a fixture deck and confirming exactly one pipeline run fires, `.fr.md`'s own write does not re-trigger, and a second rapid edit coalesces rather than double-runs.
6. **Deploy stage:** `deployDeck()` via `basic-ftp`, dry-run-by-default. Independent of translate/render logic but naturally consumes their output paths — build after 2/3 so there's something real to deploy.
7. **AgentHub notification:** `notifyAgentHub()` call after a successful deploy. Trivial once 6 exists; low risk, build last of the core loop.
8. **Surface area:** `POST /slides/publish` + `GET /slides/runs` on `server.mjs`, `get_slide_runs`/`publish_slides` on `mcp-server.mjs`. Depends on 1 (ledger) and 5/6 (callable pipeline) already existing.
9. **Figma Slides runbook:** documented as an agent-invoked manual step (slash command or `docs/` runbook), explicitly decoupled from the automated loop — build whenever Figma MCP auth is resolved; not a blocker for 1-8.
10. **Optional hardening (future):** nightly drift-check cron in `scheduler.mjs` comparing EN `source_hash` to `latest_slide_runs`, flagging decks whose render/deploy is behind their source — same shape as the existing `stale_diagrams` view, deferred until the core loop has run in production for a while.

## Sources

- `.planning/PROJECT.md` (this repo) — v3.4 milestone scope, decisions table, prereq gaps
- `.planning/STATE.md` (this repo) — confirmed gaps (DEEPL_API_KEY, FTP creds, soffice PATH, Figma MCP auth), test fixture decks
- `daemon/watcher.mjs` (this repo) — chokidar config, debounce/dedup mechanism, `writingNow` usage, `.md`/.pdf/.docx/.rtf watch patterns
- `daemon/scheduler.mjs` (this repo) — `execFileAsync` subprocess pattern, cron job structure
- `daemon/registry-lock.mjs` (this repo) — `writingNow` Set, the existing loop-protection primitive
- `daemon/server.mjs` (this repo) — REST endpoint conventions (`POST /scan`, `POST /convert`, etc.)
- `daemon/mcp-server.mjs` (this repo) — 14 existing `server.registerTool()` calls, read/write tool pairing convention
- `config/env.mjs` (this repo) — centralized env var pattern, `.env` loading via `process.loadEnvFile()`
- `scripts/db/schema.sql` (this repo) — `conversions`, `documents`, `diagrams`, `scan_history` table shapes; `stale_diagrams`/`pending_relinks` view pattern reused for `latest_slide_runs`
- `processors/relink-processor.mjs` (this repo, referenced) — multi-function-per-concern processor convention
- `docs/proposals/2026-05-21-figma-ai-presentation-preplan.md` (this repo) — original Marp deck decision rationale, existing fixture decks' provenance
- `package.json` (this repo) — confirmed `basic-ftp >=5.3.0` already present as a `pnpm.overrides` security-patch entry (transitive dep somewhere), `puppeteer` already a devDependency (Chromium reuse opportunity)
- `/Users/Shared/htdocs/github/DVWDesign/AgentHub/src/index.ts` (sibling repo) — confirmed `POST /api/discoveries` REST payload shape `{ repo_source, title, content, discovery_type, topics }`, port 3004 per global CLAUDE.md service registry
- [marp-team/marp-cli README](https://github.com/marp-team/marp-cli/blob/main/README.md) — confirmed one-format-per-invocation via `--pdf`/`--pptx` flags, `--pptx-editable` requires LibreOffice Impress + a browser, config file supports per-format boolean keys (exact multi-format-in-one-call behavior needs a spike — MEDIUM confidence, flagged in Pattern 2)

---
*Architecture research for: DocuMind v3.4 Presentation Pipeline*
*Researched: 2026-07-10*
