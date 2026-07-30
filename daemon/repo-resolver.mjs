/**
 * Repository name resolution for MCP tools.
 *
 * The `repository` column has no COLLATE clause, so SQL `repository = ?` is
 * exact and case-sensitive: a mistyped or wrong-cased repo (e.g. "FigmailApp"
 * vs the real "FigmailAPP") silently matched zero rows with no explanation.
 * These helpers make repo arguments forgiving and, when a name really is
 * unknown, produce an actionable "did you mean" error instead of an empty set.
 *
 * @module daemon/repo-resolver
 */

/**
 * Lists indexed repository names with their document counts.
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<{repository: string, documents: number}>}
 */
export function listRepositories(db) {
  return db
    .prepare(
      `SELECT repository, COUNT(*) AS documents
         FROM documents
        WHERE repository IS NOT NULL AND repository != ''
        GROUP BY repository
        ORDER BY documents DESC, repository ASC`
    )
    .all();
}

const normalizeRepoName = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Case-insensitive similarity used only to suggest alternatives for a typo.
 * Returns a 0..1 score based on a normalized (lowercased, punctuation-stripped)
 * comparison, so "figmailapp" ~ "FigmailAPP" and "root-dispatcher" ~ "RootDispatcher".
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function repoNameScore(a, b) {
  const x = normalizeRepoName(a);
  const y = normalizeRepoName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (y.startsWith(x) || x.startsWith(y)) return 0.9;
  if (y.includes(x) || x.includes(y)) return 0.8;

  // Levenshtein distance → similarity ratio
  const rows = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 0; j <= y.length; j++) rows[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)
      );
    }
  }
  return 1 - rows[x.length][y.length] / Math.max(x.length, y.length);
}

/**
 * Resolves a user-supplied repository name to its canonical indexed spelling.
 *
 * Falsy input resolves to `{ ok: true, repository: null }` (meaning "all repos"),
 * matching the optional-`repo` semantics of most tools.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string|null|undefined} input
 * @returns {{ ok: true, repository: string|null, corrected?: string }
 *          | { ok: false, error: string, suggestions: string[], available: string[] }}
 */
export function resolveRepository(db, input) {
  if (!input) return { ok: true, repository: null };

  const repos = listRepositories(db).map(r => r.repository);
  const exact = repos.find(r => r === input);
  if (exact) return { ok: true, repository: exact };

  // Case-insensitive / punctuation-insensitive match → accept but report
  const relaxed = repos.find(r => normalizeRepoName(r) === normalizeRepoName(input));
  if (relaxed) return { ok: true, repository: relaxed, corrected: relaxed };

  const suggestions = repos
    .map(r => ({ r, score: repoNameScore(input, r) }))
    .filter(s => s.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.r);

  return {
    ok: false,
    error: suggestions.length
      ? `Unknown repository "${input}". Did you mean: ${suggestions.join(', ')}?`
      : `Unknown repository "${input}". Use the list_repos tool to see indexed repositories.`,
    suggestions,
    available: repos,
  };
}

/**
 * Standard MCP error payload for an unresolvable repository name.
 * @param {{error: string, suggestions: string[], available: string[]}} resolution
 * @returns {object}
 */
export function repoError(resolution) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: resolution.error,
          suggestions: resolution.suggestions,
          available_repositories: resolution.available,
        }),
      },
    ],
    isError: true,
  };
}
