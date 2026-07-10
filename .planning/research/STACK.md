# Stack Research

**Domain:** Automated slide-deck publishing pipeline (Marp render → DeepL translate → FTP deploy) bolted onto an existing Node 20 ESM documentation daemon
**Researched:** 2026-07-10
**Confidence:** HIGH (all three core packages verified directly against the npm registry; behavioral details verified against official READMEs/GitHub issues; DeepL markdown-handling gap confirmed by community consensus + official issue tracker)

This document covers ONLY the v3.4 additions. Everything already validated (SQLite FTS5, chokidar, node-cron, Express 5, MCP server, markdownlint toolchain, mammoth/turndown/pdf-parse) is out of scope — see `.planning/PROJECT.md` "Validated" section. This file supersedes the prior (2026-04-07) Kuzu/LangChain stack research, which is obsolete now that Kuzu has been retired per ADR-001.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
| ------------ | --------- | --------- | ----------------- |
| `@marp-team/marp-cli` | `^4.4.1` (latest, published May 2026; requires Node >=18) | Renders Marp Markdown decks to HTML/PDF/PPTX/PNG | Official Marp CLI, the only actively maintained renderer for the format. It shells out to a real browser via `puppeteer-core` (not a bundled one) for PDF/PPTX/image conversion — matches the project's existing "CLI as devDependency, invoked via npm script" pattern already used for `markdownlint-cli2` and `@mermaid-js/mermaid-cli`. |
| `deepl-node` | `^1.27.0` (latest, published ~2 months ago; Node 12-24 officially supported) | EN→FR translation of deck Markdown via the DeepL API | Official DeepL Node SDK, actively maintained (44 releases). Ships `tagHandling: 'xml'` with `ignoreTags`/`nonSplittingTags`/`preserveFormatting`, and the new v3 multilingual glossary API — the building blocks needed to protect Marp syntax and proper nouns during translation (see Patterns below). |
| `basic-ftp` | `^6.0.1` (latest, published May 2026; Node >=10) | FTP/FTPS deploy of rendered decks to the hosting target | Promise-based, ESM-friendly (`import { Client } from 'basic-ftp'`), zero runtime dependencies, supports FTPS-over-TLS. Already present as a `pnpm.overrides` entry in this repo's `package.json` (transitively pulled in already), so promoting it to a direct runtime dependency adds nothing new to the tree. At 25.5M weekly downloads vs `ssh2-sftp-client`'s 1.9M it is by far the dominant Node FTP client — use it unless the deploy target turns out to require SFTP only (see Alternatives). |

### Supporting Libraries

No new supporting libraries are required. Reuse what's already installed:

| Library (already installed) | Purpose in the new pipeline | When to Use |
| --- | --- | --- |
| `gray-matter` | Strip/restore Marp YAML front-matter (`marp: true`, `theme:`, `paginate:`) before/after sending deck body to DeepL | Every translation pass — front-matter must never be sent to the translator |
| `markdown-it` | Tokenize the deck to locate fenced code blocks and HTML-comment directives (`<!-- _class: lead -->`, `<!-- paginate: skip -->`) that must be masked before translation | Building the translation pre/post-processor |
| `chokidar` | Watch the EN `.md` deck source for changes to trigger translate→render→deploy | Daemon orchestration stage (already the watcher tech) |
| `node-cron` | Optional scheduled re-render/re-deploy fallback if watcher-driven triggers are debounced/missed | Scheduler wiring, same pattern as existing hourly/daily jobs |
| `puppeteer` (devDependency, already installed) | Supplies a bundled, pre-downloaded Chromium for `marp-cli`'s `--browser-path` | Resolve via `puppeteer.executablePath()` at render time — see Dev Tools below |

**Do not add** a markdown-AST translation library (see What NOT to Use) — the masking approach only needs regex/tokenizing, which `markdown-it` already provides.

### Development Tools

