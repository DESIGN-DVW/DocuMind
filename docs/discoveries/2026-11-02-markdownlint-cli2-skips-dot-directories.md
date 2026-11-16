---
date: "2026-11-02"
classification: "discoveries/insights"
status: "active"
repo_source: "DocuMind"
topics: ["markdown", "linting", "tooling", "agent-authored-docs"]
---

# markdownlint-cli2 silently skips dot-directories, so `.claude/` and `.planning/` are never linted

## What

`markdownlint-cli2` resolves its targets through [globby](https://github.com/sindresorhus/globby), which excludes dot-directories by default. Files under `.claude/`, `.planning/`, `.github/` and similar are therefore never linted — and crucially, **passing them as explicit paths does not help**. `markdownlint-cli2 '.claude/**/*.md'` reports zero files and exits 0, which looks exactly like success.

This is not an `ignores` problem. Removing those paths from the `ignores` list in `.markdownlint-cli2.jsonc` changes nothing, because the globbing layer never offers the files to the rule engine in the first place.

## Why it matters

Agent-authored markdown lives disproportionately in dot-directories: `.claude/agents/`, `.claude/commands/`, `.claude/knowledge/`, and GSD's `.planning/` tree. So the exact files most likely to be written by a non-human are the ones no linter has ever checked.

The concrete damage found in this ecosystem was broken GFM tables. A blank line between table rows terminates the table, and everything after it renders as raw pipe-delimited text in HTML and in editor preview. A formatting pass on 2026-03-30 (DocuMind `5c22391`) introduced them at scale, and because the healer could not reach the affected trees, every manual correction drifted back and conflicted on the next pass. Final count once a reaching tool existed: **42 broken files in DocuMind, 46 in RootDispatcher** — nearly all of them under `.claude/` or `.planning/`.

The misleading part is the exit code. A CI step or pre-commit hook that lints `'**/*.md'` passes green while an entire category of documentation goes unchecked, so the gap survives indefinitely.

## How to apply

Do not try to coax `markdownlint-cli2` into dot-directories. Walk the tree with `fs` and hand the strings to the `markdownlint` library directly:

```javascript
import fs from 'fs';
import path from 'path';
import { lint } from 'markdownlint/sync';
import { applyFixes } from 'markdownlint';

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;          // node_modules, .git, dist, worktrees…
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const results = lint({ strings: { [file]: content }, customRules, config });
fs.writeFileSync(file, applyFixes(content, results[file]), 'utf-8');
```

Two details make the difference between a usable tool and an unusable one:

Set `default: false` in the config and enable only the rules you are targeting. Previously-unlinted trees accumulate years of unrelated MD0xx violations, and a full-rule run on them produces thousands of findings that bury the one class of breakage you came to fix.

Accept both directories and explicit `.md` paths as arguments, so the same script serves as a repo-wide pass (`node scripts/fix-tables.mjs .`) and as a `lint-staged` per-file hook. That is what closes the loop — the repo-wide pass heals history, the hook prevents recurrence.

Reference implementation: [`scripts/fix-tables.mjs`](../../scripts/fix-tables.mjs), wired as `npm run lint:tables` (check, exits 1) and `npm run fix:tables` (repair), plus a `lint-staged` entry scoped to `{.planning,.claude}/**/*.md`.

One caveat when auditing: documentation that *demonstrates* broken markdown inside a fenced code block is a legitimate false positive. Any scan for this class of breakage must be fence-aware. A naive grep over DocuMind reported 46 broken files where only 42 were real — the other four were deliberate `WRONG:` examples in standards docs.

## Evidence / references

- DocuMind PR #64 — `scripts/fix-tables.mjs` plus the 42-file repair.
- RootDispatcher PR #113 (`ec8738d`) — the same 46-file repair applied to the coordination hub.
- Origin of the breakage: DocuMind `5c22391`, formatting pass of 2026-03-30.
- The two custom rules that detect it: `config/rules/table-separator-spacing.cjs` (DVW001) and `config/rules/no-blank-lines-in-tables.cjs` (DVW002).
- Table formatting rules themselves: `CLAUDE.md` › Markdown Standards › Table Format.
