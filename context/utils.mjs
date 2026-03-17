/**
 * DocuMind v3.0 — Shared Context Utilities
 *
 * Utility functions shared across daemon/server.mjs and daemon/watcher.mjs.
 * All functions are pure and have no side effects.
 *
 * @module context/utils
 */

/**
 * Compute the longest common directory prefix from an array of absolute paths.
 * Returns '' if paths is empty.
 *
 * @example
 * commonDir(['/a/b/c/d', '/a/b/c/e', '/a/b/f']) // => '/a/b'
 * commonDir([]) // => ''
 * commonDir(['/Users/Shared/htdocs/github/DVWDesign/DocuMind',
 *            '/Users/Shared/htdocs/github/DVWDesign/Foo'])
 * // => '/Users/Shared/htdocs/github/DVWDesign'
 *
 * @param {string[]} paths - Array of absolute filesystem paths
 * @returns {string} The longest common ancestor directory, or '' if empty
 */
export function commonDir(paths) {
  if (!paths.length) return '';
  const parts = paths[0].split('/');
  let common = '';
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(0, i + 1).join('/');
    if (paths.every(p => p.startsWith(candidate + '/'))) common = candidate;
    else break;
  }
  return common;
}
