---
title: Markdown Enhancements — Writing Style & Rules
description: Durable statement of intent for DocuMind's markdown rule surface, enforcement pipeline, locale policy, translation, and the AI writing-style tier.
version: 1.0.0
created: 2026-07-28
updated: 2026-07-28
category: standards
classification: canonical
lang: en
---

# Markdown Enhancements — Writing Style & Rules

DocuMind owns markdown quality for 620+ files across 14+ DVWDesign repositories. This brief states what "good markdown" means here, how it is enforced, and which parts a machine may change unattended.

---

## 1. Objectives

| Objective | Meaning |
| - | - |
| Natural human writing | Documents read as prose written by a person, not as generated output. Tone is selectable per document, not global. |
| Format conversion flexibility | Markdown is the source of truth. HTML, PDF, PPTX, and FigJam are derived, never hand-maintained. |
| Auto-correction and shortcuts | A shared dictionary expands abbreviations and normalises vocabulary across EN and FR. |
| Bilingual by intent | EN↔FR translation is available on any document, opt-in per file, never blanket. |
| Continuous enforcement | The same rule set runs on write, on save, on scan, and on cron — one config, one result. |
| Bounded expression | Emoji and decorative formatting are constrained to a small approved set. |

---

## 2. The two tiers

The single most important structural decision in this brief.

**Tier 1 — Deterministic.** Custom markdownlint rules, regex fixers, and the dictionary pass. Reproducible, reviewable, idempotent. Safe to run unattended on cron, on the file watcher, and on pre-commit. This tier may rewrite your files without asking.

**Tier 2 — AI-assisted.** Tone adaptation, humour, audience shifting, and prose rewriting. Non-deterministic and a matter of taste. **Never runs automatically.** Invoked only by explicit slash command or MCP call, always writes to a `.draft.md` sibling, always returns a diff. This tier never touches a source file.

The boundary is not negotiable: anything that changes *meaning or voice* is Tier 2. Anything that changes *format* is Tier 1.

---

## 3. Rule catalogue

Machine IDs follow the existing `DVWnnn` convention (markdownlint rule names cannot contain spaces or `#`). Documentation and the registry use the human label **DvW MD Rule #nnn** for the same rule.

### 3.1 Live rules

| ID | Label | Name | Rule |
| - | - | - | - |
| DVW001 | DvW MD Rule #001 | `table-separator-spacing` | Separators are spaced: `\| - \|`, never compact `\|---\|` |
| DVW002 | DvW MD Rule #002 | `no-blank-lines-in-tables` | No blank line between table rows — a blank line terminates a GFM table |

### 3.2 Planned rules

| ID | Label | Name | Rule | Auto-fix |
| - | - | - | - | - |
| DVW003 | DvW MD Rule #003 | `no-block-elements-in-lists` | No fenced code, tables, or blockquotes nested inside list items | No — unnesting is ambiguous |
| DVW004 | DvW MD Rule #004 | `iso-dates` | Dates are ISO 8601 `YYYY-MM-DD`; times are 24h | Unambiguous forms only; `03/04/2026` is flagged, never guessed |
| DVW005 | DvW MD Rule #005 | `italicise-parentheticals` | Parenthetical asides are italicised, parens included: `*(like this)*` | Yes |
| DVW006 | DvW MD Rule #006 | `italicise-durations` | Time and duration expressions are italicised in headings and paragraphs: *2 hours*, *3 semaines*, *Q1* | Yes |
| DVW007 | DvW MD Rule #007 | `locale-units-spacing` | Number↔unit spacing per locale — see §5 | Yes |
| DVW008 | DvW MD Rule #008 | `emoji-allowlist` | Only the approved sets — see §3.4 | No — removal is destructive |
| DVW009 | DvW MD Rule #009 | `link-path-validation` | Relative links resolve on disk; anchors match a real heading; root-relative paths flagged | No |

### 3.3 Emphasis

Handled by stock markdownlint, no custom rule needed. `MD049: asterisk` and `MD050: asterisk` are already set in `config/.markdownlint.json`.

| Intent | Syntax |
| - | - |
| Italic | `*text*` — single asterisk, never `_text_` |
| Bold | `**text**` |
| Bold italic | `***text***` |
| Parenthetical aside | `*(text)*` — DVW005 |
| Duration | `*2 hours*` — DVW006 |

`***text***` means bold italic and nothing else. It is never a heavier italic.

### 3.4 Emoji

Four approved sets. Everything else is flagged.

| Set | Characters | Use |
| - | - | - |
| Footnote markers | `¹ ² ³ ⁴ ⁵` | References |
| Severity | `🔴 🟠 🟡 🟢` | Status and risk levels |
| State | `✓ ✅ ❌ 🚧 ⚠️` | Outcomes and warnings |
| Flow | `⇆ ← ⇆ 🔀` | Direction and transformation |

### 3.5 Fenced code blocks

Every fence carries a language identifier. Where no specific language applies, the default hierarchy is `md` → `diagram` → `text`. Enforced by MD040 and backfilled by keyword detection in `scripts/fix-markdown.mjs`.

### 3.6 Tables

Three non-negotiable rules, already enforced:

1. Never a blank line between rows (DVW002).
2. Separators are minimal and spaced — `| - |` (DVW001).
3. Never pad cells to visually align columns. The retired MD060A align rule stays retired.

Rows exceeding roughly 80 characters use an embedded HTML `<table>` instead. Table elements are MD033-allowed.

---

## 4. Enforcement surfaces

One rule set, six triggers. Multi-pass: the fixer loops until output is byte-stable, then re-lints and reports anything residual.

