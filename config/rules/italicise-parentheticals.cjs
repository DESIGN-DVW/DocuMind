/**
 * Custom markdownlint rule: italicise-parentheticals (DVW005)
 *
 * A parenthetical aside is a change of voice, so it is set in italics —
 * parentheses included.
 *
 * ✅ The daemon restarts automatically *(usually within a second)*.
 * ❌ The daemon restarts automatically (usually within a second).
 *
 * This rule rewrites prose, so it is deliberately conservative. It skips:
 *   - code spans, fenced blocks, links, URLs, and HTML blocks
 *   - table rows, where parentheses are usually terse labels
 *   - anything already inside emphasis
 *   - function-call shapes: `restart()`, `fn(arg)` — a word character or a
 *     closing bracket immediately before the paren
 *   - nested or unbalanced parentheses
 *   - abbreviation glosses of a single token: `(v2)`, `(PM2)`, `(1)` —
 *     italicising those adds noise, not voice
 *   - footnote and citation markers: `(^1)`, `(#anchor)`
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

const { proseLines, maskInlineCode, maskLinks, maskUrls, emphasisMask } = require('./_shared.cjs');

/** A balanced, non-nested parenthetical. */
const PARENTHETICAL = /\(([^()]*)\)/g;

/** Single bare token — an abbreviation or number, not an aside. */
const SINGLE_TOKEN = /^[\w.+-]+$/u;

/** Footnote, anchor, and citation markers. */
const MARKER = /^[\^#@]/;

module.exports = {
  names: ['italicise-parentheticals', 'DVW005'],
  description: 'Parenthetical asides must be italicised, parentheses included',
  tags: ['emphasis', 'style'],
  parser: 'none',
  function: function rule(params, onError) {
    for (const { line, index } of proseLines(params.lines)) {
      // Mask what must never be rewritten, preserving offsets
      const searchable = maskUrls(maskLinks(maskInlineCode(line)));
      const inEmphasis = emphasisMask(line);

      // Collect first, then apply right-to-left so earlier offsets stay valid
      const edits = [];

      for (const m of searchable.matchAll(PARENTHETICAL)) {
        const inner = m[1];
        const start = m.index;
        const end = start + m[0].length;

        if (inner.trim() === '') continue;
        if (SINGLE_TOKEN.test(inner.trim())) continue;
        if (MARKER.test(inner.trim())) continue;
        if (inEmphasis(start)) continue;

        // Function-call shape: `name(args)` or `](args)`
        const before = line[start - 1];
        if (before && /[\w\])]/.test(before)) continue;

        // Already wrapped: *(...)* or **(...)**
        const wrapBefore = line.slice(Math.max(0, start - 3), start);
        const wrapAfter = line.slice(end, end + 3);
        if (/\*$/.test(wrapBefore) && /^\*/.test(wrapAfter)) continue;

        edits.push({ start, end, text: `*${line.slice(start, end)}*` });
      }

      for (const edit of edits.reverse()) {
        onError({
          lineNumber: index + 1,
          detail: `Italicise the aside: ${line.slice(edit.start, edit.end)} → ${edit.text}`,
          range: [edit.start + 1, edit.end - edit.start],
          fixInfo: {
            lineNumber: index + 1,
            editColumn: edit.start + 1,
            deleteCount: edit.end - edit.start,
            insertText: edit.text,
          },
        });
      }
    }
  },
};
