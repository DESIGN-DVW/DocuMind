# Pitfalls Research

**Domain:** Adding a translate → render → deploy presentation pipeline (DeepL → Marp CLI → FTP → Figma Slides) to an existing chokidar/node-cron/PM2 file-watching daemon (DocuMind)
**Researched:** 2026-07-10
**Confidence:** MEDIUM-HIGH (grounded in current codebase inspection + official docs/GitHub issues for marp-cli, DeepL API, basic-ftp; LOW confidence flagged where DocuMind-specific behavior is inferred rather than tested)

## Critical Pitfalls

### Pitfall 1: Pipeline writes retrigger the watcher (feedback loop)

**What goes wrong:**
`daemon/watcher.mjs` watches `**/*.md`, `**/*.pdf`, `**/*.docx`, `**/*.rtf` under the entire repos root (`REPOS_ROOT_RESOLVED`). The new pipeline will write `*.fr.md` next to the EN source, plus `.html`/`.pdf`/`.pptx` exports into `docs/slides/**`. `.fr.md` and `.pdf` both match existing watch globs. If the pipeline doesn't suppress these writes, chokidar fires `add`/`change`, `queueChange()` runs, `indexMarkdown()` re-indexes the generated file, and — once the orchestration step exists — a change to the FR file or a rendered PDF could re-enter the translate/render pipeline, or at minimum flood the index with junk.

**Why it happens:**
The existing watcher was designed for markdown *authoring* (docs get hand-edited, indexed, done). It has no concept of "generated artifact" vs "source artifact." The one loop-guard that exists (`writingNow` Set in `daemon/registry-lock.mjs`) is narrow: `relink-processor.mjs` adds a path to `writingNow` before writing, then `setTimeout(() => writingNow.delete(filePath), 3000)` after. This works today because registry rewrites are small, fast, single-file writes. The pipeline's writes are not: DeepL calls take seconds, Marp headless-Chrome boot + multi-format render (HTML+PDF+PPTX × EN+FR) can run well past 3000ms per file, and FTP upload happens after that. A `writingNow` guard sized for a single markdown rewrite will expire mid-pipeline, and the watcher's own `awaitWriteFinish` (`stabilityThreshold: 2000ms`) plus `DEBOUNCE_MS = 5000` compounds the timing risk — there is no guarantee the lock is still held when chokidar's debounce fires.

**How to avoid:**

- Don't reuse `writingNow` timing-lock semantics for this pipeline — they're a poor fit for multi-second, multi-file jobs.
- Add explicit `ignored` globs to `IGNORE_PATTERNS` in `watcher.mjs` for every generated pattern: `**/*.fr.md`, `**/docs/slides/**/*.html`, `**/docs/slides/**/*.pdf`, `**/docs/slides/**/*.pptx`, and any FTP-staging temp dir. Generated files should never enter the watch set at all — this is more robust than a timing lock.
- Only the **hand-edited EN `.md`** source should be watched for pipeline triggering; everything downstream is derived and explicitly excluded.
- If PDF must still be indexed for search (existing `.pdf` case in `processPendingChanges` is a TODO stub today), index it via a separate, pipeline-driven call after deploy completes — not via the generic watcher path.

**Warning signs:**

- `[watcher] Indexed: .../*.fr.md` or `.../slides/**/*.pdf` appearing in daemon logs shortly after a deploy.
- CPU/render spikes in PM2 (`pm2 monit`) with no corresponding human edit.
- `scan_runs` / index growing with duplicate FR-derived entries.

**Phase to address:**
Orchestration/loop-protection phase — must land before the daemon-triggered pipeline goes live, not as a follow-up fix. Should be verified with a "touch a rendered file, assert no pipeline run" test.

---

### Pitfall 2: DeepL mangles Marp front-matter, directives, code fences, and proper nouns

**What goes wrong:**
DeepL's plain `translate_text` endpoint has no concept of Markdown. Sent a whole `.md` file, it treats YAML front-matter (`marp: true`, `theme:`, `class:`), HTML-comment local/spot directives (`<!-- _class: hero -->`, `<!-- _class: +lead -->`, `<!-- backgroundColor: white -->`), fenced code blocks, inline code, and image/link paths as ordinary prose — reordering words inside them, "translating" identifiers, or normalizing punctuation inside a comment that Marpit parses structurally. A translated `_class` value or a reworded YAML key silently breaks slide styling with no lint error (markdownlint doesn't understand Marpit's directive-in-comment convention).

**Why it happens:**
`tag_handling` only has two real modes — `xml` and `html` — and both are designed for markup languages, not Markdown. There is no built-in Markdown-aware mode, and DeepL's own docs/community guidance is explicit that markdown structure (code fences especially) is not preserved automatically. Proper nouns (product names, "DocuMind", "DVWDesign", "Marp") aren't reliably preserved either without a glossary or `translate="no"`/placeholder protection.

**How to avoid:**

