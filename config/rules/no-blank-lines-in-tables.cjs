/**
 * Custom markdownlint rule: no-blank-lines-in-tables (DVW002)
 *
 * A blank line inside a GFM table terminates it — every row after the blank
 * renders as raw text. This rule detects blank lines between table rows and
 * removes them via auto-fix.
 *
 * ✅ | Col | Col |
 *    | - | - |
 *    | data | data |
 *
 * ❌ | Col | Col |
 *
 *    | - | - |
 *
 *    | data | data |
 *
 * Guard: if the rows after the gap start a NEW table (a non-separator row
 * immediately followed by a separator row), the blank line is a legitimate
 * boundary between two adjacent tables and is kept.
 *
 * Provides fixInfo so `markdownlint-cli2 --fix` auto-corrects violations.
 *
 * @version 1.0.0
 * @created 2026-07-07
 */

const TABLE_ROW = /^\s*\|.*\S/;
const SEPARATOR_ROW = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;
const FENCE = /^\s*(```|~~~)/;

module.exports = {
  names: ['no-blank-lines-in-tables', 'DVW002'],
  description: 'Tables must not contain blank lines between rows (breaks rendering)',
  tags: ['table'],
  parser: 'none',
  function: function rule(params, onError) {
    const lines = params.lines;
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (FENCE.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence || !TABLE_ROW.test(line)) continue;

      // Collect the run of blank lines following this table row
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;

      // No gap, or gap runs to EOF, or gap legitimately ends the table
      if (j === i + 1 || j >= lines.length || !TABLE_ROW.test(lines[j])) continue;

      // Guard: header + separator after the gap = a new, separate table
      const startsNewTable =
        !SEPARATOR_ROW.test(lines[j]) && SEPARATOR_ROW.test(lines[j + 1] || '');
      if (startsNewTable) continue;

      // Report every blank line in the gap; fix = delete the line
      for (let k = i + 1; k < j; k++) {
        onError({
          lineNumber: k + 1,
          detail: 'Blank line inside a table breaks rendering — rows must be consecutive',
          fixInfo: {
            lineNumber: k + 1,
            deleteCount: -1,
          },
        });
      }

      // Continue scanning from the row after the gap
      i = j - 1;
    }
  },
};
