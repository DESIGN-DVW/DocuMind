/**
 * Shared helpers for DVW custom markdownlint rules.
 *
 * Files prefixed with `_` are skipped by the registry in index.cjs, so this is
 * a helper module rather than a rule.
 *
 * Every DVW rule works on `params.lines` with `parser: 'none'`, which means
 * each rule is responsible for not matching inside code. These helpers make
 * that consistent — a rule that reports a violation inside a fenced block or a
 * code span is worse than no rule at all, because the noise trains people to
 * ignore it.
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

/** A table row: starts with a pipe and has some content. */
const TABLE_ROW = /^\s*\|.*\S/;

/** A table separator row: `| - |`, `| --- |`, `| :-: |`. */
const SEPARATOR_ROW = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;

/** Opening or closing fence. */
const FENCE = /^\s*(```|~~~)/;

/** A list item marker, capturing indent and marker so content indent is known. */
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+/;

/** ATX heading, capturing the hashes and the text. */
const ATX_HEADING = /^(\s{0,3}#{1,6}\s+)(.*?)(\s*#*\s*)$/;

/**
 * Replace inline code spans with spaces, preserving length so every column
 * number a rule reports still lines up with the original text.
 *
 * @param {string} line
 * @returns {string}
 */
function maskInlineCode(line) {
  return line.replace(/`+[^`]*`+/g, m => ' '.repeat(m.length));
}

/**
 * Replace inline links and images with spaces — both the text and the target.
 * Rules that rewrite prose (emphasis, units, dictionary) must not touch link
 * targets, and usually should not touch link text either.
 *
 * @param {string} line
 * @returns {string}
 */
function maskLinks(line) {
  return line.replace(/!?\[[^\]]*\]\([^)]*\)/g, m => ' '.repeat(m.length));
}

/**
 * Replace bare URLs and filesystem-looking paths with spaces.
 *
 * @param {string} line
 * @returns {string}
 */
function maskUrls(line) {
  return line
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, m => ' '.repeat(m.length))
    .replace(/\S*\/\S*\.\w+/g, m => ' '.repeat(m.length));
}

/**
 * Everything a prose rule should ignore: code spans, links, and URLs.
 *
 * @param {string} line
 * @returns {string}
 */
function maskProse(line) {
  return maskUrls(maskLinks(maskInlineCode(line)));
}

/**
 * Walk lines, yielding only those a prose rule should consider.
 *
 * Skips fenced code blocks, table rows (dense, and rewriting them tends to
 * break column counts), and HTML blocks.
 *
 * Frontmatter needs no handling: markdownlint strips it from `params.lines`
 * and exposes it separately as `params.frontMatterLines`. A leading `---` in
 * `lines` is therefore a thematic break, and skipping to the next `---` would
 * silently swallow real content.
 *
 * @param {string[]} lines
 * @param {{includeTables?: boolean, includeHeadings?: boolean}} [opts]
 * @yields {{line: string, index: number, isHeading: boolean}}
 */
function* proseLines(lines, opts = {}) {
  const { includeTables = false, includeHeadings = true } = opts;

  let inFence = false;
  let inHtml = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (/^\s*<(table|pre|script|style|div)\b/i.test(line)) inHtml = true;
    if (inHtml) {
      if (/<\/(table|pre|script|style|div)>/i.test(line)) inHtml = false;
      continue;
    }

    if (!includeTables && (TABLE_ROW.test(line) || SEPARATOR_ROW.test(line))) continue;

    const isHeading = ATX_HEADING.test(line);
    if (isHeading && !includeHeadings) continue;

    yield { line, index: i, isHeading };
  }
}

/**
 * Character offsets covered by existing emphasis runs, so a rule does not
 * italicise something that is already emphasised.
 *
 * @param {string} line
 * @returns {(pos: number) => boolean} True when the position sits inside emphasis
 */
function emphasisMask(line) {
  const spans = [];
  for (const m of line.matchAll(/(\*{1,3})(?!\s)(.+?)(?<!\s)\1/g)) {
    spans.push([m.index, m.index + m[0].length]);
  }
  return pos => spans.some(([a, b]) => pos >= a && pos < b);
}

module.exports = {
  TABLE_ROW,
  SEPARATOR_ROW,
  FENCE,
  LIST_ITEM,
  ATX_HEADING,
  maskInlineCode,
  maskLinks,
  maskUrls,
  maskProse,
  proseLines,
  emphasisMask,
};
