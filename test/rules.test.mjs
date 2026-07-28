#!/usr/bin/env node

/**
 * DVW rule fixture tests.
 *
 * For every `test/fixtures/markdown/<rule>.input.md`:
 *   - lint it with that rule alone and compare the findings to
 *     `<rule>.expected.json` (line, detail, fixability)
 *   - apply fixes and compare byte-for-byte to `<rule>.expected.md`
 *   - re-run the fixer on its own output and require a no-op, so a rule that
 *     oscillates fails here rather than in the nightly cron
 *
 * Fixture names map to rule files: `iso-dates.input.md` → `iso-dates.cjs`.
 * A `.fr.` infix (`locale-units-spacing.fr.input.md`) selects the same rule
 * with a French filename, which is how locale fallback gets covered.
 *
 * Usage:
 *   node test/rules.test.mjs             # run
 *   node test/rules.test.mjs --update    # regenerate expectations
 *
 * @module test/rules.test
 * @version 1.0.0
 * @created 2026-07-28
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRule, runRuleToFixpoint } from './rule-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures/markdown');
const UPDATE = process.argv.includes('--update');

let passed = 0;
let failed = 0;

const ok = msg => {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
};
const fail = (msg, detail) => {
  failed++;
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
  if (detail) console.log(`      ${String(detail).split('\n').join('\n      ')}`);
};

/** Compact a diff of two multi-line strings to the first differing lines. */
function firstDiff(actual, expected) {
  const a = actual.split('\n');
  const b = expected.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}\n  actual:   ${JSON.stringify(a[i])}\n  expected: ${JSON.stringify(b[i])}`;
    }
  }
  return 'files differ in length only';
}

const entries = (await fs.readdir(FIXTURES)).filter(f => f.endsWith('.input.md')).sort();

if (entries.length === 0) {
  console.error('No fixtures found in test/fixtures/markdown');
  process.exit(1);
}

console.log(`\nDVW rule fixtures — ${entries.length} case(s)${UPDATE ? ' [UPDATE MODE]' : ''}\n`);

for (const entry of entries) {
  // `iso-dates.input.md` → iso-dates ; `locale-units-spacing.fr.input.md` → locale-units-spacing
  const stem = entry.replace(/\.input\.md$/, '');
  const ruleName = stem.replace(/\.fr$/, '');
  const ruleFile = `${ruleName}.cjs`;

  const inputPath = path.join(FIXTURES, entry);
  const expectedMd = path.join(FIXTURES, `${stem}.expected.md`);
  const expectedJson = path.join(FIXTURES, `${stem}.expected.json`);

  const content = await fs.readFile(inputPath, 'utf8');

  // A French fixture is linted under a .fr.md name so filename-based locale
  // fallback is exercised, not just the frontmatter path.
  const lintName = stem.endsWith('.fr') ? path.join(FIXTURES, `${ruleName}.fr.md`) : inputPath;

  console.log(`\x1b[1m${stem}\x1b[0m (${ruleFile})`);

  let result;
  try {
    result = runRule(ruleFile, content, lintName);
  } catch (err) {
    fail(`rule loads`, err.message);
    continue;
  }

  if (UPDATE) {
    await fs.writeFile(expectedJson, JSON.stringify(result.issues, null, 2) + '\n', 'utf8');
    await fs.writeFile(expectedMd, result.fixed, 'utf8');
    ok(`expectations written (${result.issues.length} issues)`);
    continue;
  }

  // 1. findings match
  const wantIssues = JSON.parse(await fs.readFile(expectedJson, 'utf8').catch(() => 'null'));
  if (wantIssues === null) {
    fail('expected findings file missing — run with --update');
  } else if (JSON.stringify(result.issues) === JSON.stringify(wantIssues)) {
    ok(`${result.issues.length} finding(s) match`);
  } else {
    fail(
      'findings differ',
      `actual:\n${JSON.stringify(result.issues, null, 1)}\nexpected:\n${JSON.stringify(wantIssues, null, 1)}`
    );
  }

  // 2. fixed output matches
  const wantFixed = await fs.readFile(expectedMd, 'utf8').catch(() => null);
  if (wantFixed === null) {
    fail('expected output file missing — run with --update');
  } else if (result.fixed === wantFixed) {
    ok('fixed output matches');
  } else {
    fail('fixed output differs', firstDiff(result.fixed, wantFixed));
  }

  // 3. idempotence — fixing the output again must change nothing
  const fp = runRuleToFixpoint(ruleFile, content);
  if (!fp.converged) {
    fail(`does not converge after ${fp.passes} passes — fixes are fighting each other`);
  } else {
    const second = runRule(ruleFile, result.fixed, lintName);
    if (second.fixed === result.fixed) ok(`idempotent (${fp.passes} pass(es))`);
    else
      fail(
        'not idempotent — second pass changed the output',
        firstDiff(second.fixed, result.fixed)
      );
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
