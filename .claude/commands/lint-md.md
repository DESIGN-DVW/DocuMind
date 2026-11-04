---

name: lint-md
description: "Lint and auto-fix markdown against the DVW rules — one file, a folder, or the whole repo"
allowed-tools: [Bash, Read, Glob, mcp__documind__lint_file, mcp__documind__fix_file]

---

# /lint-md — Markdown Lint & Fix

Runs the deterministic (Tier 1) markdown pipeline: stock markdownlint rules plus the DVW custom rules in `config/rules/`, applied to convergence.

Never rewrites prose voice — that is `/restyle`, a separate opt-in tier.

## Usage

```text
/lint-md                    # whole repo, report only
/lint-md --fix              # whole repo, apply fixes
/lint-md docs/GUIDE.md      # one file
/lint-md docs/ --fix        # one folder, apply fixes
```

## What to do

1. **Resolve the target.** No argument means the whole repo. A path argument is a file or folder relative to the repo root.

2. **Report first, then fix.** Without `--fix`, only report. With `--fix`, apply and show what changed.

   For a single file, prefer the MCP tools — they run the same convergence loop as the daemon and record results in the `linting_issues` table:

   ```text
   mcp__documind__lint_file  { file: "<absolute path>" }
   mcp__documind__fix_file   { file: "<absolute path>" }
   ```

   For a folder or the whole repo, use the CLI:

   ```bash
   npx markdownlint-cli2 "**/*.md"          # report
   npx markdownlint-cli2 --fix "**/*.md"    # fix
   ```

3. **Summarise by rule**, not by line. Group findings by rule ID and say how many are auto-fixable. Point out anything needing a human decision — DVW003 (block elements in lists), DVW009 (broken links), and ambiguous dates under DVW004 are never auto-fixed.

4. **Report `converged: false`** if `fix_file` returns it. That means two fix passes are fighting each other and the rules need attention — do not just re-run it.

## Rule reference

`docs/MARKDOWN-RULES.md` is generated from the registry. Regenerate after changing a rule or an enable flag:

```bash
npm run docs:rules
```

## Opt-in rules

DVW005 (parentheticals), DVW006 (durations), DVW007 (units spacing), DVW008 (emoji), and the dictionary pass are disabled by default — they rewrite existing prose across the corpus, and pre-commit plus the nightly cron both run `--fix`.

To enable one: flip it in `config/.markdownlint.json` (or `enabled: true` in `config/dictionary.json`), run `npm run lint:fix`, review the diff, and commit the flag together with the changes it produced.