- Never send the raw `.md` file to DeepL as one blob. Pre-process: extract front-matter, fenced code blocks, inline code spans, and HTML-comment directive lines into placeholders (e.g., `⟦BLOCK_0⟧`) before calling the API, restore verbatim after translation. This is the standard community pattern (see `deepmark`, `md-translator`, `cmark-translate` prior art).
- For inline directive comments (`<!-- _class: hero -->`), never send them to DeepL at all — they contain no translatable prose; strip and restore by exact position.
- Use a DeepL glossary (EN→FR) for proper nouns that *do* appear in prose (e.g., "Figma", "DocuMind", "DVWDesign") so they're pinned even in translated sentences, rather than relying on placeholder-protecting every occurrence.
- Set `tag_handling: html` with `split_sentences: nonewlines` only for the prose segments being sent (not the whole file) — this preserves internal newlines DeepL would otherwise be free to collapse.
- Validate output: after translation, run `.fr.md` through the same front-matter/YAML parser and Marpit directive regex used for the EN source and diff the directive *set* (not text) against EN — mismatched counts of `<!-- _class -->` occurrences between EN and FR is a hard-fail signal.

**Warning signs:**

- FR deck renders with wrong theme/background/layout on specific slides while EN renders fine.
- FR front-matter fails YAML parse (translated `true`/`false` or reordered keys).
- Diffing EN vs FR directive-comment count shows a mismatch.

**Phase to address:**
Translation stage phase — placeholder-protection and directive round-trip validation must be part of the initial DeepL integration, not bolted on after a bad deck ships.

---

### Pitfall 3: DeepL breaks GFM tables under DocuMind's strict table rules

**What goes wrong:**
This repo enforces (via DVW001/DVW002, per `CLAUDE.md`) that GFM tables must never have a blank line between rows and must use minimal, unpadded separators. DeepL's sentence-splitting and text-reflow behavior is not row-aware: sending a Markdown table as plain text risks the translation engine inserting a blank line, merging/splitting a row's cell text across a line break, or padding cell content — any of which either breaks GFM table parsing (blank line = table ends) or gets silently "fixed" (destructively) by the repo's own auto-fixer on the next lint pass, corrupting the FR deck.

**Why it happens:**
Marp slides that include tables (e.g., a comparison slide) are exactly the content type DeepL is least equipped to round-trip, since its "tag handling" targets XML/HTML markup, not pipe-delimited table syntax, and it has zero awareness of the project's specific zero-blank-line convention.

**How to avoid:**

- Exclude table blocks from the DeepL translation payload the same way as code fences — placeholder-protect the entire table (including separator row) and only send individual cell text as small, isolated translation calls, or translate cell-by-cell with explicit `\n`-free strings.
- After translation, re-assemble tables using the original separator/row structure (never let DeepL's output dictate table formatting), then run the existing markdownlint auto-fix pass on the FR file before it's considered final — but treat any auto-fix diff on a table block as a build failure requiring manual review, not a silent pass-through.
- Add an explicit pipeline check: run `markdownlint-cli2` against generated `.fr.md` before rendering; if DVW001/DVW002 violations are found, fail the pipeline rather than rendering a broken table into the FR deck.

**Warning signs:**

- FR PDF/PPTX renders a table as literal pipe-and-dash text instead of a formatted table.
- `markdownlint-cli2` reports DVW002 violations on `docs/slides/**/*.fr.md` post-generation.

**Phase to address:**
Translation stage phase, in the same validation step as Pitfall 2 (directive round-trip). Lint-gate before render, not after.

---

### Pitfall 4: marp-cli headless Chrome flakiness under PM2/launchd

**What goes wrong:**
`marp-cli` launches a real headless Chrome/Chromium via Puppeteer to render slides. Under a process manager (PM2) or a launchd-spawned daemon — as opposed to an interactive terminal — Chrome can fail to launch (sandbox errors, missing `DISPLAY`/GPU context, profile-lock collisions from concurrent renders) or hang, especially the first run after a macOS update changes Chrome's install path. In Docker/CI the same class of failure shows up as `--no-sandbox` requirements not being met.

**Why it happens:**
Marp CLI does auto-detect containerized environments (via `is-inside-container`) and disable sandboxing automatically inside Docker, but PM2-on-macOS/launchd is not a container — it's a background daemon context that can still lack the permissions or environment (e.g., writable temp profile dir, correct `$PATH` for Chrome discovery) that an interactive shell has. There's also no built-in retry/backoff for a flaky browser launch; a single Puppeteer launch failure fails the whole render.

**How to avoid:**

- Pin an explicit `--browser-path` (or `CHROME_PATH`/`PUPPETEER_EXECUTABLE_PATH`) in `.marprc.yml`/env rather than relying on auto-discovery, so PM2's restricted environment doesn't silently resolve to a different (or missing) Chrome than the one used in manual testing.
- Set `CHROME_NO_SANDBOX=1` explicitly for the Docker image path (belt-and-suspenders alongside auto-detection) and verify manually on macOS/PM2 that no sandbox flag is needed there (it usually isn't outside containers, but don't assume — test under `pm2 start`, not just `node daemon/server.mjs`).
- Wrap the render call with a bounded retry (e.g., 2 attempts with a short delay) specifically for browser-launch failures, distinct from content/translation errors, so a transient Chrome hiccup doesn't require a full pipeline re-run.
- Ensure the render step runs single-flight per deck (no two Marp renders launching Chrome concurrently against the same profile dir) — see Pitfall 10.

**Warning signs:**

- `Error: Failed to launch the browser process` or a hang with no output in PM2 logs, especially after a macOS Chrome auto-update.
- Renders succeed via `npm run slides:build` in an interactive shell but fail identically triggered by the daemon/PM2.

**Phase to address:**
Marp toolchain setup phase — explicit browser path + sandbox flags should be part of initial `.marprc.yml` configuration, tested specifically via `pm2 start`/`pm2 restart`, not just CLI invocation.

---

### Pitfall 5: `--pptx-editable` silently degrades when `soffice` is missing or misresolved

**What goes wrong:**
`--pptx-editable` requires both the headless browser *and* a working LibreOffice (`soffice`) install for the PPTX post-processing step. `PROJECT.md` already flags `soffice not on PATH` as a known prereq gap. If `soffice` can't be found (wrong PATH inside PM2's environment, or a Scoop/Homebrew-style non-standard install location marp-cli doesn't search), the documented failure is an explicit error ("LibreOffice soffice binary could not be found") — but the more dangerous failure mode is a **PM2-scoped `$PATH` that differs from the interactive shell's `$PATH`**: `soffice` might resolve fine when you run the render manually, then fail (or resolve to a stale/wrong binary) when the same command runs under the daemon's environment, because PM2/launchd processes don't inherit the same shell profile.

**Why it happens:**
LibreOffice's location is highly platform/install-method dependent, and marp-cli's auto-discovery doesn't cover every install path (confirmed Scoop-on-Windows gap; Homebrew-on-macOS installs to `/Applications/LibreOffice.app/Contents/MacOS/soffice`, which is also not guaranteed to be on a daemon's `$PATH`). The experimental flag itself also warns of **lower slide reproducibility** than the browser-only export path and does not support presenter notes — a silent quality regression even when it "succeeds."

