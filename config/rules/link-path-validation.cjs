/**
 * Custom markdownlint rule: link-path-validation (DVW009)
 *
 * Relative links must resolve on disk, and `#fragment` links must name a real
 * heading. External URLs are markdown-link-check's job — this rule never makes
 * a network request, so it is safe to run on every save.
 *
 * ✅ [the brief](./MARKDOWN-STYLE-BRIEF.md#locale-policy)
 * ❌ [the brief](./MARKDOWN-STYLE-BREIF.md)      — file does not exist
 * ❌ [locale](./MARKDOWN-STYLE-BRIEF.md#locale)  — no such heading
 * ❌ [config](/config/.markdownlint.json)        — root-relative is ambiguous
 *
 * Resolution is shared with the rest of DocuMind via
 * processors/link-resolver.cjs, so the linter, the validators, and the graph
 * builder agree on what a link points at.
 *
 * Detect only. A broken link needs a human to decide whether the target moved,
 * was renamed, or was never written.
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

const fs = require('node:fs');
const path = require('node:path');
const { FENCE } = require('./_shared.cjs');

// The resolver lives in processors/ because the validators and the graph
// builder use it too. In a repo that received only the rules, it may be
// absent — degrade this one rule to a no-op rather than throwing at registry
// load and taking every other DVW rule down with it.
let resolver = null;
try {
  resolver = require('../../processors/link-resolver.cjs');
} catch {
  process.stderr.write(
    '[DVW009] processors/link-resolver.cjs not found — link validation disabled in this repo\n'
  );
}

/** Inline links and images, with the `!` captured so images can be labelled. */
const INLINE_LINK = /(!?)\[([^\]]*)\]\(([^)]*)\)/g;

/** Cache heading slugs per resolved target — a doc often links to the same file repeatedly. */
const slugCache = new Map();

function slugsFor(filePath) {
  if (slugCache.has(filePath)) return slugCache.get(filePath);
  let slugs = null;
  try {
    slugs = resolver.headingSlugs(fs.readFileSync(filePath, 'utf8'));
  } catch {
    slugs = null; // unreadable or binary: existence alone is enough
  }
  slugCache.set(filePath, slugs);
  return slugs;
}

module.exports = {
  names: ['link-path-validation', 'DVW009'],
  description: 'Relative links must resolve and fragments must name a real heading',
  tags: ['links'],
  parser: 'none',
  function: function rule(params, onError) {
    if (!resolver) return;

    const name = String(params.name || '');
    // Without a real path there is nothing to resolve against
    if (!name || !path.isAbsolute(name)) return;

    const fileDir = path.dirname(name);
    const lines = params.lines;
    const ownSlugs = resolver.headingSlugs(lines.join('\n'));

    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
      if (FENCE.test(lines[i])) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      // Blank out code spans so a documented example is not treated as a link
      const line = lines[i].replace(/`+[^`]*`+/g, m => ' '.repeat(m.length));

      for (const m of line.matchAll(INLINE_LINK)) {
        const target = m[3];
        const column = m.index + 1;
        const link = resolver.resolveLink(target, fileDir);

        const report = detail =>
          onError({ lineNumber: i + 1, detail, range: [column, m[0].length] });

        if (link.kind === 'empty') {
          report('Link has no target');
          continue;
        }

        if (link.kind === 'root-relative') {
          // An absolute filesystem path that resolves is a working link, even
          // if it is not portable. Only report the ones that go nowhere.
          if (!link.exists) {
            report(
              `Leading-slash link "${link.filePart}" resolves to nothing — it is neither an existing absolute path nor relative to this file`
            );
          }
          continue;
        }

        if (link.kind === 'anchor') {
          if (link.fragment && !ownSlugs.has(resolver.slugify(link.fragment))) {
            report(`No heading in this document matches "#${link.fragment}"`);
          }
          continue;
        }

        if (link.kind !== 'relative') continue; // external, mailto:, etc.

        if (!link.exists) {
          report(`Link target does not exist: ${link.filePart}`);
          continue;
        }

        if (!link.fragment) continue;

        const slugs = slugsFor(link.resolvedPath);
        if (slugs && !slugs.has(resolver.slugify(link.fragment))) {
          report(`No heading in ${link.filePart} matches "#${link.fragment}"`);
        }
      }
    }
  },
};
