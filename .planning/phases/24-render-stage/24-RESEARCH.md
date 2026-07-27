# Phase 24: Render Stage (isolated) - Research

**Researched:** 2026-07-11
**Domain:** Marp CLI subprocess rendering (HTML/PDF/PPTX) invoked via `execFile`, resolved against a locally-cached Puppeteer Chromium and an optional LibreOffice binary, verified under PM2's non-interactive process environment
**Confidence:** MEDIUM-HIGH — stack/architecture patterns are HIGH (direct repo inspection + npm registry + official README); the multi-format single-invocation question is now MEDIUM-HIGH (cross-verified via WebFetch + WebSearch, not a hands-on spike); the PM2-environment behavior is HIGH for the parts directly tested in this research session (see Pitfall 2 — a genuinely new finding, not assumed)

## Summary

Phase 24 has two genuinely new pieces of information beyond what SUMMARY.md/ARCHITECTURE.md/PITFALLS.md/STACK.md already established on 2026-07-10, both confirmed directly in this session rather than inferred: **(1)** `@marp-team/marp-cli` is *not yet installed* in this repo (`npm view` confirms `4.4.1` is current, but it is absent from `package.json` devDependencies) — installing it is this phase's first concrete task, not a formality. **(2)** The milestone's flagged MEDIUM-confidence "one-call vs. three-call" question is now resolved by independent cross-verification (official README fetch + WebSearch) to the same conclusion ARCHITECTURE.md already recommended as the safe baseline: marp-cli's documented CLI options (`--pdf`, `--pptx`, default-HTML) are one-format-per-invocation, and no source — official or community — describes a config-driven single call emitting all three files at once. **Build `renderDeck()` as three sequential (or `Promise.all`'d) `execFileAsync` calls, one per format, using the exact `execFileAsync('npx', [...], { cwd, timeout })` pattern already established in `daemon/scheduler.mjs`.** This is now MEDIUM-HIGH confidence (multiple independent sources converge, but no author has run the exact command against this repo's config file to see a definitive error/success), so the phase's first task should still be a 5-minute smoke-test invocation before the pattern is locked into `renderDeck()` — not because the answer is likely to differ, but because it's now cheap to confirm and removes the last MEDIUM-confidence flag from the milestone.

The most important *new* finding from direct investigation, not present in any 2026-07-10 research file, concerns RNDR-03's PM2-environment requirement: **`pm2 env <id>` does NOT show `SOFFICE_PATH`, `DEEPL_API_KEY`, or `FTP_HOST`** for the running `documind` process (confirmed live against `pm2 jlist`), even though Phase 23 already wired all three into `config/env.mjs`. This is not a bug — it's because `config/env.mjs` loads `.env` itself via `process.loadEnvFile()` at import time, independent of whatever PM2's `ecosystem.config.cjs` `env:` block injects, and PM2's own `pm2_env` snapshot only reflects the latter. **PITFALLS.md's and ARCHITECTURE.md's recommendation to "verify with `pm2 env <id>`" does not actually work for this codebase's env-loading pattern and must not be used as the RNDR-03 verification method.** The correct verification is functional: spawn a short-lived, non-persistent PM2 process running the actual render script and inspect its output/logs (pattern given in Code Examples below), or rely on the fact that `puppeteer.executablePath()` resolves via `HOME` (confirmed identical between the interactive shell and the running `documind` PM2 process: both `HOME=/Users/dave`), which substantially de-risks browser resolution specifically, while `SOFFICE_PATH` resolution needs its own explicit runtime check since **LibreOffice is not currently installed on this machine at all** (`/Applications/LibreOffice.app` does not exist — confirmed by direct `ls`), meaning RNDR-02's "unresolved → explicit warning, non-editable fallback" branch is the actual default state today, not a hypothetical edge case to test later.

**Primary recommendation:** Add `@marp-team/marp-cli` as a devDependency; build `renderDeck()` in `processors/slides-processor.mjs` as three `execFileAsync('npx', ['marp', ...], { cwd: ROOT, timeout })` calls (HTML, PDF, PPTX) all pinned to `--browser-path <puppeteer.executablePath()>`; gate `--pptx-editable` behind an explicit `fs.access(SOFFICE_PATH, X_OK)` pre-flight check that logs a clear warning and falls back to standard (non-editable) PPTX when it fails (which it will, today, on this machine); verify RNDR-03 by spawning a throwaway `pm2 start` process (not `pm2 env`) that actually runs the render function.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RNDR-01 | User can render any EN deck to HTML, PDF, and PPTX with a single `npm run slides:build` | Architecture Pattern 1 gives the exact `renderDeck()` three-call structure; Code Examples give the `scripts/publish-slides.mjs --render-only` CLI wrapper and the `package.json` script line that together make `npm run slides:build` a single command producing all three formats against both fixture decks. |
| RNDR-02 | Editable PPTX produced via `--pptx-editable` when `SOFFICE_PATH` resolves; explicit warning (never silent image-based fallback) when it doesn't | Pitfall 1 confirms LibreOffice is genuinely absent on this dev machine today, so the "unresolved" branch is exercised by default, not a rare edge case. Architecture Pattern 1 / Code Examples give the exact `fs.access(SOFFICE_PATH, X_OK)` pre-flight pattern plus the `console.warn` + `warnings[]` array design that satisfies "explicit warning, never silent." |
| RNDR-03 | Renders succeed under the PM2 daemon environment (browser + soffice resolution verified daemon-side, not just interactive shell) | Pitfall 2 is the key finding here — `pm2 env <id>` is not a valid verification method for this codebase (it doesn't reflect `.env`-loaded vars), and gives the corrected verification method: an ephemeral `pm2 start` test process. Also documents that `HOME` (which drives `puppeteer.executablePath()` resolution) is confirmed identical between PM2 and the interactive shell on this machine, de-risking browser resolution specifically. |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@marp-team/marp-cli` | `^4.4.1` (current on npm; Node `>=18`, repo requires `>=20` — satisfied) | Renders Marp Markdown to HTML/PDF/PPTX via a real headless browser | Official, only actively-maintained Marp renderer; **confirmed NOT YET in this repo's `package.json`** (`grep -n "marp" package.json` returns no matches) — must be added as a `devDependency` this phase, shelled out via `execFile`, never imported as a library, matching the existing `markdownlint-cli2`/`@mermaid-js/mermaid-cli` pattern |
| `puppeteer` (existing devDependency) | `^24.30.0` declared, **`24.43.1` actually resolved** in `package-lock.json` (generated during Phase 23's Docker-lockfile fix) | Supplies the browser marp-cli needs for PDF/PPTX/image conversion | Confirmed via direct `node --input-type=module -e "import puppeteer from 'puppeteer'; puppeteer.executablePath()"` — resolves to `/Users/dave/.cache/puppeteer/chrome/mac_arm-148.0.7778.97/.../Google Chrome for Testing`. **Critically, the resolved `puppeteer@24.43.1` is an EXACT match for marp-cli 4.4.1's own `puppeteer-core@^24.43.1` dependency** — this eliminates the CDP-protocol-drift risk STACK.md flagged as "verify with a smoke test," since the same major.minor.patch is already in the tree. No second Chromium download needed. |

### Supporting

No new supporting libraries needed for this phase — `fs/promises`, `child_process` (`execFile`/`promisify`), and `config/env.mjs`'s existing `SOFFICE_PATH` export are sufficient.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `execFileAsync('npx', ['marp', ...])` per format | A single `marp.config.mjs` with `pdf: true, pptx: true` hoping for one multi-format call | Rejected for this phase — see Summary; the config-file-driven single-call behavior is undocumented/unconfirmed for simultaneous multi-format output, while three explicit CLI invocations are unambiguously documented and match the existing `execFileAsync` convention in this repo. Revisit only if a future spike (outside this phase) proves otherwise. |
| `fs.access(SOFFICE_PATH, X_OK)` pre-flight | `execFileAsync(SOFFICE_PATH, ['--version'])` | The `--version` spawn is a stronger correctness check (confirms the binary actually runs, not just that a file exists with the execute bit) but costs an extra subprocess spawn on every render. Recommend `fs.access` as the fast primary gate (this phase's actual state: file doesn't exist at all, so `fs.access` alone already correctly triggers the warning branch) with the `--version` spawn as an optional stronger check if the planner wants belt-and-suspenders. |

**Installation:**
```bash
npm install -D @marp-team/marp-cli
```

No other installs needed — `puppeteer` is already present and resolved to a compatible version.

## Architecture Patterns

### Recommended Project Structure

```text
processors/
└── slides-processor.mjs        # NEW — exports renderDeck() this phase (translateDeck/deployDeck land in later phases)
scripts/
└── publish-slides.mjs          # NEW — thin CLI wrapper, --render-only flag, no DB handle needed this phase
package.json                    # MODIFIED — add "slides:build": "node scripts/publish-slides.mjs --render-only"
                                 #            devDependencies: add "@marp-team/marp-cli"
```

No changes needed to `daemon/watcher.mjs`, `config/env.mjs` (already has `SOFFICE_PATH` from Phase 23), or the database — this phase is explicitly isolated from the watcher/ledger/translate/deploy stages per the roadmap.

### Pattern 1: `renderDeck()` — three sequential `execFileAsync` calls, one per format

**What:** Following `daemon/scheduler.mjs`'s existing subprocess pattern exactly (`execFileAsync('npx', [...], { cwd, timeout })`), render HTML, then PDF, then PPTX as three independent subprocess invocations against the same source `.md` file. All three pin `--browser-path` to `puppeteer.executablePath()`. The PPTX call additionally does a `SOFFICE_PATH` pre-flight check to decide whether to add `--pptx-editable`.

**When to use:** This is the only render entry point for Phase 24 — called from `scripts/publish-slides.mjs --render-only` and (in later phases) from the watcher/REST/MCP surfaces without duplication.

**Example:**
```javascript
// Source: pattern derived from daemon/scheduler.mjs's execFileAsync usage (verified: this repo, this session)
// + marp-cli README CLI options table (WebFetch, 2026-07-11) + direct puppeteer.executablePath() resolution test
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import puppeteer from 'puppeteer';
import { SOFFICE_PATH } from '../config/env.mjs';

const execFileAsync = promisify(execFile);
const RENDER_TIMEOUT_MS = 120_000; // marp-cli scheduler precedent uses 60_000 for markdownlint;
                                    // headless-Chrome render is heavier, double it as a starting point

async function sofficeResolvable(sofficePath) {
  try {
    await fs.access(sofficePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Render one EN Marp deck to HTML, PDF, and PPTX.
 * @param {string} mdPath - absolute path to the source .md file
 * @param {{cwd?: string}} opts
 * @returns {Promise<{html:string,pdf:string,pptx:string,pptxEditable:boolean,warnings:string[]}>}
 */
export async function renderDeck(mdPath, { cwd = process.cwd() } = {}) {
  const browserPath = puppeteer.executablePath();
  const base = mdPath.replace(/\.md$/, '');
  const outputs = { html: `${base}.html`, pdf: `${base}.pdf`, pptx: `${base}.pptx` };
  const warnings = [];

  await execFileAsync(
    'npx',
    ['marp', mdPath, '--browser-path', browserPath, '-o', outputs.html],
    { cwd, timeout: RENDER_TIMEOUT_MS }
  );

  await execFileAsync(
    'npx',
    ['marp', mdPath, '--pdf', '--browser-path', browserPath, '-o', outputs.pdf],
    { cwd, timeout: RENDER_TIMEOUT_MS }
  );

  const editable = await sofficeResolvable(SOFFICE_PATH);
  const pptxArgs = ['marp', mdPath, '--pptx', '--browser-path', browserPath, '-o', outputs.pptx];
  if (editable) {
    pptxArgs.push('--pptx-editable');
  } else {
    const msg = `[slides-processor] SOFFICE_PATH not resolvable (${SOFFICE_PATH}) — ` +
      `producing standard (non-editable) PPTX for ${mdPath}`;
    console.warn(msg);
    warnings.push(msg);
  }
  await execFileAsync('npx', pptxArgs, {
    cwd,
    timeout: editable ? RENDER_TIMEOUT_MS * 1.5 : RENDER_TIMEOUT_MS, // LibreOffice conversion is slower
  });

  return { ...outputs, pptxEditable: editable, warnings };
}
```

### Pattern 2: `scripts/publish-slides.mjs` — thin CLI wrapper, no DB coupling this phase

**What:** Unlike most `scripts/*.mjs` in this repo, this one does NOT need a `better-sqlite3` handle in Phase 24 — the ledger (`slide_pipeline_runs`) isn't wired until Phase 26. Keep the function signature ledger-friendly (return a structured result object, as shown in Pattern 1) so Phase 26 can wrap it with `recordRun()` without changing `renderDeck()`'s contract.

**Example:**
```javascript
#!/usr/bin/env node
// Source: pattern matches scripts/fix-markdown.mjs's "thin CLI wrapper around a processor" convention
import path from 'path';
import { renderDeck } from '../processors/slides-processor.mjs';
import { ROOT } from '../config/env.mjs';

const FIXTURE_DECKS = [
  'docs/slides/internal/2026-05-21-figma-ai-internal-deck.md',
  'docs/slides/external/2026-05-21-figma-ai-pitch-deck.md',
];

async function main() {
  const args = process.argv.slice(2);
  const explicitDeck = args.find(a => !a.startsWith('--'));
  const decks = explicitDeck ? [explicitDeck] : FIXTURE_DECKS;

  for (const rel of decks) {
    const abs = path.resolve(ROOT, rel);
    console.log(`[publish-slides] Rendering ${rel}...`);
    const result = await renderDeck(abs, { cwd: ROOT });
    console.log(`[publish-slides] Done:`, JSON.stringify(result, null, 2));
    if (result.warnings.length) {
      console.warn(`[publish-slides] ${result.warnings.length} warning(s) for ${rel}`);
    }
  }
}

main().catch(err => {
  console.error('[publish-slides] FAILED:', err.message);
  process.exitCode = 1;
});
```

`package.json` wiring:
```json
"slides:build": "node scripts/publish-slides.mjs --render-only"
```

(`--render-only` is accepted but currently a no-op flag in Phase 24, since render is the only stage that exists yet — keep the flag now so Phase 25/28's `--translate`/`--deploy` additions don't require renaming the entry point or changing how `npm run slides:build` is invoked.)

### Anti-Patterns to Avoid

- **Verifying RNDR-03 with `pm2 env <id>`:** Confirmed directly in this session that `pm2 env <id>` for the running `documind` process does NOT show `SOFFICE_PATH`, `DEEPL_API_KEY`, or `FTP_HOST` even though `config/env.mjs` already exports all three (Phase 23). `pm2_env` only reflects `ecosystem.config.cjs`'s static `env:` block, not values loaded at runtime via `process.loadEnvFile()`. Using this as the verification method for RNDR-03 will produce a false-negative ("vars are missing!") that isn't actually a bug. See Pitfall 2 for the correct method.
- **Shelling out via `npm run` instead of `execFile`/`npx` directly:** ARCHITECTURE.md's Pattern 2 already establishes this — an extra process layer, harder error propagation, npm's own stdout noise. `npm run slides:build` is the human-facing entry point only; internally it calls `node scripts/publish-slides.mjs`, which calls `renderDeck()`, which calls `execFileAsync('npx', ['marp', ...])` directly.
- **Treating `--pptx-editable` as a drop-in flag with no fallback path:** marp-cli's own README (confirmed via WebFetch, 2026-07-11) states it "may throw an error or output the incomplete result" with complex theme styles — and both fixture decks (`2026-05-21-figma-ai-internal-deck.md`, `2026-05-21-figma-ai-pitch-deck.md`) have non-trivial custom `style:` blocks in their front-matter (multiple slide classes: `title`/`chapter`/`stub` internal, `hero` external, custom fonts/colors/table styling). This is a real risk correlation, not a hypothetical — the smoke-test decks are exactly the kind of content the README warns about.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser binary resolution | A custom Chrome-finder that searches common install paths | `puppeteer.executablePath()` (already a devDependency, already resolved to an exact-version match for marp-cli's own `puppeteer-core` dependency) | Confirmed working via direct test this session; avoids a second ~200MB Chromium download and avoids environment-dependent PATH search entirely |
| Subprocess execution/timeout/error handling | A new subprocess wrapper for marp-cli specifically | `execFileAsync` (`promisify(execFile)`) exactly as `daemon/scheduler.mjs` already does for `markdownlint-cli2` | One established pattern for all daemon-triggered subprocesses in this codebase; reusing it means Phase 25/28's subprocess calls (if any) follow the same convention |
| "Is soffice available" detection | A platform-specific PATH-search helper | `fs.access(SOFFICE_PATH, fs.constants.X_OK)` against the already-centralized `config/env.mjs` export | `SOFFICE_PATH` already has a sane macOS default (`/Applications/LibreOffice.app/Contents/MacOS/soffice`) wired in Phase 23; marp-cli itself reads the `SOFFICE_PATH` env var directly (confirmed via WebSearch — a community-documented workaround for its own Scoop/non-standard-install detection gap, referenced from the official `marp-team/marp-cli` issue tracker, issue #631) — DocuMind doesn't need to pass it explicitly to the child process either, since Node's `execFile` inherits `process.env` (which already contains `SOFFICE_PATH` from `config/env.mjs`'s `process.loadEnvFile()` call) by default when no `env` override is given |

**Key insight:** Every piece of this phase already has an established pattern somewhere in this repo (scheduler subprocess calls, env.mjs centralization, thin CLI wrappers) or an established resolution mechanism upstream (puppeteer's own executablePath, marp-cli's own SOFFICE_PATH env read). The only genuinely new code is the format-loop and the pre-flight check — everything else is composition, not invention.

## Common Pitfalls

### Pitfall 1: LibreOffice is not installed on this machine — the "unresolved" branch is the default state today, not an edge case

**What goes wrong:** A plan that treats `--pptx-editable` support as "works when configured, warns otherwise" without testing the warn path risks shipping code where the warning is never actually exercised in dev, because the developer assumes `SOFFICE_PATH`'s documented default (`/Applications/LibreOffice.app/Contents/MacOS/soffice`) means LibreOffice is present.
**Why it happens:** `config/env.mjs`'s `SOFFICE_PATH` constant has a real-looking default path, which reads as "already configured" — but the actual application (`/Applications/LibreOffice.app`) does not exist on this machine (confirmed via direct `ls` in this session: `No such file or directory`).
**How to avoid:** Build and test the non-editable fallback path first — it's the only path currently exercisable end-to-end on this machine. Treat the editable-PPTX success path as untestable until a human installs LibreOffice (`brew install --cask libreoffice`, per STACK.md) — flag this explicitly in the phase's verification notes rather than silently skipping it.
**Warning signs:** A plan/verification step that claims "`--pptx-editable` produces an editable PPTX" without noting that this specific claim couldn't be exercised on the dev machine as of 2026-07-11.

### Pitfall 2: `pm2 env <id>` does not reflect `.env`-loaded environment variables — do not use it to verify RNDR-03

**What goes wrong:** PITFALLS.md and ARCHITECTURE.md (2026-07-10) both recommend "verify with `pm2 env <id>`" as the RNDR-03 check. Directly testing this in the current session (`pm2 jlist` → inspect `documind`'s `pm2_env`) shows `SOFFICE_PATH`, `DEEPL_API_KEY`, and `FTP_HOST` are **absent** from that snapshot, despite `config/env.mjs` already exporting all three since Phase 23.
**Why it happens:** `config/env.mjs` calls `process.loadEnvFile(path.join(ROOT, '.env'))` itself, at module-import time, inside the running Node process — this mutates `process.env` from *inside* the app, completely independent of whatever `ecosystem.config.cjs`'s static `env:` block injects at spawn time. `pm2 env <id>` only shows PM2's own injected snapshot, not values an app loads for itself afterward.
**How to avoid:** RNDR-03 verification must be functional, not introspective. Spawn a throwaway, non-persistent PM2 process that actually runs the render code and inspect its stdout/exit code — see Code Examples below. Do not add `SOFFICE_PATH`/`DEEPL_API_KEY`/`FTP_HOST` to `ecosystem.config.cjs`'s `env:` block to "fix" this — that would duplicate the source of truth `config/env.mjs` already owns and violates the Append-Only ecosystem-config convention's spirit (adding config duplication, not new services).
**Warning signs:** A verification step or plan task that says "confirmed via `pm2 env <id>`" for any of the six presentation-pipeline vars — this is a false-confidence signal for this specific codebase.

### Pitfall 3: marp-cli's own puppeteer-core dependency happens to exact-match this repo's resolved puppeteer version — don't assume this holds forever

**What goes wrong:** STACK.md flagged CDP-protocol drift between `puppeteer@24.30.0` (declared) and marp-cli's `puppeteer-core@^24.43.1` as a "verify with a smoke test" risk. This session confirms the *resolved* (not declared) version in `package-lock.json` is `24.43.1` — an exact match, not just same-major. This is good news today but is a moving target: the next `npm install` after `puppeteer`'s `^24.30.0` range gets a newer patch, or after marp-cli bumps its own `puppeteer-core` pin, could reintroduce drift.
**Why it happens:** Both are semver-ranged dependencies (`puppeteer@^24.30.0` in this repo, `puppeteer-core@^24.43.1` inside marp-cli) — the current exact match is coincidental to when each was last installed, not a guarantee.
**How to avoid:** Don't hardcode an assumption of permanent compatibility into the render code. The `--browser-path` smoke test recommended in Code Examples doubles as an ongoing compatibility check — if a future `npm install` reintroduces drift, the smoke test (not a silent runtime failure) should be the first thing to catch it.
**Warning signs:** `marp --browser-path <path> test.md -o test.pdf` failing with a CDP/protocol-version error after any `npm update`/`npm install` touching `puppeteer` or `@marp-team/marp-cli`.

## Code Examples

### Verifying RNDR-03 without relying on `pm2 env` (corrected method)

```bash
# Source: derived directly from this session's finding that `pm2 env <id>` doesn't reflect
# config/env.mjs's runtime-loaded vars — this spawns an actual render under PM2's process model
pm2 start node --no-autorestart --name documind-render-test \
  -- scripts/publish-slides.mjs --render-only

pm2 logs documind-render-test --lines 100 --nostream

# Confirm success/failure from the logged output (renderDeck()'s console.log/warn calls),
# not from `pm2 env` — then clean up the ephemeral test process:
pm2 delete documind-render-test
```

### One-time compatibility smoke test (run once before wiring `renderDeck()` fully)

```bash
# Source: STACK.md's recommended verification, now backed by the confirmed exact-version match
# (puppeteer 24.43.1 resolved == marp-cli's puppeteer-core ^24.43.1 requirement)
BROWSER_PATH=$(node --input-type=module -e "import p from 'puppeteer'; console.log(p.executablePath())")
npx marp docs/slides/internal/2026-05-21-figma-ai-internal-deck.md \
  --browser-path "$BROWSER_PATH" --pdf -o /tmp/render-smoke-test.pdf
```

### Confirming the multi-format spike before locking `renderDeck()`'s three-call pattern

```bash
# Source: this session's WebFetch/WebSearch cross-verification recommends this as the
# 5-minute spike to run as Phase 24's first task, per the roadmap's own success criterion 4
cat > /tmp/marp-spike.marprc.yml <<'EOF'
pdf: true
pptx: true
EOF
npx marp --config-file /tmp/marp-spike.marprc.yml \
  docs/slides/internal/2026-05-21-figma-ai-internal-deck.md -o /tmp/spike-output.html
ls -la /tmp/spike-output.* 2>&1
# Expected (per research): only spike-output.html appears — pdf:true/pptx:true in a config file
# set CLI-flag *defaults*, they don't fan out to multiple output files in one invocation.
# If this expectation is wrong, it changes renderDeck()'s design — confirm before building it.
```

## State of the Art

| Old Approach (assumed going into research) | Current Approach (this phase's finding) | When Changed | Impact |
|--------------------------------------------|------------------------------------------|---------------|--------|
| Hope one config-driven `marp` invocation with `pdf: true, pptx: true` emits all three formats | Three explicit `execFileAsync` calls, one per format, each with its own `--browser-path` | Resolved 2026-07-11 via WebFetch + WebSearch cross-verification (not yet a hands-on spike — see Code Examples "Confirming the multi-format spike") | `renderDeck()`'s control flow is a simple loop/sequence, not a single subprocess call — slightly more code, but each format's failure is independently catchable/retryable |
| `pm2 env <id>` as the RNDR-03 verification method | Ephemeral `pm2 start ... --no-autorestart` test process, inspect logs | Discovered 2026-07-11, directly contradicts 2026-07-10 milestone research (PITFALLS.md/ARCHITECTURE.md both recommended `pm2 env`) | Verification steps in the Phase 24 plan must use the functional method, not the introspective one |

## Open Questions

1. **Does the multi-format config-file spike (see Code Examples) actually confirm one-call-vs-three-calls, or could it surprise us?**
   - What we know: Official README + independent WebSearch both converge on "one format per invocation" as the documented/expected behavior; no source describes a working multi-format single call.
   - What's unclear: No one has run the exact spike command against this repo's fixture decks yet — confidence is MEDIUM-HIGH (cross-verified sources), not HIGH (a source explicitly documenting the tested behavior).
   - Recommendation: Run the spike as literally the first task of Phase 24, before writing `renderDeck()`'s body. If it surprises us (multi-format DOES work from one call), that's a nice simplification, not a blocker — the three-call fallback documented here remains correct either way.

2. **Can RNDR-02's editable-PPTX success path be verified at all in Phase 24, given LibreOffice isn't installed on this machine?**
   - What we know: The non-editable fallback + explicit-warning path is fully testable today. The editable-PPTX success path requires `brew install --cask libreoffice` (STACK.md's own installation instruction), which hasn't happened.
   - What's unclear: Whether the user wants to install LibreOffice as part of Phase 24 execution, or whether "editable PPTX actually works" verification should be deferred/flagged as a known gap for this phase's VERIFICATION.md.
   - Recommendation: Build the pre-flight-check + fallback logic fully (testable today), and flag the editable-success-path as `human_needed`/environment-blocked in verification — mirroring exactly how Phase 23 handled its own environment-blocked Docker criterion (see `.planning/phases/23-foundation-hygiene/23-VERIFICATION.md`, Truth 4 pattern). Don't block the phase on installing LibreOffice unless the user explicitly wants to.

3. **Should `renderDeck()` iterate over both fixture decks automatically, or take an explicit path argument only?**
   - What we know: RNDR-01's success criterion is "any EN deck," and there are exactly two fixture decks today (`docs/slides/internal/...`, `docs/slides/external/...`).
   - What's unclear: Whether `npm run slides:build` (no args) should default to "render every deck under `docs/slides/**`" (glob-discover) or "render the two known fixtures" (hardcoded list, per the CLI draft in Code Examples) or require an explicit path argument.
   - Recommendation: Glob-discover `docs/slides/**/*.md` excluding `*.fr.md` (the `.fr.md` exclusion doesn't matter yet in Phase 24 since translation doesn't exist, but writing the glob this way now avoids a rename in Phase 25) rather than hardcoding the fixture list — more faithfully satisfies "any EN deck," and the fixture list becomes redundant once glob-discovery exists. Flagged as planner discretion since either satisfies RNDR-01's letter for a 2-deck corpus.

## Sources

### Primary (HIGH confidence)

- Direct repo inspection (this session): `package.json` (confirmed `@marp-team/marp-cli` absent, `puppeteer@^24.30.0` present), `package-lock.json` (confirmed resolved `puppeteer@24.43.1`, `puppeteer-core@24.43.1`), `daemon/scheduler.mjs` (exact `execFileAsync` pattern, lines 8-9, 24, 179), `config/env.mjs` (confirmed `SOFFICE_PATH`/`DEEPL_API_KEY`/`FTP_*` exports and `.env` loading mechanism), `ecosystem.config.cjs` (confirmed `env:` block does NOT include presentation-pipeline vars), `docs/slides/{internal,external}/*.md` front-matter (confirmed custom style complexity relevant to `--pptx-editable` risk)
- Direct command execution (this session): `node --input-type=module -e "import puppeteer from 'puppeteer'; puppeteer.executablePath()"` → confirmed resolved Chromium path; `ls /Applications/LibreOffice.app` → confirmed absent; `pm2 jlist` parsed for `documind`'s `pm2_env` → confirmed `SOFFICE_PATH`/`DEEPL_API_KEY`/`FTP_HOST` missing from PM2's own env snapshot despite `config/env.mjs` exporting them
- `npm view @marp-team/marp-cli version/engines` → `4.4.1`, Node `>=18`
- [marp-team/marp-cli README](https://raw.githubusercontent.com/marp-team/marp-cli/main/README.md) (WebFetch, 2026-07-11) — CLI options table (`--pdf`, `--pptx`, `--pptx-editable`, `--browser-path`, `--html`, `-o`, `--allow-local-files`, `--theme-set`, `-s`/`--server`, `-w`/`--watch`, `--browser`, `--browser-protocol`), `--pptx-editable` experimental-status warning text, "Marp CLI prefers CLI option to global directives" precedence statement

### Secondary (MEDIUM confidence)

- WebSearch, "marp-cli config.js multiple format output pdf pptx html single command 2026" — cross-verifies the one-format-per-invocation conclusion from an independent angle (community docs, DeepWiki, Skywork skill hub) rather than only the official README
- WebSearch, "marp-cli SOFFICE_PATH environment variable source code" — confirms `SOFFICE_PATH` is read directly by marp-cli's own detection code (not just a PATH-prepend convention), consistent with the original STACK.md sourcing from marp-cli issue #631

### Tertiary (LOW confidence)

- None new this session — all findings above were verified against at least a primary source or direct repo/command inspection.

### Carried from 2026-07-10 milestone research (see those files for full sourcing)

- `.planning/research/SUMMARY.md`, `STACK.md`, `PITFALLS.md`, `ARCHITECTURE.md` — full stack rationale, pitfall catalog, data model, build-order reasoning (Pitfalls 4/5 on marp-cli/soffice PM2 flakiness partially superseded by this session's Pitfall 2 correction, but their underlying "pin explicit paths, don't rely on auto-discovery" recommendation stands)
- `.planning/phases/23-foundation-hygiene/23-RESEARCH.md` and `23-VERIFICATION.md` — confirms `config/env.mjs`'s six pipeline vars are already wired and tested; confirms the `human_needed`/environment-blocked verification pattern this phase should mirror for the editable-PPTX gap

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — exact resolved versions confirmed directly against this repo's own `package-lock.json` and `npm view`, not assumed
- Architecture: HIGH — `execFileAsync` pattern copied verbatim from working code (`daemon/scheduler.mjs`); CLI wrapper pattern matches existing `scripts/*.mjs` convention
- Pitfalls: HIGH for Pitfalls 1-3 (all directly observed/tested in this session, not inferred) — the multi-format invocation question remains MEDIUM-HIGH pending the actual spike (Open Question 1)

**Research date:** 2026-07-11
**Valid until:** ~14 days (fast-moving: `@marp-team/marp-cli` and `puppeteer` version drift risk per Pitfall 3; the PM2/env findings are repo-state facts, not library-version facts, and remain valid until `config/env.mjs`'s loading mechanism or `ecosystem.config.cjs` changes)
