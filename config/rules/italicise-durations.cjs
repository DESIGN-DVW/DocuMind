/**
 * Custom markdownlint rule: italicise-durations (DVW006)
 *
 * Time spans and periods are italicised in headings and paragraphs, so a
 * reader scanning a document can pick out the schedule from the prose.
 *
 * ✅ The scan completes in *2 hours*. Ship by *Q3*.
 * ❌ The scan completes in 2 hours. Ship by Q3.
 *
 * Vocabulary lives in config/style-vocabulary.json (EN + FR) rather than in
 * this file, so terms can be added without touching code.
 *
 * Skips code spans, links, URLs, fenced blocks, and table rows, and never
 * re-wraps something already emphasised.
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

const path = require('node:path');
const { proseLines, maskInlineCode, maskLinks, maskUrls, emphasisMask } = require('./_shared.cjs');

const VOCAB_PATH = path.join(__dirname, '../style-vocabulary.json');

let cached = null;

/** Build the duration and period matchers from the shared vocabulary file. */
function patterns() {
  if (cached) return cached;

  let vocab;
  try {
    vocab = require(VOCAB_PATH);
  } catch {
    vocab = { durations: { en: [], fr: [] }, periods: [] };
  }

  const units = [...new Set([...(vocab.durations?.en || []), ...(vocab.durations?.fr || [])])]
    .sort((a, b) => b.length - a.length)
    .map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  const periods = (vocab.periods || [])
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  cached = {
    // `2 hours`, `18 mois`, `1.5 days`, `3-4 weeks`
    duration: units
      ? new RegExp(`\\b\\d+(?:[.,]\\d+)?(?:\\s*[-–]\\s*\\d+(?:[.,]\\d+)?)?\\s+(?:${units})\\b`, 'gi')
      : null,
    period: periods ? new RegExp(`\\b(?:${periods})\\b`, 'g') : null,
  };
  return cached;
}

module.exports = {
  names: ['italicise-durations', 'DVW006'],
  description: 'Time and duration expressions must be italicised',
  tags: ['emphasis', 'style', 'dates'],
  parser: 'none',
  function: function rule(params, onError) {
    const { duration, period } = patterns();
    if (!duration && !period) return;

    for (const { line, index } of proseLines(params.lines)) {
      const searchable = maskUrls(maskLinks(maskInlineCode(line)));
      const inEmphasis = emphasisMask(line);

      const spans = [];
      for (const re of [duration, period]) {
        if (!re) continue;
        for (const m of searchable.matchAll(re)) {
          spans.push({ start: m.index, end: m.index + m[0].length });
        }
      }

      // Right-to-left so earlier offsets stay valid as fixes are applied
      spans.sort((a, b) => b.start - a.start);

      let lastStart = Infinity;
      for (const { start, end } of spans) {
        if (start >= lastStart) continue; // overlapping match, keep the outer one
        if (inEmphasis(start)) continue;

        // Already wrapped in asterisks
        if (line[start - 1] === '*' && line[end] === '*') continue;

        lastStart = start;
        const text = line.slice(start, end);
        onError({
          lineNumber: index + 1,
          detail: `Italicise the duration: ${text} → *${text}*`,
          range: [start + 1, end - start],
          fixInfo: {
            lineNumber: index + 1,
            editColumn: start + 1,
            deleteCount: end - start,
            insertText: `*${text}*`,
          },
        });
      }
    }
  },
};
