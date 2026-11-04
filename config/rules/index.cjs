/**
 * Custom markdownlint rule registry — single source of truth.
 *
 * Auto-discovers every rule module in this directory so a new rule is one new
 * file and zero registration edits. Previously each rule had to be listed in
 * three separate places (.markdownlint-cli2.jsonc, daemon/mcp-server.mjs,
 * .vscode/settings.json), which is how DVW002 came to be silently missing from
 * the editor path and how the deleted MD060A rule lingered there.
 *
 * Skipped: this file, and any file whose name starts with `_` (shared helpers).
 *
 * Consumed by:
 *   - .markdownlint-cli2.jsonc  → customRules
 *   - .vscode/settings.json     → markdownlint.customRules
 *   - daemon/mcp-server.mjs     → lint_file / fix_file
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

const fs = require('node:fs');
const path = require('node:path');

const SELF = path.basename(__filename);

/**
 * Every discovered rule module, sorted by filename for stable ordering.
 * markdownlint validates the shape at load time, so a malformed rule throws
 * here rather than silently disappearing.
 *
 * @type {import('markdownlint').Rule[]}
 */
const rules = fs
  .readdirSync(__dirname)
  .filter(f => f.endsWith('.cjs') && f !== SELF && !f.startsWith('_'))
  .sort()
  .map(f => require(path.join(__dirname, f)));

/**
 * Rule metadata for documentation generation and the DocuMind rule registry.
 * `id` is the DVWnnn machine name; `label` is the human form used in docs.
 *
 * @returns {{id: string, name: string, label: string, description: string, tags: string[]}[]}
 */
function describeRules() {
  return rules.map(rule => {
    const id = rule.names.find(n => /^DVW\d+$/.test(n)) || rule.names[rule.names.length - 1];
    const name = rule.names.find(n => n !== id) || rule.names[0];
    return {
      id,
      name,
      label: `DvW MD Rule #${id.replace(/^DVW/, '')}`,
      description: rule.description,
      tags: rule.tags || [],
    };
  });
}

module.exports = rules;
module.exports.describeRules = describeRules;
