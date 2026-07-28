/**
 * Rule test harness.
 *
 * Lints a string against exactly one DVW rule (every other rule disabled) so a
 * fixture proves that rule's behaviour and nothing else's, then applies fixes
 * so auto-fix output can be asserted byte-for-byte.
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { lint } = require('markdownlint/sync');
const { applyFixes } = require('markdownlint');

const RULES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/rules');

/**
 * Load a rule module by filename.
 *
 * @param {string} ruleFile e.g. 'iso-dates.cjs'
 * @returns {object}
 */
export function loadRule(ruleFile) {
  return require(path.join(RULES_DIR, ruleFile));
}

/**
 * Run one rule in isolation.
 *
 * @param {string} ruleFile
 * @param {string} content
 * @param {string} [name] Path used as the markdownlint string key. Rules that
 *   resolve links or read the locale from a filename need a real absolute path.
 * @returns {{id: string, issues: {line: number, detail: string, fixable: boolean}[], fixed: string}}
 */
export function runRule(ruleFile, content, name = 'fixture') {
  const rule = loadRule(ruleFile);
  const id = rule.names.find(n => /^DVW\d+$/.test(n));

  const raw =
    lint({
      strings: { [name]: content },
      config: { default: false, [id]: true },
      customRules: [rule],
    })[name] || [];

  return {
    id,
    issues: raw.map(r => ({
      line: r.lineNumber,
      detail: r.errorDetail ?? r.ruleDescription,
      fixable: r.fixInfo != null,
    })),
    fixed: applyFixes(content, raw),
  };
}

/**
 * Apply a rule repeatedly until its own output stops changing.
 * Proves a fixing rule is idempotent and does not oscillate.
 *
 * @param {string} ruleFile
 * @param {string} content
 * @param {number} [max]
 * @returns {{content: string, passes: number, converged: boolean}}
 */
export function runRuleToFixpoint(ruleFile, content, max = 5) {
  let current = content;
  for (let pass = 1; pass <= max; pass++) {
    const { fixed } = runRule(ruleFile, current);
    if (fixed === current) return { content: current, passes: pass, converged: true };
    current = fixed;
  }
  return { content: current, passes: max, converged: false };
}