| Surface | Trigger | Tier |
| - | - | - |
| On write | Claude PostToolUse hook on `.md` | 1 |
| On save | VS Code `formatOnSave` + markdownlint extension | 1 |
| On change | DocuMind chokidar watcher | 1 — lint and record, no write |
| On demand | `/lint-md` slash command, `lint_file` and `fix_file` MCP tools | 1 |
| On scan | `scan-all-repos.mjs`, per-repo counts | 1 |
| On schedule | Nightly cron, `DOCUMIND_CRON_LINT` | 1 |
| On request | `/restyle`, `restyle_draft` MCP tool | 2 |

Results persist to the `linting_issues` table so `/stats` and every downstream dashboard report real numbers.

---

## 5. Locale policy

Locale is resolved from frontmatter `lang`, else a `.fr.md` filename suffix, else English.

| Context | English | French |
| - | - | - |
| Code-style units | Tight — `10px`, `1.5rem`, `24h` | Tight — identical |
| SI and measurement | Non-breaking space — `10 kg`, `5 %` (U+00A0) | Narrow non-breaking space (U+202F) |
| Before `; : ! ? »` | No space | Narrow non-breaking space (U+202F) |
| Dates | `2026-07-28` | `2026-07-28` |

French typography wins inside French documents. The rule is locale-aware, not global.

---

## 6. Dictionary and shortcuts

`config/dictionary.json` holds expansions and vocabulary normalisation, applied as a Tier 1 pass.

- Word-boundary matched, case-preserving.
- Never applied inside fenced code, inline code, URLs, file paths, or frontmatter.
- Example: `maj` → `mise à jour`.

Duration vocabulary for DVW006 lives separately in `config/style-vocabulary.json` — hours, days, weeks, months, trimester, semester, year, and their French equivalents.

---

## 7. Translation policy

EN↔FR via DeepL, using the already-provisioned `DEEPL_API_KEY`.

| Aspect | Policy |
| - | - |
| Trigger | Frontmatter `translate: fr` only. No blanket translation of the corpus. |
| Output | `<name>.fr.md` sibling — matches the existing `docs/slides/**/*.fr.md` convention |
| Protection | Fenced code, inline code, URLs, file paths, frontmatter keys, and `[[wikilinks]]` are masked before the API call and restored after |
| Staleness | Source `content_hash` is stored in the translated file's frontmatter; retranslation happens only when it changes |
| Absent key | The stage reports unavailable and skips — never fails the pipeline |

Translated output is re-linted under French locale rules before it is written.

---

## 8. Writing styles (Tier 2)

Style definitions live in `config/writing-styles.json` so they are editable without code changes.

| Style | Audience |
| - | - |
| `casual` | Internal notes, changelogs |
| `marketing` | Public-facing product copy |
| `didactic` | Explanatory documentation |
| `tutorial` | Step-by-step walkthroughs |
| `short` | Summaries and abstracts |
| `series` | Multi-part articles with continuity |
| `expert` | Assumes domain fluency |
| `newbie` | Assumes none |

Humour is a separate opt-in flag (`light` or `none`), never a default. It applies to articles, never to reference documentation, API docs, or security material.

---

## 9. Future milestone — Central Shared Navigation & Dashboards

Documented here for continuity. **Not part of the markdown rules milestone** — it touches RootDispatcher, `shared-packages`, and every repo's dashboard, and needs its own spec, plan, and cross-repo coordination.

### 9.1 Vision

A single navigation shell shared by every internal dashboard in the ecosystem:

- Aggregate all per-repo dashboards into one main menu.
- Button bar: `[ Reporting | MCPs | Skills | Tools | Avatar ▸ Profile ▸ Settings ]`.
- GitHub-style repository switcher — six repos visible, autocomplete search across all.
- Every repository reachable by name, no exceptions.

### 9.2 Prior art already in place

| Asset | Location | State |
| - | - | - |
| Central dashboard spec | `RootDispatcher/docs/DASHBOARD-SPEC.md` | v1 ships as MCP tool `dashboard_status`; web UI explicitly deferred to v2 |
| Service registration contract | `RootDispatcher/dispatches/applied/DISPATCH-060-central-dashboard.md` | Requires `GET /health` plus a `docUrl` in `repository-registry.json` |
| Port registry | `RootDispatcher/config/port-registry.json` | v1.4.0 — authoritative service and port list |
| Nav model | `shared-packages/packages/nav-core` | Framework-agnostic `NavConfig` types, Zod schemas, route matching |
| Nav components | `nav-mui`, `nav-shadcn`, `nav-admin`, `nav-server` | React/TS, MUI and ShadCN variants, admin editor, Express routes |

### 9.3 Known gaps

- DocuMind's own dashboard is two hand-written vanilla HTML pages (`dashboard/obsolete.html`, `dashboard/diagrams.html`) with a copy-pasted two-link nav and no build step. Consuming `nav-core` requires introducing one.
- Port 9000 has no root route — `http://localhost:9000/` returns a bare 404. There is no landing page.
- `/search`, `/stats`, `/keywords`, `/graph`, and `/tree/:repo` all return JSON with no UI consuming them.
- DISPATCH-060 references `http://localhost:9000/docs/{Repo}` as the `docUrl` pattern; that route does not exist.
- Port 7000 is registered as "Control Center Dashboard" with no identified owner — ownership needs verifying before it is linked from a central menu.

---

## 10. Related documents

- `docs/MARKDOWN-RULES.md` — generated rule registry, one entry per DVW rule
- `CLAUDE.md` — repository standards, table format, code block identifiers
- `config/.markdownlint.json` — canonical rule configuration
- `config/rules/` — custom rule implementations
