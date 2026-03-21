/**
 * Custom markdownlint rule: table-separator-spacing (DVW001)
 *
 * Enforces spaces inside table separator cells.
 * ✅ | --- | --- |    (spaces between pipe and dashes)
 * ❌ |---|---|          (compact — no spaces)
 *
 * Provides fixInfo so `markdownlint-cli2 --fix` auto-corrects violations.
 *
 * @version 1.0.0
 * @created 2025-03-10
 */

module.exports = {
  names: ['table-separator-spacing', 'DVW001'],
  description: 'Table separator rows must have spaces inside cells: | --- | not |---|',
  tags: ['table'],
  parser: 'none',
  function: function rule(params, onError) {
    // Compact separator row: |---|---| or |:---:|:---:| with NO spaces
    const compactSeparator = /^\|:?-+:?(\|:?-+:?)+\|$/;

    for (let i = 0; i < params.lines.length; i++) {
      const line = params.lines[i];

      if (compactSeparator.test(line)) {
        // Add a space on each side of dashes in every cell
        const fixedLine = line.replace(/\|(:?-+:?)/g, '| $1 ');

        onError({
          lineNumber: i + 1,
          detail: "Use '| --- |' format with spaces, not compact '|---|'",
          fixInfo: {
            lineNumber: i + 1,
            editColumn: 1,
            deleteCount: line.length,
            insertText: fixedLine,
          },
        });
      }
    }
  },
};
