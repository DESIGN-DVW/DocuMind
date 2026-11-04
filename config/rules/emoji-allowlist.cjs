/**
 * Custom markdownlint rule: emoji-allowlist (DVW008)
 *
 * Emoji carry meaning here, so the vocabulary is small and fixed. Four sets:
 *
 *   Footnote markers  ¹ ² ³ ⁴ ⁵
 *   Severity          🔴 🟠 🟡 🟢
 *   State             ✓ ✅ ❌ 🚧 ⚠️
 *   Flow              ← → ↔ ⇆ ⇒ 🔀
 *
 * Anything else is reported. Detect only — deleting an emoji changes meaning
 * and choosing a replacement is a judgement call, so the rule never guesses.
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

const { proseLines, maskInlineCode, maskLinks, maskUrls } = require('./_shared.cjs');

const ALLOWED = new Set([
  ...'¹²³⁴⁵',
  ...'🔴🟠🟡🟢',
  ...'✓✅❌🚧⚠️',
  ...'←→↔⇆⇒🔀',
  '️', // variation selector-16, the emoji-presentation marker
  '‍', // zero-width joiner
]);

const SET_NAMES = 'footnote (¹²³⁴⁵), severity (🔴🟠🟡🟢), state (✓✅❌🚧⚠️), flow (←→↔⇆⇒🔀)';

/** Pictographic characters plus the dingbat and arrow ranges the sets draw on. */
const EMOJI = /[\p{Extended_Pictographic}←-⇿✀-➿⬀-⯿]/gu;

module.exports = {
  names: ['emoji-allowlist', 'DVW008'],
  description: `Only approved emoji sets may be used: ${SET_NAMES}`,
  tags: ['emoji', 'style'],
  parser: 'none',
  function: function rule(params, onError) {
    for (const { line, index } of proseLines(params.lines, { includeTables: true })) {
      const searchable = maskUrls(maskLinks(maskInlineCode(line)));

      for (const m of searchable.matchAll(EMOJI)) {
        if (ALLOWED.has(m[0])) continue;

        onError({
          lineNumber: index + 1,
          detail: `"${m[0]}" is not in an approved set. Allowed: ${SET_NAMES}`,
          range: [m.index + 1, m[0].length],
        });
      }
    }
  },
};