| Tool | Purpose | Notes |
| ------ | --------- | ------- |
| LibreOffice (system install, NOT an npm package) | Required by `marp --pptx --pptx-editable` to convert the pre-rendered PPTX into an editable one | On macOS, default install path is `/Applications/LibreOffice.app/Contents/MacOS/soffice`. marp-cli does not search `PATH` reliably for non-standard installs (confirmed via [marp-cli#631](https://github.com/marp-team/marp-cli/issues/631)) — set `SOFFICE_PATH=/Applications/LibreOffice.app/Contents/MacOS/soffice` in `.env` rather than relying on auto-detection. Confirm the app is actually present (`ls /Applications/LibreOffice.app`) before wiring this in — PROJECT.md notes soffice is "not on PATH" but doesn't confirm the app itself is installed. |
| A Chromium-flavored browser or Firefox (for `marp-cli` PDF/PPTX/PNG export) | `marp-cli` uses `puppeteer-core`, which does **not** bundle its own Chromium — it needs one already present on the machine, found via `--browser` (`chrome,edge,firefox`, default `auto`) or explicit `--browser-path` | **Reuse, don't reinstall**: `puppeteer@24.40.0` is already a devDependency (transitively pulled in by `@mermaid-js/mermaid-cli`, and `pnpm.onlyBuiltDependencies: ["puppeteer"]` already forces its Chromium download at install). Resolve the path at runtime with `puppeteer.executablePath()` and pass it via `--browser-path` / the `browserPath` key in `marp.config.mjs`. This avoids a second ~200MB Chromium download and avoids depending on a system-level Chrome install — important for Docker portability, since this repo already ships a Dockerfile (v3.2). |
| `.marprc.yml` or `marp.config.mjs` | Central Marp CLI config: `browser`, `browserPath`, `pptx`, `pptxEditable`, `themeSet`, `allowLocalFiles`, output dirs | Config is loaded via `cosmiconfig` (a direct `marp-cli` dependency) — supports `.marprc` (JSON/YAML), `marp.config.{js,mjs,cjs}`, and a `"marp"` key in `package.json`. **Precedence: CLI flags > Markdown front-matter directives > config file.** Prefer `marp.config.mjs` over `.marprc.yml` if the browser/soffice paths need to be computed dynamically at load time (e.g., calling `puppeteer.executablePath()`), since `.marprc.yml` is static data only. |

## Installation

```bash
# Core — DeepL translation + FTP deploy are runtime dependencies (imported by daemon code)
pnpm add deepl-node basic-ftp

# Dev dependency — Marp CLI is invoked as a shelled-out binary via npm scripts, same pattern
# as markdownlint-cli2 and @mermaid-js/mermaid-cli (never imported as a library)
pnpm add -D @marp-team/marp-cli

# System prerequisite (NOT npm) — only needed for --pptx-editable, install manually
brew install --cask libreoffice
```

No change needed to the `puppeteer` devDependency — it's already present and its bundled Chromium is reusable for Marp's `--browser-path`.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
| ------------- | ------------- | ------------------------- |
| `basic-ftp` | `ssh2-sftp-client` | If the deploy target's hosting only exposes SSH/SFTP (no FTP/FTPS port open) — common for modern managed hosting. Confirm with the hosting provider before creds land in `.env`; if SFTP-only, swap the deploy processor's client — the `dry-run` design pattern (list-then-diff-then-transfer) stays identical either way. |
| `@marp-team/marp-cli` | `marp-core` + custom Puppeteer script | Only if programmatic control finer than the CLI exposes is needed (e.g., custom per-slide DOM post-processing before PDF capture). Not needed here — the CLI covers HTML/PDF/PPTX/PPTX-editable via flags and the milestone scope is "render, don't customize." |
| `deepl-node` official SDK + custom masking layer | `deepmark` (community DeepL+Markdown wrapper) | Never for this project — see What NOT to Use. Reconsider only if DeepL ships first-party Markdown `tag_handling` support (tracked at [deepl-node#26](https://github.com/DeepLcom/deepl-node/issues/26), open, no ETA). |
| DeepL Free tier via `DEEPL_AUTH_KEY` ending `:fx` | DeepL Pro (`api.deepl.com`) | Once deck volume approaches the Free tier's 500,000 chars/month cap, or when EN+FR decks across ProductMarketing exceed that in aggregate. `deepl-node`'s `serverUrl` option lets you override the auto-selected endpoint once a Pro key is provisioned — no code change needed, only the key format changes. |

## What NOT to Use

| Avoid | Why | Use Instead |
| ------- | ----- | -------------- |
| `deepmark` (npm) | Last published 2022 (abandoned, ~100 downloads/month), pins `better-sqlite3@^7` which directly conflicts with this repo's `better-sqlite3@^12.6.2`, and is an MDX/blog-oriented CLI tool — not designed for embedding in a daemon pipeline or for Marp's HTML-comment directive syntax. | A small custom pre/post-processor (regex + `gray-matter` + `markdown-it`, both already dependencies) that wraps fenced code blocks, HTML-comment directives, and front-matter in placeholder tags, calls `deeplClient.translateText(text, 'en', 'fr', { tagHandling: 'xml', ignoreTags: ['ignore'] })`, then unwraps. |
| Raw `translateText()` on the full deck body with no masking | DeepL's translation endpoint has **no native Markdown awareness** — it does not understand Marp directives, code fences, or YAML front-matter, and will happily "translate" code identifiers, class names, or directive keywords, corrupting the deck. Confirmed: DeepL offers `tag_handling` only for `html`/`xml`, not markdown, and community workarounds (deepmark, cmark-translate, babeldown) all exist specifically to cover this gap. | Use the masking pattern above: strip front-matter first (`gray-matter`), protect code fences/HTML comments with `ignoreTags`, then translate the remaining prose only. |
| The deprecated `Translator` class pattern seen in older `deepl-node` blog posts/tutorials | `deepl-node`'s current main class is `DeepLClient`, which supports the v3 multilingual glossary API (`createMultilingualGlossary()`, etc.) alongside the legacy v2 monolingual glossary methods still exposed on the same client. Code written against `new deepl.Translator(authKey)` patterns from older tutorials is stale. | `import * as deepl from 'deepl-node'; const client = new deepl.DeepLClient(authKey)` |
| `PUPPETEER_EXECUTABLE_PATH` / `CHROME_PATH` env vars as a way to point marp-cli at a browser | marp-cli's README does not document reading these env vars — it only respects `--browser-path` (CLI) / `browserPath` (config file/programmatic config). Setting the env vars alone will silently do nothing for marp-cli's own browser search. | Resolve the path explicitly (e.g. `puppeteer.executablePath()`) and pass it via `--browser-path` or `browserPath` in `marp.config.mjs`. |
| Treating `--pptx-editable` as a pipeline-guaranteed artifact | marp-cli's own README flags this as EXPERIMENTAL: "lower slide reproducibility... presenter notes are not supported... may throw an error or output the incomplete result" with complex themes. | Generate regular (non-editable, image-baked) `--pptx` for the automated deploy pipeline; treat `--pptx-editable` as a manually-triggered, best-effort convenience output. |

## Stack Patterns by Variant

**If running the pipeline inside Docker (per the existing v3.2 Dockerfile/docker-compose):**

- Do not install a second full Chrome/Chromium in the image just for marp-cli — reuse `puppeteer`'s already-downloaded Chromium (same `pnpm.onlyBuiltDependencies: ["puppeteer"]` mechanism already forces this at `pnpm install`) and point `--browser-path` at `puppeteer.executablePath()`.
- Because LibreOffice is a ~600MB system package, do not bake it into the daemon's always-on container image just for an experimental flag. If `--pptx-editable` is genuinely needed in CI/containers, use the official `marpteam/marp-cli` Docker image (which bundles Chrome) as a separate one-shot job, not inside the daemon container.
- Set `DEEPL_SERVER_URL` explicitly only if testing against a DeepL mock/staging server; otherwise let auto-detection from the key's `:fx` suffix pick Free vs Pro.

**If running on the macOS host via PM2 (the primary/native mode for this repo):**

- `SOFFICE_PATH=/Applications/LibreOffice.app/Contents/MacOS/soffice` goes in `.env`.
- Reuse the same `puppeteer.executablePath()` resolution as Docker for consistency — do not special-case "use system Chrome on macOS," since that adds an untracked variable (which Chrome version is installed) that can silently change PDF rendering output between machines.

**If DeepL Free tier's 500K chars/month is exceeded:**

- Upgrade the API key to Pro (`serverUrl` auto-switches based on key format — no code change), and add a monthly usage check via `deeplClient.getUsage()` (part of the SDK) to the daemon's daily cron so exhaustion is visible before it silently blocks a deploy.

## Version Compatibility

| Package A | Compatible With | Notes |
| ----------- | ----------------- | ------- |
| `@marp-team/marp-cli@4.4.1` | Node >=18 (repo requires >=20 — satisfied) | Depends on `puppeteer-core@^24.43.1` — close to but not identical to the repo's existing `puppeteer@24.40.0`; both are within the same major (24.x) Chrome-for-Testing protocol generation, so the shared Chromium binary should be protocol-compatible. Verify with a smoke test (`marp --browser-path <path> test.md -o test.pdf`) after wiring, since minor CDP protocol drift between puppeteer-core minor versions is the most likely failure mode. |
| `deepl-node@1.27.0` | Node 12/14/16/17/18/20/22/24 officially tested | Fully compatible with repo's Node >=20 requirement. |
| `basic-ftp@6.0.1` | Node >=10 | No conflicts; ESM import works natively under `"type": "module"` (already set in `package.json`). |
| `deepl-node` glossary API | v3 (multilingual) vs v2 (monolingual, still supported) | Use v3 (`createMultilingualGlossary()`) for new EN→FR glossary entries (proper nouns, brand terms) — v2 methods remain on the client only for backward compatibility with existing v2 glossaries, not recommended for new integrations. |

## Sources

- npm registry direct (`npm view`) — `@marp-team/marp-cli@4.4.1`, `deepl-node@1.27.0`, `basic-ftp@6.0.1`, engines fields, dependency trees — HIGH confidence, authoritative
- [marp-cli GitHub README](https://github.com/marp-team/marp-cli/blob/main/README.md) — `--browser`, `--browser-path`, `--browser-protocol`, `--pptx-editable`, config file precedence (cosmiconfig) — HIGH confidence, official docs
- [marp-cli issue #631](https://github.com/marp-team/marp-cli/issues/631) — `SOFFICE_PATH` env var for non-standard LibreOffice install locations — MEDIUM confidence (community-confirmed workaround, not in main README, but directly from the official repo's issue tracker)
- [DeepLcom/deepl-node GitHub](https://github.com/DeepLcom/deepl-node) — `DeepLClient` API, `tagHandling`/`ignoreTags`/`preserveFormatting`, `serverUrl` free/pro auto-selection, v2 vs v3 glossary API, Node engine support — HIGH confidence, official SDK repo
- [DeepLcom/deepl-node issue #26 "Feature Request: Markdown Handling"](https://github.com/DeepLcom/deepl-node/issues/26) — confirms no native markdown `tag_handling` exists as of research date — HIGH confidence, official repo issue tracker
- npmjs.org download stats API (`api.npmjs.org/downloads/point/last-week`) — `basic-ftp` 25.5M/week vs `ssh2-sftp-client` 1.9M/week — HIGH confidence, authoritative usage data
- `pnpm-lock.yaml` (this repo) — confirms `puppeteer@24.40.0` already resolved as a build dependency of `@mermaid-js/mermaid-cli@11.12.0` — HIGH confidence, direct repo inspection
- WebSearch (deepmark package status, general FTP-vs-SFTP framing) — MEDIUM confidence, cross-checked against npm registry directly for the numbers that mattered (version dates, download counts)

---
*Stack research for: Marp render + DeepL translate + FTP deploy pipeline (DocuMind v3.4 Presentation Pipeline)*
*Researched: 2026-07-10*
