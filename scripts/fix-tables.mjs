#!/usr/bin/env node

/**
 * Table-integrity fixer — repairs GFM tables broken by blank lines between rows.
 *
 * Why this exists separately from `markdownlint-cli2`:
 * cli2 resolves targets through globby, which skips dot-directories. That makes
 * `.planning/` and `.claude/` unreachable even when they are removed from the
 * `ignores` list and passed as explicit paths — so DVW001/DVW002 could never
 * repair the agent-authored docs that live there. This walks the tree with `fs`
 * instead, so hidden directories are included.
 *
 * Only the two table rules run (`default: false`), so linting previously
 * excluded trees surfaces table breakage without a flood of unrelated
 * MD0xx violations.
 *
 * Usage:
 *   node scripts/fix-tables.mjs [root]            # repair in place
 *   node scripts/fix-tables.mjs [root] --check    # report only, exit 1 if any
 *
 * @module scripts/fix-tables
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { lint } from 'markdownlint/sync';
import { applyFixes } from 'markdownlint';

const require = createRequire(import.meta.url);

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  '.turbo',
]);

const customRules = [
  require('../config/rules/table-separator-spacing.cjs'),
  require('../config/rules/no-blank-lines-in-tables.cjs'),
];

// Every built-in rule off; only the table rules on.
const config = {
  default: false,
  'table-separator-spacing': true,
  'no-blank-lines-in-tables': true,
};

/**
 * Collect every markdown file under dir, including dot-directories.
 * @param {string} dir
 * @param {string[]} [out]
 * @returns {string[]}
 */
function collect(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const targets = args.filter(a => !a.startsWith('--'));

// Accept either directories (walked, dot-dirs included) or explicit .md files,
// so this works both as a repo-wide pass and as a lint-staged per-file hook.
const root = process.cwd();
const files = (targets.length ? targets : ['.']).flatMap(target => {
  const resolved = path.resolve(target);
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return [];
  }
  if (stat.isDirectory()) return collect(resolved);
  return resolved.endsWith('.md') ? [resolved] : [];
});
let offending = 0;
let repaired = 0;
const details = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const results = lint({ strings: { [file]: content }, customRules, config });
  const errors = results[file] ?? [];
  if (errors.length === 0) continue;

  offending++;
  const rel = path.relative(root, file);
  details.push(
    `  ${rel} — ${errors.length} violation(s) at line(s) ${errors.map(e => e.lineNumber).join(', ')}`
  );

  if (checkOnly) continue;

  const fixed = applyFixes(content, errors);
  if (fixed !== content) {
    fs.writeFileSync(file, fixed, 'utf-8');
    repaired++;
  }
}

console.log(`Scanned ${files.length} markdown file(s) under ${root}`);
if (details.length) console.log(details.join('\n'));

if (checkOnly) {
  if (offending) {
    console.error(
      `\n✗ ${offending} file(s) have table violations. Run: node scripts/fix-tables.mjs`
    );
    process.exitCode = 1;
  } else {
    console.log('✓ No table violations.');
  }
} else {
  console.log(`\n✓ Repaired ${repaired} of ${offending} offending file(s).`);
}
