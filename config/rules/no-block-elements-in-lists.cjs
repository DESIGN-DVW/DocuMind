/**
 * Custom markdownlint rule: no-block-elements-in-lists (DVW003)
 *
 * Block elements nested inside list items render inconsistently across GFM,
 * Marp, and the PDF/PPTX exporters, and they make a list impossible to scan.
 * Lift the block out of the list, or convert the list to headings.
 *
 * ✅ 1. Configure the daemon
 *    2. Restart it
 *
 *    ```bash
 *    pm2 restart documind
 *    ```
 *
 * ❌ 1. Configure the daemon
 *
 *       ```bash
 *       pm2 restart documind
 *       ```
 *
 * Detect only. Unnesting is ambiguous — the block may belong before the list,
 * after it, or as a sibling — so this rule never guesses.
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

const { TABLE_ROW, FENCE, LIST_ITEM } = require('./_shared.cjs');

const BLOCKQUOTE = /^\s*>/;

module.exports = {
  names: ['no-block-elements-in-lists', 'DVW003'],
  description: 'List items must not contain fenced code, tables, or blockquotes',
  tags: ['list', 'code', 'table'],
  parser: 'none',
  function: function rule(params, onError) {
    const lines = params.lines;

    // Content indent of the innermost open list item, or null when not in a list
    let listContentIndent = null;
    let blanksSinceContent = 0;
    let inFence = false;
    let fenceReported = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Inside a fence, only look for its close — a fence body can hold
      // anything, including text that looks like a list or a table
      if (inFence) {
        if (FENCE.test(line)) inFence = false;
        continue;
      }

      const listMatch = line.match(LIST_ITEM);
      if (listMatch) {
        listContentIndent = listMatch[0].length;
        blanksSinceContent = 0;
        fenceReported = false;
        continue;
      }

      if (line.trim() === '') {
        blanksSinceContent++;
        // Two consecutive blank lines close any list
        if (blanksSinceContent >= 2) listContentIndent = null;
        continue;
      }

      const indent = line.length - line.trimStart().length;

      // A non-blank line indented less than the list content closes the list
      if (listContentIndent !== null && indent < listContentIndent) {
        listContentIndent = null;
      }

      blanksSinceContent = 0;

      if (FENCE.test(line)) {
        if (listContentIndent !== null && !fenceReported) {
          onError({
            lineNumber: i + 1,
            detail: 'Fenced code block inside a list item — lift it out of the list',
          });
          fenceReported = true;
        }
        inFence = true;
        continue;
      }

      if (listContentIndent === null) continue;

      if (TABLE_ROW.test(line)) {
        onError({
          lineNumber: i + 1,
          detail: 'Table inside a list item — lift it out of the list',
        });
        // Skip the rest of the table so one table reports once
        while (i + 1 < lines.length && TABLE_ROW.test(lines[i + 1])) i++;
        continue;
      }

      if (BLOCKQUOTE.test(line)) {
        onError({
          lineNumber: i + 1,
          detail: 'Blockquote inside a list item — lift it out of the list',
        });
        while (i + 1 < lines.length && BLOCKQUOTE.test(lines[i + 1])) i++;
      }
    }
  },
};