**How to avoid:**

- Set `SOFFICE_PATH` (or the equivalent marp-cli env var) explicitly in the daemon's environment/`.env`, not relied-upon PATH discovery — this must be set for PM2's process environment specifically, verified via `pm2 env <id>`, not just the interactive shell.
- Add a pipeline pre-flight check: before attempting `--pptx-editable`, run `soffice --version` (or equivalent) programmatically and fail fast with a clear error if it's missing, rather than letting marp-cli's own error surface deep in a render call.
- Given the known reproducibility/presenter-notes tradeoff, treat `--pptx-editable` as opt-in per-deck (e.g., only for decks that need PowerPoint editing) rather than a default on every render, and always also produce the standard (non-editable, browser-only) PPTX as the reliable fallback artifact.

**Warning signs:**

- Editable PPTX exports open in PowerPoint with missing/garbled layout compared to the PDF/HTML output.
- Presenter notes present in the source deck are absent from the exported PPTX.
- Render succeeds locally (interactive terminal) but fails under `pm2 restart` with a soffice-not-found error.

**Phase to address:**
Marp toolchain setup phase, alongside Pitfall 4 — resolve the "prereq gap" from `PROJECT.md` explicitly (install + pin `SOFFICE_PATH`) before wiring `--pptx-editable` into any automated trigger.

---

### Pitfall 6: FTP deploy publishes half-rendered output or fails silently on protocol mismatch

**What goes wrong:**
Two distinct failure modes: (1) uploading files one-by-one directly to their live path means a viewer hitting the site mid-deploy can see a stale HTML file referencing a not-yet-uploaded PDF, or a partially-written large PPTX (interrupted connection leaves a truncated file at the live path); (2) the deploy target may be assumed to be plain FTP when it's actually FTPS (explicit TLS) or SFTP (SSH-based, entirely different port/protocol/library) — `basic-ftp` speaks FTP/FTPS only, not SFTP, so pointing it at an SFTP-only host fails outright, and FTPS specifically requires correct passive-mode data-port handling that many firewalls silently drop (login succeeds, directory listing/upload then hangs or times out).

**Why it happens:**
FTP's dual-channel design (control + data) means "connected successfully" (control channel, e.g., port 21) doesn't guarantee the data channel (passive port range) is reachable — a firewall or NAT can allow login but block the actual transfer, producing a confusing partial-success. FTPS additionally requires the firewall to inspect an encrypted stream it can't see into, which frequently breaks passive-mode negotiation. Since deploy credentials are still pending (`.env` gap per `PROJECT.md`), the exact target protocol hasn't been validated yet — assuming plain/FTPS FTP without confirming with the hosting provider is a likely default mistake.

**How to avoid:**

