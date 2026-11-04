/**
 * Link resolver — one place that decides what a markdown link points at.
 *
 * DocuMind had three separate link checkers that disagreed with each other:
 * `validateInternalLinks` in scripts/fix-custom-errors.mjs stripped fragments,
 * the `file-system-check` validator in scripts/validate-custom-errors.mjs did
 * not (so every `./doc.md#section` link read as broken), and the graph edge
 * builder in graph/relations.mjs matched `.md` targets only. This module is the
 * shared answer; callers classify first and decide policy second.
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

const { existsSync } = require('node:fs');
const path = require('node:path');

/** Non-file URI schemes that are never filesystem paths. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * What a link target refers to.
 *
 * - `external`   — http/https URL
 * - `scheme`     — mailto:, tel:, vscode:, etc.
 * - `anchor`     — same-document fragment (`#section`)
 * - `relative`   — path relative to the containing file
 * - `root-relative` — starts with `/`; ambiguous in markdown (filesystem root
 *   or site root?) so it is reported rather than resolved
 * - `empty`      — `[text]()`
 *
 * @typedef {'external'|'scheme'|'anchor'|'relative'|'root-relative'|'empty'} LinkKind
 */

/**
 * Classify and resolve a markdown link target.
 *
 * @param {string} target Raw link destination, e.g. `./docs/x.md#intro`
 * @param {string} fileDir Directory of the file containing the link
 * @returns {{kind: LinkKind, target: string, filePart: string, fragment: string|null,
 *   resolvedPath: string|null, exists: boolean|null}}
 *   `exists` is null when existence is not a meaningful question for the kind.
 */
function resolveLink(target, fileDir) {
  const raw = String(target || '').trim();

  // Strip an optional markdown link title: (path "Title")
  const withoutTitle = raw.replace(/\s+["'(].*$/, '');
  // Angle-bracket form: (<path with spaces>)
  const clean = withoutTitle.replace(/^<(.*)>$/, '$1');

  if (clean === '') {
    return base('empty', clean, '', null, null, null);
  }
  if (/^https?:\/\//i.test(clean)) {
    return base('external', clean, clean, null, null, null);
  }
  if (clean.startsWith('#')) {
    return base('anchor', clean, '', decodeURIComponent(clean.slice(1)), null, null);
  }
  if (SCHEME.test(clean)) {
    return base('scheme', clean, clean, null, null, null);
  }

  const hashAt = clean.indexOf('#');
  const filePart = hashAt === -1 ? clean : clean.slice(0, hashAt);
  const fragment = hashAt === -1 ? null : decodeURIComponent(clean.slice(hashAt + 1));

  if (filePart.startsWith('/')) {
    // Ambiguous: either an absolute filesystem path or a site-root-relative
    // URL. Resolve it as a filesystem path — if it exists, that is what it is.
    // If it does not, the caller has a genuinely unresolvable link.
    const abs = decodeURIComponent(filePart);
    return base('root-relative', clean, filePart, fragment, abs, existsSync(abs));
  }

  const resolvedPath = path.resolve(fileDir, decodeURIComponent(filePart));
  return base('relative', clean, filePart, fragment, resolvedPath, existsSync(resolvedPath));
}

function base(kind, target, filePart, fragment, resolvedPath, exists) {
  return { kind, target, filePart, fragment, resolvedPath, exists };
}

/**
 * GitHub-style heading anchor slugs for a markdown document.
 *
 * Lowercase, strip anything that is not a word character, space, or hyphen,
 * then spaces to hyphens. Duplicate slugs get the `-1`, `-2` suffixes GitHub
 * applies. Headings inside fenced code blocks are ignored.
 *
 * @param {string} content
 * @returns {Set<string>}
 */
function headingSlugs(content) {
  const slugs = new Set();
  const seen = new Map();
  let inFence = false;

  for (const line of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!heading) continue;

    const slug = slugify(heading[2]);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    slugs.add(count === 0 ? slug : `${slug}-${count}`);
  }

  return slugs;
}

/**
 * Convert heading text to a GitHub anchor slug.
 *
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return text
    .replace(/`([^`]*)`/g, '$1') // inline code contributes its content
    .replace(/[*_~]/g, '') // emphasis markers drop out
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links contribute their text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Matches inline markdown links, skipping image syntax via the leading `!` guard. */
const INLINE_LINK = /(!?)\[([^\]]*)\]\(([^)]*)\)/g;

/**
 * Extract every inline link from markdown, ignoring fenced and inline code.
 *
 * @param {string} content
 * @returns {{text: string, target: string, line: number, isImage: boolean}[]}
 */
function extractLinks(content) {
  const links = [];
  const lines = content.split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Blank out inline code so `[not](a-link)` in a code span is ignored
    const line = lines[i].replace(/`[^`]*`/g, m => ' '.repeat(m.length));

    for (const m of line.matchAll(INLINE_LINK)) {
      links.push({
        text: m[2],
        target: m[3],
        line: i + 1,
        isImage: m[1] === '!',
      });
    }
  }

  return links;
}

module.exports = {
  resolveLink,
  headingSlugs,
  slugify,
  extractLinks,
  INLINE_LINK,
};
