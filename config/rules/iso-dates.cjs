/**
 * Custom markdownlint rule: iso-dates (DVW004)
 *
 * Dates are ISO 8601 (`2026-07-28`) and times are 24-hour. One format across
 * EN and FR documents, sortable as text, and free of the DD/MM versus MM/DD
 * ambiguity that makes a mixed corpus unreadable.
 *
 * ✅ 2026-07-28, 14:30
 * ❌ July 28, 2026 · 28 July 2026 · 2026/07/28 · 2:30 PM
 *
 * Auto-fixes only what it can read unambiguously:
 *   - month-name forms in English and French
 *   - `YYYY/MM/DD` and `YYYY.MM.DD`
 *   - 12-hour times with an am/pm marker
 *
 * Numeric slash forms like `03/04/2026` are reported but never fixed — the
 * rule has no way to know whether that is March or April, and guessing would
 * silently corrupt dates.
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

const { proseLines, maskProse } = require('./_shared.cjs');

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};

const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

/** `July 28, 2026` / `Jul 28 2026` */
const MONTH_FIRST = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi');

/** `28 July 2026` / `1er janvier 2026` */
const DAY_FIRST = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|er|ème)?\\s+(${MONTH_NAMES})\\.?,?\\s+(\\d{4})\\b`, 'gi');

/** `2026/07/28` or `2026.07.28` — year first, so the order is unambiguous */
const YEAR_FIRST_SEP = /\b(\d{4})[/.](\d{1,2})[/.](\d{1,2})\b/g;

/** `03/04/2026`, `3-4-26` — order unknowable */
const AMBIGUOUS_NUMERIC = /\b(\d{1,2})[/](\d{1,2})[/](\d{2,4})\b/g;

/** `2:30 PM`, `2.30pm` */
const TWELVE_HOUR = /\b(\d{1,2})[:.](\d{2})\s*([ap])\.?m\.?\b/gi;

const pad = n => String(n).padStart(2, '0');

/** Reject impossible dates so version strings and ratios are left alone. */
const validDate = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1000 && y <= 9999;

module.exports = {
  names: ['iso-dates', 'DVW004'],
  description: 'Dates must be ISO 8601 (YYYY-MM-DD) and times 24-hour',
  tags: ['dates', 'style'],
  parser: 'none',
  function: function rule(params, onError) {
    for (const { line, index } of proseLines(params.lines, { includeTables: true })) {
      // Code spans, links, and URLs carry dates that are identifiers, not prose
      const searchable = maskProse(line);

      const report = (match, replacement, detail) => {
        onError({
          lineNumber: index + 1,
          detail,
          range: [match.index + 1, match[0].length],
          ...(replacement != null && {
            fixInfo: {
              lineNumber: index + 1,
              editColumn: match.index + 1,
              deleteCount: match[0].length,
              insertText: replacement,
            },
          }),
        });
      };

      for (const m of searchable.matchAll(MONTH_FIRST)) {
        const month = MONTHS[m[1].toLowerCase()];
        const day = Number(m[2]);
        const year = Number(m[3]);
        if (!validDate(year, month, day)) continue;
        report(m, `${year}-${pad(month)}-${pad(day)}`, `Use ISO 8601: ${m[0]} → ${year}-${pad(month)}-${pad(day)}`);
      }

      for (const m of searchable.matchAll(DAY_FIRST)) {
        const day = Number(m[1]);
        const month = MONTHS[m[2].toLowerCase()];
        const year = Number(m[3]);
        if (!validDate(year, month, day)) continue;
        report(m, `${year}-${pad(month)}-${pad(day)}`, `Use ISO 8601: ${m[0]} → ${year}-${pad(month)}-${pad(day)}`);
      }

      for (const m of searchable.matchAll(YEAR_FIRST_SEP)) {
        const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
        if (!validDate(year, month, day)) continue;
        report(m, `${year}-${pad(month)}-${pad(day)}`, `Use hyphens in ISO dates: ${m[0]} → ${year}-${pad(month)}-${pad(day)}`);
      }

      for (const m of searchable.matchAll(AMBIGUOUS_NUMERIC)) {
        const [a, b] = [Number(m[1]), Number(m[2])];
        if (a > 31 || b > 31 || a < 1 || b < 1) continue;
        // If neither number can be a month this is a ratio or a path, not a date
        if (a > 12 && b > 12) continue;
        report(
          m,
          null,
          `Ambiguous date "${m[0]}" — cannot tell day from month. Rewrite as YYYY-MM-DD by hand`
        );
      }

      for (const m of searchable.matchAll(TWELVE_HOUR)) {
        let hour = Number(m[1]);
        const minute = Number(m[2]);
        if (hour < 1 || hour > 12 || minute > 59) continue;
        const pm = m[3].toLowerCase() === 'p';
        if (hour === 12) hour = 0;
        if (pm) hour += 12;
        report(m, `${pad(hour)}:${pad(minute)}`, `Use 24-hour time: ${m[0]} → ${pad(hour)}:${pad(minute)}`);
      }
    }
  },
};