- Confirm with the hosting/FTP provider up front whether the target is FTP, FTPS, or actually SFTP — do not assume; `basic-ftp` (FTP/FTPS) and an SSH-based client (e.g., `ssh2-sftp-client`) are not interchangeable, and picking wrong means rewriting the deploy stage later.
- Use `basic-ftp`'s explicit TLS mode if FTPS, and set passive mode explicitly; test the *transfer* path (not just login) from the actual daemon host/network, since passive-port firewall issues only show up on data transfer, not authentication.
- Deploy atomically: upload every artifact for a given release to a temporary remote path/filename (e.g., `.part` suffix or a versioned staging directory), and only rename/move into the live path once **all** files for that deck (HTML+PDF+PPTX, EN+FR) have uploaded successfully. Never let a live directory contain a mix of old and new artifacts mid-deploy.
- Build in a dry-run mode (already planned per `PROJECT.md` Active scope) that performs every step except the final rename/publish — use it as the default until credentials are confirmed and the atomic-rename path is verified end-to-end.

**Warning signs:**

- Deploy logs show successful login but the transfer step times out or hangs (classic passive-mode/firewall symptom).
- Live site briefly serves a 404 or broken asset reference during a deploy window.
- File size on the remote host doesn't match local file size after upload (truncated transfer).

**Phase to address:**
FTP deploy stage phase — atomic staged-then-rename upload pattern and protocol confirmation must be settled before removing dry-run mode as the default.

---

### Pitfall 7: DeepL free/pro endpoint mismatch and mid-run quota exhaustion

**What goes wrong:**
DeepL Free and Pro keys use different base URLs (`api-free.deepl.com` vs `api.deepl.com`); hardcoding the wrong one for the key type fails every call outright. Separately, a Free-tier key has a hard 500,000-character monthly cap (`456 Quota Exceeded`); if the pipeline is translating multiple decks in one batch run and the quota is exhausted partway through, some slides/decks end up translated and others don't — with no automatic signal to the render stage that the `.fr.md` set is incomplete, risking a render/deploy of a half-translated FR deck.

**Why it happens:**
The SDK-level auto-detection (key suffix `:fx` → free endpoint) exists in some official clients, but only if the integration uses it correctly; a naive fetch/HTTP integration that hardcodes the endpoint won't get this for free. Quota exhaustion has no built-in "pause and resume" semantics — it's a hard error per call once the cap is hit mid-batch.

**How to avoid:**

