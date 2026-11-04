/**
 * Custom markdownlint rule: locale-units-spacing (DVW007)
 *
 * Spacing between a number and its unit, per locale.
 *
 * English:
 *   - code-style units are tight       ✅ 10px, 1.5rem, 24h, 200ms
 *   - measurement units take a NBSP    ✅ 10 kg, 5 % (U+00A0, never breaks)
 *
 * French (SI typography):
 *   - measurement units take a narrow NBSP (U+202F)   ✅ 10 kg, 5 %
 *   - `; : ! ? »` take a narrow NBSP before them      ✅ Attention : ceci
 *   - `«` takes one after
 *
 * Locale comes from frontmatter `lang:`, else a `.fr.md` filename suffix, else
 * English. The unit lists are deliberately conservative: single-letter units
 * (m, g, s, B, l, t) are excluded because `5 m` could be metres or minutes and
 * a linter must not guess.
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

const { proseLines, maskInlineCode, maskLinks, maskUrls } = require('./_shared.cjs');

const NBSP = ' ';
const NNBSP = ' ';

/** CSS, typographic, and short-time units written tight against the number. */
const TIGHT_UNITS = [
  'px', 'rem', 'em', 'ex', 'ch', 'vh', 'vw', 'vmin', 'vmax', 'pt', 'pc',
  'dpi', 'ppi', 'fps', 'ms', 'ns', 'µs',
  'h', 'min', 'sec', 'd', 'w', 'y',
];

/** Measurement units that take a non-breaking space. Multi-character only. */
const SPACED_UNITS = [
  '%', '°C', '°F', '°',
  'kg', 'mg', 'µg', 'lb', 'oz',
  'km', 'cm', 'mm', 'µm', 'nm', 'ft', 'in',
  'mL', 'ml', 'cL', 'cl', 'dL', 'dl',
  'Hz', 'kHz', 'MHz', 'GHz', 'THz',
  'kB', 'KB', 'MB', 'GB', 'TB', 'PB', 'KiB', 'MiB', 'GiB', 'TiB',
  'kbps', 'Mbps', 'Gbps',
  'kW', 'MW', 'kWh', 'mAh', 'mV', 'kV',
];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = list => list.slice().sort((a, b) => b.length - a.length).map(esc).join('|');

const TIGHT_RE = new RegExp(`(\\d)([   ]+)(${alt(TIGHT_UNITS)})\\b`, 'g');
const SPACED_RE = new RegExp(`(\\d)([   ]*)(${alt(SPACED_UNITS)})(?![\\w])`, 'g');

/** French punctuation that takes a narrow NBSP before it. */
const FR_PUNCT_AFTER = /([^\s\d])([   ]*)([;:!?»])(?=\s|$)/g;
/** French opening quote takes a narrow NBSP after it. */
const FR_PUNCT_BEFORE = /(«)([   ]*)(?=\S)/g;

/**
 * Resolve the document locale.
 *
 * markdownlint strips frontmatter out of `params.lines` and hands it over
 * separately as `params.frontMatterLines`, so `lang:` has to be read from
 * there — a rule that searches `params.lines` for it never finds it.
 *
 * @param {string[]} frontMatterLines
 * @param {string} name File path or markdownlint string key
 * @returns {'fr'|'en'}
 */
function detectLocale(frontMatterLines, name) {
  for (const line of frontMatterLines || []) {
    const m = line.match(/^lang\s*:\s*["']?([a-z]{2})/i);
    if (m) return m[1].toLowerCase() === 'fr' ? 'fr' : 'en';
  }
  return /\.fr\.mdx?$/i.test(String(name || '')) ? 'fr' : 'en';
}

module.exports = {
  names: ['locale-units-spacing', 'DVW007'],
  description: 'Number-to-unit spacing must follow the document locale',
  tags: ['whitespace', 'style', 'i18n'],
  parser: 'none',
  function: function rule(params, onError) {
    const locale = detectLocale(params.frontMatterLines, params.name);
    const gap = locale === 'fr' ? NNBSP : NBSP;

    for (const { line, index } of proseLines(params.lines, { includeTables: true })) {
      const searchable = maskUrls(maskLinks(maskInlineCode(line)));
      const edits = [];

      // Code-style units: strip the gap entirely
      for (const m of searchable.matchAll(TIGHT_RE)) {
        edits.push({
          start: m.index,
          end: m.index + m[0].length,
          text: `${m[1]}${m[3]}`,
          detail: `${m[3]} is a code unit — no space: ${m[0].trim()} → ${m[1]}${m[3]}`,
        });
      }

      // Measurement units: exactly one non-breaking space
      for (const m of searchable.matchAll(SPACED_RE)) {
        if (m[2] === gap) continue; // already correct
        edits.push({
          start: m.index,
          end: m.index + m[0].length,
          text: `${m[1]}${gap}${m[3]}`,
          detail:
            locale === 'fr'
              ? `French typography: narrow non-breaking space before ${m[3]}`
              : `Measurement unit takes a non-breaking space before ${m[3]}`,
        });
      }

      if (locale === 'fr') {
        for (const m of searchable.matchAll(FR_PUNCT_AFTER)) {
          if (m[2] === NNBSP) continue;
          edits.push({
            start: m.index,
            end: m.index + m[0].length,
            text: `${m[1]}${NNBSP}${m[3]}`,
            detail: `French typography: narrow non-breaking space before ${m[3]}`,
          });
        }
        for (const m of searchable.matchAll(FR_PUNCT_BEFORE)) {
          if (m[2] === NNBSP) continue;
          edits.push({
            start: m.index,
            end: m.index + m[0].length,
            text: `«${NNBSP}`,
            detail: 'French typography: narrow non-breaking space after «',
          });
        }
      }

      // Right-to-left, dropping overlaps so offsets stay valid
      edits.sort((a, b) => b.start - a.start);
      let lastStart = Infinity;
      for (const edit of edits) {
        if (edit.end > lastStart) continue;
        lastStart = edit.start;
        onError({
          lineNumber: index + 1,
          detail: edit.detail,
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