- Use the official `deepl-node` client (not raw `fetch`) so free/pro endpoint selection and error typing (`DeepLError` subclasses) are handled correctly rather than reimplemented.
- Before a batch translation run, call DeepL's usage endpoint to check remaining character quota against the estimated character count of the batch; if insufficient, fail the pipeline run before starting rather than partway through.
- Make translation idempotent per-file: if a run is interrupted (quota or otherwise), the pipeline should be safely re-runnable and only translate files whose EN source content-hash changed since the last successful `.fr.md` generation (mirrors the existing `content_hash` incremental-scan pattern already used elsewhere in this daemon) — this bounds the blast radius of a mid-run failure to whatever wasn't yet translated, and avoids wasting quota re-translating unchanged decks.
- Treat a partial `.fr.md` set as a pipeline failure state that blocks the render stage entirely (don't render EN + stale/missing FR) rather than rendering whatever's available.

**Warning signs:**

- HTTP 403 with a wrong-endpoint message in DeepL API responses.
- `456` errors appearing partway through a multi-deck batch, with some `.fr.md` files updated and others not.

**Phase to address:**
Translation stage phase — quota pre-check and idempotent per-file translation (content-hash gated) should be designed in from the start, not added after a partial-quota incident.

---

### Pitfall 8: Stale committed rendered exports left in git, and mis-scoped `.gitignore`

**What goes wrong:**
The repo currently has `docs/slides/internal/2026-05-21-figma-ai-internal-deck.{md,html,pdf,pptx}` and `docs/slides/external/2026-05-21-figma-ai-pitch-deck.{md,html,pdf,pptx}` committed in full — including the ~5.4MB PPTX and other binaries, added in commit `3b09a685` (May 23). Once the pipeline goes live and rendered artifacts are gitignored going forward (per `PROJECT.md` Active scope: "Rendered outputs gitignored; stale committed binaries removed"), a naive `git rm` or blanket `.gitignore` addition either (a) deletes the working-tree copies too (data loss if not re-derivable, e.g., if translation/render isn't reproducible bit-for-bit or the pipeline isn't finished yet), or (b) leaves the binaries permanently in git history, still bloating every clone even after they're gitignored going forward.

**Why it happens:**
`.gitignore` only affects *future* additions — it does nothing to files already tracked. A rule added to `.gitignore` without also untracking the existing files leaves them committed and continuously diffed/re-added by accident (contributors' local `.pptx` changes will still show as tracked modifications since git already knows the file).

**How to avoid:**

- Use `git rm --cached` (not `git rm`) for each already-tracked generated file — this removes them from the index/future commits while leaving the local working-tree copy untouched, satisfying "removed without losing them locally."
- Add the generated-file globs to `.gitignore` in the same change (e.g., `docs/slides/**/*.html`, `docs/slides/**/*.pdf`, `docs/slides/**/*.pptx`, `docs/slides/**/*.fr.md`) — but keep the EN `.md` source tracked (it's explicitly the single hand-edited artifact per the `PROJECT.md` Key Decisions table).
- Note explicitly for the user: `git rm --cached` only stops future tracking — the binaries remain in git history/every existing clone unless a history rewrite (`git filter-repo`/BFG) is also run. Decide whether that's in scope for this milestone or deferred; don't silently assume history cleanup is included.
- Re-run `npm run slides:build` locally after untracking to confirm the pipeline can regenerate byte-equivalent (or at least functionally equivalent) artifacts before treating the untracked originals as disposable.

**Warning signs:**

- `git status` shows the `.pptx`/`.pdf`/`.html` files as modified after every local render, even though they're "supposed to be" ignored.
- Repo clone size doesn't shrink after adding `.gitignore` rules (confirms history still holds the blobs).

**Phase to address:**
Git hygiene phase (can run in parallel with/immediately after Marp toolchain setup, before orchestration goes live) — should be an explicit, isolated commit: untrack + gitignore, verified with `git status` clean after a fresh render.

---

### Pitfall 9: `.env` secrets baked into the Docker image

**What goes wrong:**
DocuMind already ships a Docker image (v3.2, published on GHCR). The new pipeline introduces its first real secrets in this repo — `DEEPL_API_KEY` and FTP credentials — landing in `.env`. If the Dockerfile's build context isn't scoped with a `.dockerignore` entry for `.env`, a `COPY . .` (or similar broad copy) can pull `.env` into an image layer. Even if a later layer deletes it, the secret persists permanently in that layer's history and is extractable from the published image on GHCR — which is a public-facing artifact.

**Why it happens:**
`.dockerignore` is easy to forget to update when new secret-bearing files are introduced, especially when the existing `.gitignore` already excludes `.env` (which only affects git, not the separate Docker build context) — the two ignore mechanisms are commonly and incorrectly assumed to be the same thing.

**How to avoid:**

- Confirm `.env` is listed in `.dockerignore` (separate file from `.gitignore` — verify it exists and is current) before this milestone adds any new secret-bearing env vars.
- Pass `DEEPL_API_KEY`/FTP credentials into the container at **runtime** (`docker run -e` / `docker-compose` env / PM2 env) rather than at build time; never use a Dockerfile `ARG`/`ENV` for these values, since both are visible in `docker history`.
- Add an explicit check to CI/build scripts (or a pre-publish manual step) that greps the built image's layer history for known secret patterns before pushing to GHCR — cheap insurance given the image is public.
- Document required runtime env vars in `.env.example` (already the pattern per this repo's `CLAUDE.md`) without real values, so the Docker consumer path is obvious.

**Warning signs:**

- `docker history <image> --no-trunc` shows a `COPY .env` or `ENV DEEPL_API_KEY=...` layer.
- Image size or layer count unexpectedly includes `.env`-sized content.

**Phase to address:**
Should be verified as part of whichever phase first adds real credentials to `.env` (translation stage or FTP deploy stage) — treat it as a release gate before any image containing pipeline code is pushed to GHCR, not a separate later cleanup task.

---

### Pitfall 10: Overlapping/queued pipeline runs corrupt output ordering

**What goes wrong:**
The existing watcher design uses one global `debounceTimer` and one shared `pendingChanges` Set across *all* watched files in *all* repos — a burst of unrelated markdown edits elsewhere in the ecosystem and a slide-deck edit can land in the same debounce window and get processed together, serially, in `processPendingChanges()`. There is no per-pipeline lock: if a slide source is edited twice in quick succession (each edit outside the 5s debounce window, e.g., two edits 10s apart), two independent pipeline runs (translate → render → deploy) can overlap. A slower first run (real Chrome render + FTP upload can take much longer than a doc index) can finish *after* a faster second run and overwrite the live deploy with stale content — a classic "last-writer-wins-by-accident" bug, not "last-edit-wins."

**Why it happens:**
`processPendingChanges` has no concurrency guard of its own beyond the single `debounceTimer` reference — nothing stops a new debounce cycle from starting (and calling `processPendingChanges` again) while a previous invocation's async work (particularly anything the pipeline kicks off, which will run far longer than existing indexing operations) is still in flight, since `processPendingChanges` is `async` but its caller (`setTimeout`) doesn't await or track prior runs.

**How to avoid:**

- Give the presentation pipeline its own dedicated run-lock keyed by deck path (e.g., a `Map<deckPath, Promise>` or a simple `Set` of in-flight deck paths), independent of the generic doc-indexing debounce — a new trigger for a deck already mid-pipeline should either be coalesced (cancel/supersede) or queued strictly behind the current run, never run concurrently against the same deck.
- Stamp each pipeline run with the EN source's `content_hash`/mtime at trigger time; before the final FTP publish step, re-check that the source hasn't changed to a *newer* hash than what was translated/rendered — if it has, abort the publish for this run (a newer run is already in flight or about to be) rather than deploy stale content over fresh content.
- Keep the deploy stage's atomic rename (Pitfall 6) as the last line of defense: even if two runs somehow both reach the publish step, the one that renames-in last should be the one that "wins" only if it's also the most recent source hash — add that check at the rename step specifically.

**Warning signs:**

- Live deployed deck doesn't match the latest local `.md` source despite the pipeline having "succeeded" (no errors) — check the deploy timestamp against edit timestamp.
- PM2 logs show two `[pipeline] Starting run for <deck>` lines for the same deck with overlapping timestamps.

**Phase to address:**
Orchestration/loop-protection phase — same phase as Pitfall 1, since both stem from the daemon's existing debounce design not anticipating long-running, stateful pipeline work.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
| - | - | - | - |
| Send whole `.md` file to DeepL without placeholder-protection | Fast to implement, works on prose-only slides | Silently corrupts directives/tables/code on any slide using them (Pitfalls 2, 3) | Never — even an MVP deck usually has a code sample or table |
| Skip the FTP dry-run and deploy straight to live path | One less flag to wire up | Half-rendered/partial publishes visible to external viewers (Pitfall 6) | Never for the `docs/slides/external` audience; borderline acceptable for `internal` only, with explicit user sign-off |
| Rely on marp-cli's browser/soffice auto-discovery instead of pinning explicit paths | No extra config | Works in dev shell, breaks silently under PM2 (Pitfalls 4, 5) | Never once the trigger is daemon-driven — acceptable only for a one-off manual `npm run slides:build` invocation |
| Reuse the existing `writingNow` 3000ms timeout lock for pipeline writes instead of excluding generated globs from the watcher | Reuses existing code, less to build | Timing race under real render/upload durations reopens the feedback loop (Pitfall 1) | Never — the exclude-glob approach is not meaningfully more work and removes the race entirely |
| Translate every deck on every EN edit, no content-hash gating | Simpler pipeline logic | Burns DeepL quota re-translating unchanged decks, masks real quota exhaustion (Pitfall 7) | Acceptable only while quota is unlimited/irrelevant during initial dev with a throwaway free key |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
| - | - | - |
| DeepL API | Sending raw Markdown as one translation call | Placeholder-protect front-matter/directives/code/tables; translate prose segments only; validate directive-count round-trip |
| DeepL API | Hardcoding `api.deepl.com` regardless of key type | Use official `deepl-node` client for automatic free/pro endpoint + typed error handling |
| DeepL Glossary | Assuming any language pair supports glossaries | Confirm EN→FR is in the supported pair list via the glossary-language-pairs endpoint before wiring glossary use into the pipeline |
| marp-cli | Relying on Chrome/soffice PATH auto-discovery | Pin `--browser-path`/`CHROME_PATH` and `SOFFICE_PATH` explicitly in the daemon's PM2 environment; verify with `pm2 env` |
| marp-cli `--pptx-editable` | Treating it as a drop-in replacement for standard PPTX export | Known lower reproducibility, no presenter notes — always also produce the standard PPTX as fallback |
| FTP (basic-ftp) | Assuming the target is plain FTP without confirming protocol | Confirm FTP vs FTPS vs SFTP with the host provider; `basic-ftp` does not speak SFTP at all |
| FTP deploy | Uploading directly to the live path file-by-file | Stage to a temp path/filename, atomic rename only once every artifact for the release has uploaded |
| Figma Slides (`use_figma` MCP) | Assuming push works the same as regular Figma file writes | Follow the `/figma-use` skill precondition before calling `use_figma`; currently blocked on auth per `PROJECT.md` — treat as a manual runbook step until unblocked, not an automated trigger |
| Docker (GHCR image) | `.env` excluded from `.gitignore` assumed to also exclude it from Docker build context | Separately verify `.dockerignore` includes `.env`; pass secrets at runtime, never build time |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
| - | - | - | - |
| Single global chokidar debounce timer shared by doc-indexing and pipeline triggers | Unrelated repo edits delay pipeline start; pipeline start delays unrelated doc re-indexing | Give the pipeline trigger its own debounce/queue, separate from the generic `pendingChanges` Set | As soon as a slide edit and any other ecosystem doc edit land within the same 5s window |
| Headless Chrome cold-start on every render (EN+FR x HTML/PDF/PPTX = 6 renders per deck) | Full pipeline run takes noticeably longer than a single manual `marp` invocation | Consider a single marp-cli invocation per format across both languages where the CLI supports batch input, or reuse a warm Chrome instance if marp-cli's engine option allows it | Once decks are edited frequently enough that render latency becomes a visible bottleneck (e.g., multiple decks/day) |
| Re-translating unchanged decks on every scheduled/triggered run | DeepL quota consumed disproportionately to actual content changes | Content-hash gate per deck before calling DeepL (mirrors existing incremental-scan `content_hash` pattern) | As soon as more than a couple of decks exist and are rarely all edited simultaneously |

## Security Mistakes

| Mistake | Risk | Prevention |
| - | - | - |
| `.env` copied into Docker build context / image layer | DeepL/FTP credentials permanently extractable from a public GHCR image | `.dockerignore` entry for `.env`; secrets injected at container runtime only |
| FTP credentials logged in plaintext during debug/dry-run output | Credentials leak into PM2 logs, which may be less tightly access-controlled than `.env` | Redact credential values in all log statements; dry-run mode should log actions taken, not the connection string/password used |
| FTPS used without certificate validation (common quick-fix for cert errors) | Man-in-the-middle risk on the deploy channel, defeating the point of using FTPS over plain FTP | Never disable TLS certificate verification to "fix" a connection error; diagnose the actual cert/passive-mode issue instead |
| Figma Slides push credentials/tokens handled outside the standard `use_figma` MCP auth flow | Ad-hoc token handling for a "just get it working" push script | Wait for Figma MCP auth to unblock per `PROJECT.md`; don't hand-roll a separate Figma API credential path for this one feature |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
| - | - | - |
| Pipeline fails deep in the FTP stage after translation+render already succeeded, with no partial-success signal | User has to re-run the entire pipeline (re-translating, burning DeepL quota) just to retry a network hiccup at the last step | Make each stage independently resumable/re-runnable — cache translated/rendered artifacts keyed by content-hash so a deploy retry doesn't re-translate or re-render |
| Silent `--pptx-editable` degradation when soffice is missing (produces a non-editable PPTX or errors deep in a stack trace) | User discovers the deck isn't editable only when opening it in PowerPoint days later | Explicit pre-flight check with a clear, early error message naming the missing dependency and how to fix it |
| Dry-run mode that doesn't clearly report *what would have been uploaded/overwritten* | User can't tell if credentials/paths are actually correct before flipping dry-run off | Dry-run output should list exact remote paths + file sizes that would be written, not just "OK" |

## "Looks Done But Isn't" Checklist

- [ ] **DeepL translation stage:** Often missing table/code/directive round-trip validation — verify by diffing directive-comment counts and running markdownlint (DVW001/DVW002) against every generated `.fr.md`, not just spot-checking rendered output visually.
- [ ] **Marp render (`--pptx-editable`):** Often missing a soffice pre-flight check — verify by intentionally unsetting `SOFFICE_PATH` in a test run and confirming the pipeline fails fast with a clear error, not a silent lower-quality PPTX.
- [ ] **FTP deploy:** Often missing atomic staging — verify by killing the deploy process mid-upload (in a test/dry-run environment) and confirming the live path is unaffected, not left half-written.
- [ ] **Watcher loop protection:** Often verified only by "it didn't loop in my quick manual test" — verify by watching PM2 logs for at least one full debounce+render+deploy cycle and confirming zero new watcher events fire from the pipeline's own writes.
- [ ] **Git hygiene:** Often "fixed" by just adding `.gitignore` rules — verify with `git status` after a real render that no generated file shows as untracked-but-present-in-diff, and confirm history size implications are documented (not silently assumed cleaned).
- [ ] **Docker secrets:** Often assumed safe because `.gitignore` excludes `.env` — verify independently that `.dockerignore` also excludes it, and check `docker history` on the actual built image before any GHCR push.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
| - | - | - |
| Watcher feedback loop already shipped and looping in production | MEDIUM | `pm2 stop documind`; identify the offending generated-file glob from logs; add to `IGNORE_PATTERNS`; clear any bad index rows for the generated paths; restart |
| Half-rendered deck already deployed live | LOW | Re-run the deploy stage's atomic-rename step manually once a known-good build completes; if atomic staging wasn't implemented yet, manually re-upload the full known-good artifact set |
| DeepL quota exhausted mid-batch, partial `.fr.md` set exists | LOW | Wait for monthly reset (Free) or raise Cost Control limit (Pro); re-run pipeline — content-hash gating (if implemented) ensures only the untranslated decks are retried |
| Stale binaries discovered still in git history after `git rm --cached` | MEDIUM-HIGH | Decide explicitly whether history rewrite (`git filter-repo`/BFG) is in scope; if so, coordinate a force-push window with the user since it rewrites shared history |
| Secret discovered baked into a already-published GHCR image layer | HIGH | Rotate the leaked credential immediately (DeepL key / FTP password) regardless of whether the image is deleted; delete/re-tag the image; fix `.dockerignore`; rebuild and republish |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
| - | - | - |
| Watcher feedback loop (1) | Orchestration / loop-protection phase | PM2 logs show zero watcher events triggered by pipeline's own writes across a full run |
| DeepL mangles directives/code/proper nouns (2) | Translation stage phase | Directive-comment count diff EN vs FR == 0 mismatches on a deck exercising all directive types |
| DeepL breaks GFM tables (3) | Translation stage phase | `markdownlint-cli2` (DVW001/DVW002) passes on generated `.fr.md` containing a table slide |
| marp-cli headless Chrome flakiness (4) | Marp toolchain setup phase | Render succeeds via `pm2 start`/`pm2 restart` trigger, not just interactive CLI |
| `--pptx-editable` soffice dependency (5) | Marp toolchain setup phase | Pre-flight check fails fast and clearly when `SOFFICE_PATH` is unset/wrong |
| FTP half-rendered/protocol mismatch (6) | FTP deploy stage phase | Kill mid-upload in test env; live path unaffected; protocol confirmed with host provider in writing |
| DeepL endpoint/quota mid-run (7) | Translation stage phase | Quota pre-check blocks a run estimated to exceed remaining characters; partial runs are resumable via content-hash |
| Stale committed binaries / gitignore scope (8) | Git hygiene phase | `git status` clean after fresh render; `.gitignore` covers all generated globs under `docs/slides/**` |
| `.env` baked into Docker image (9) | Whichever phase first adds real credentials | `docker history` on built image shows no `.env`/secret content |
| Overlapping pipeline runs (10) | Orchestration / loop-protection phase | Two rapid successive source edits result in exactly one final deployed state matching the latest edit, verified by timestamp/hash check at publish |

## Sources

- [marp-team/marp-cli README](https://github.com/marp-team/marp-cli/blob/main/README.md) — `--browser-path`, `--pptx-editable` behavior and warnings, Docker image support
- [marp-team/marp-cli Issue #671 — custom Puppeteer launch arguments](https://github.com/marp-team/marp-cli/issues/671) — Lambda/sandboxed-environment Chrome launch flags
- [marp-team/marp-cli Issue #631 — LibreOffice detection via Scoop](https://github.com/marp-team/marp-cli/issues/631) — soffice PATH discovery gaps, `SOFFICE_PATH` workaround
- [marp-team/marp-cli Issue #673 — Cannot Convert to editable PPTX](https://github.com/marp-team/marp-cli/issues/673)
- [marp-team Discussion #82 — Exported PPTX cannot re-edit (FAQ)](https://github.com/orgs/marp-team/discussions/82)
- [Marp CLI Docker Hub image](https://hub.docker.com/r/marpteam/marp-cli/) and [Dockerfile](https://github.com/marp-team/marp-cli/blob/main/Dockerfile) — `IS_DOCKER`/container auto-detection, `CHROME_NO_SANDBOX`
- [DeepL API — XML/HTML tag handling docs](https://developers.deepl.com/docs/xml-and-html-handling/html) — `translate="no"`, `class="notranslate"`, `split_sentences` defaults
- [DeepL API — Placeholder tags guide](https://developers.deepl.com/docs/resources/examples-and-guides/placeholder-tags)
- [DeepL API — Multilingual Glossaries reference](https://developers.deepl.com/api-reference/multilingual-glossaries) — language-pair constraints, size/content limits
- [DeepL — Error handling docs](https://developers.deepl.com/docs/best-practices/error-handling) — `456` quota exceeded, endpoint differences
- [DeepLcom/deepl-node Issue #26 — Feature Request: Markdown Handling](https://github.com/DeepLcom/deepl-node/issues/26)
- [izznat/deepmark](https://github.com/izznat/deepmark), [rockbenben/md-translator](https://github.com/rockbenben/md-translator), [hanabu/cmark-translate](https://github.com/hanabu/cmark-translate) — prior art for placeholder-protected Markdown translation via DeepL
- [patrickjuchli/basic-ftp](https://github.com/patrickjuchli/basic-ftp) — FTP/FTPS-only client, atomic-rename upload pattern
- [ExaVault — FTP vs FTPS vs SFTP](https://www.exavault.com/blog/difference-between-ftp-ftps-and-sftp) and [Active vs Passive FTP](https://www.exavault.com/blog/active-vs-passive-ftp) — protocol/firewall confusion
- [Xygeni — Dockerfile Secrets: Why Layers Keep Your Data Forever](https://xygeni.io/blog/dockerfile-secrets-why-layers-keep-your-sensitive-data-forever/)
- [Tim Nelke — Stop Baking Secrets into Your Docker Image](https://timnelke.com/blog/stop-secrets-in-docker-images)
- [node-cron (community) — overlap prevention / `execution:overlap` event](https://github.com/node-cron/node-cron)
- Direct codebase inspection: `daemon/watcher.mjs` (debounce/watch-pattern design), `daemon/registry-lock.mjs` + `processors/relink-processor.mjs` (existing `writingNow` lock pattern, 3000ms timeout), `.gitignore`, `docs/slides/**` (confirmed committed `.pptx`/`.pdf`/`.html` binaries from commit `3b09a685`, May 23 2026), `.planning/PROJECT.md` (known prereq gaps: `DEEPL_API_KEY`, FTP creds, Figma MCP auth, soffice PATH)

---
*Pitfalls research for: DocuMind v3.4 Presentation Pipeline (DeepL → Marp → FTP → Figma Slides)*
*Researched: 2026-07-10*
