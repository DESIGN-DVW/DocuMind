#!/usr/bin/env node

/**
 * Obsolescence signal admin — archive, dismiss, or delete signals in bulk.
 *
 * Replaces the dashboard's Archive/Delete buttons, which could never work: the
 * REST routes sit behind the API bearer token and a static page has nowhere to
 * hold one. This talks to SQLite directly, the same way `curate_diagram` does,
 * so it needs no token and no running daemon.
 *
 * Semantics mirror `daemon/server.mjs` exactly:
 *   archive  → sets `archived_at` (soft, permanent suppression) + action_log
 *   dismiss  → sets `dismissed_until` (temporary, resurfaces after the date)
 *   delete   → removes the row (it may resurface on the next detector run)
 *
 * Two deliberate differences from the routes, both noted in --help:
 *   - `.gitignore` appending is opt-in (`--gitignore`). The single-signal route
 *     always appends; doing that for a bulk selection would add thousands of
 *     lines across repos, which is not a thing to do by accident.
 *   - `delete` writes an action_log entry. The route does not, so a deletion
 *     left no trace at all.
 *
 * Dry-run is the default. Nothing is written without `--apply`.
 *
 * Usage:
 *   node scripts/obsolete-admin.mjs <archive|dismiss|delete> [selectors] [--apply]
 *
 *   Selectors (at least one required — there is no "everything" shorthand):
 *     --id 1,2,3          explicit signal ids
 *     --repo NAME         one repository
 *     --path-like TEXT    documents whose stored path contains TEXT
 *     --flag LABEL        redundant | stale | needs-update | obsolete
 *     --min-age DAYS      age_days >= DAYS
 *     --max-confidence N  confidence_score <= N
 *     --limit N           cap the selection (applied last, oldest first)
 *
 *   Options:
 *     --apply             actually write (default: dry run)
 *     --gitignore         archive only: also append paths to each repo's .gitignore
 *     --until DATE        dismiss only: ISO date to dismiss until (default +90d)
 *     --json              machine-readable output
 *
 * @module scripts/obsolete-admin
 */

import fs from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';
import { DB_PATH, REPOS_DIR } from '../config/env.mjs';
import { loadProfile } from '../context/loader.mjs';

const ACTIONS = new Set(['archive', 'dismiss', 'delete']);

/**
 * Parse argv into an action, selectors and flags.
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const action = argv[0];
  const opts = { apply: false, gitignore: false, json: false };
  const sel = {};

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--apply':
        opts.apply = true;
        break;
      case '--gitignore':
        opts.gitignore = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--id':
        sel.ids = next()
          .split(',')
          .map(s => Number(s.trim()))
          .filter(Number.isInteger);
        break;
      case '--repo':
        sel.repo = next();
        break;
      case '--path-like':
        sel.pathLike = next();
        break;
      case '--flag':
        sel.flag = next();
        break;
      case '--min-age':
        sel.minAge = Number(next());
        break;
      case '--max-confidence':
        sel.maxConfidence = Number(next());
        break;
      case '--limit':
        sel.limit = Number(next());
        break;
      case '--until':
        opts.until = next();
        break;
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  return { action, sel, opts };
}

/**
 * Build the WHERE clause for a selection. Always excludes already-archived
 * signals, so re-running is idempotent rather than re-stamping archived_at.
 *
 * @param {object} sel
 * @returns {{ where: string, params: any[] }}
 */
function buildWhere(sel) {
  const clauses = ['obs.archived_at IS NULL'];
  const params = [];

  if (sel.ids?.length) {
    clauses.push(`obs.id IN (${sel.ids.map(() => '?').join(',')})`);
    params.push(...sel.ids);
  }
  if (sel.repo) {
    clauses.push('d.repository = ?');
    params.push(sel.repo);
  }
  if (sel.pathLike) {
    clauses.push('d.path LIKE ?');
    params.push(`%${sel.pathLike}%`);
  }
  if (sel.flag) {
    clauses.push('obs.flag_label = ?');
    params.push(sel.flag);
  }
  if (Number.isFinite(sel.minAge)) {
    clauses.push('obs.age_days >= ?');
    params.push(sel.minAge);
  }
  if (Number.isFinite(sel.maxConfidence)) {
    clauses.push('obs.confidence_score <= ?');
    params.push(sel.maxConfidence);
  }
  return { where: clauses.join(' AND '), params };
}

/**
 * `documents.path` is stored inconsistently — 4,248 rows absolute, 8,162
 * repo-relative at the time of writing. Both forms must be handled.
 *
 * A bare filename is also ambiguous: one repo can hold many README.md, and
 * those are genuinely separate documents, not duplicate signals.
 *
 * @param {string} p   stored path, absolute or repo-relative
 * @param {string} repo
 * @returns {string} display path, always prefixed by the repository
 */
const rel = (p, repo) => {
  if (REPOS_DIR && p.startsWith(REPOS_DIR)) return p.slice(REPOS_DIR.length + 1);
  return path.isAbsolute(p) ? p : `${repo}/${p}`;
};

/**
 * Absolute path on disk for a stored document path.
 *
 * The `/obsolete/:id/archive` route does `path.relative(repoRoot, signal.path)`
 * unconditionally. For the repo-relative majority that resolves the second
 * argument against process.cwd() and yields a `../../..` path, so the entry it
 * appends to .gitignore is wrong. Resolve against the repo root instead.
 *
 * @param {string} repoRoot
 * @param {string} p
 * @returns {string}
 */
const abs = (repoRoot, p) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    console.log(
      'Usage: node scripts/obsolete-admin.mjs <archive|dismiss|delete> [selectors] [--apply]\n' +
        '  See the module header for the full option list. Dry run unless --apply.'
    );
    return;
  }

  const { action, sel, opts } = parseArgs(argv);

  if (!ACTIONS.has(action)) {
    throw new Error(`First argument must be one of: ${[...ACTIONS].join(', ')}`);
  }
  // Refuse an unbounded selection — a bare `delete --apply` must not be possible.
  if (
    !sel.ids?.length &&
    !sel.repo &&
    !sel.pathLike &&
    !sel.flag &&
    !Number.isFinite(sel.minAge) &&
    !Number.isFinite(sel.maxConfidence)
  ) {
    throw new Error(
      'At least one selector is required (--id, --repo, --path-like, --flag, --min-age, --max-confidence).'
    );
  }
  if (opts.gitignore && action !== 'archive') {
    throw new Error('--gitignore applies to archive only.');
  }

  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 5000'); // the daemon holds the same WAL database

  const { where, params } = buildWhere(sel);
  const limit = Number.isFinite(sel.limit) ? ` LIMIT ${sel.limit}` : '';
  const rows = db
    .prepare(
      `SELECT obs.id, obs.flag_label, obs.age_days, obs.confidence_score,
              d.path, d.repository, d.filename
         FROM obsolescence_signals obs
         JOIN documents d ON obs.document_id = d.id
        WHERE ${where}
        ORDER BY obs.age_days DESC${limit}`
    )
    .all(...params);

  const summary = {
    action,
    dry_run: !opts.apply,
    selected: rows.length,
    by_repo: {},
    by_flag: {},
    gitignore: opts.gitignore,
  };
  for (const r of rows) {
    summary.by_repo[r.repository] = (summary.by_repo[r.repository] ?? 0) + 1;
    summary.by_flag[r.flag_label] = (summary.by_flag[r.flag_label] ?? 0) + 1;
  }

  if (!opts.json) {
    console.log(
      `${opts.apply ? 'APPLY' : 'DRY RUN'} — ${action}: ${rows.length} signal(s) selected`
    );
    if (rows.length) {
      console.log('\nBy repository:');
      for (const [k, v] of Object.entries(summary.by_repo).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(v).padStart(5)}  ${k}`);
      }
      console.log('\nBy flag:');
      for (const [k, v] of Object.entries(summary.by_flag).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(v).padStart(5)}  ${k}`);
      }
      console.log('\nOldest 10 of the selection:');
      for (const r of rows.slice(0, 10)) {
        console.log(
          `  #${String(r.id).padStart(5)}  ${String(r.age_days).padStart(4)}d  ${r.flag_label.padEnd(13)} ${rel(r.path, r.repository)}`
        );
      }
    }
  }

  if (!opts.apply) {
    if (opts.json) console.log(JSON.stringify(summary, null, 2));
    else
      console.log(
        `\nNothing written. Re-run with --apply to ${action} these ${rows.length} signal(s).`
      );
    db.close();
    return;
  }

  // ---- apply ----
  const now = new Date().toISOString();
  const until = opts.until ?? new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);

  const log = db.prepare(
    `INSERT INTO action_log (action, target_id, target_path, target_repo, actor, performed_at)
     VALUES (?, ?, ?, ?, 'obsolete-admin', ?)`
  );

  const stmt =
    action === 'archive'
      ? db.prepare('UPDATE obsolescence_signals SET archived_at = ? WHERE id = ?')
      : action === 'dismiss'
        ? db.prepare('UPDATE obsolescence_signals SET dismissed_until = ? WHERE id = ?')
        : db.prepare('DELETE FROM obsolescence_signals WHERE id = ?');

  const run = db.transaction(list => {
    let changed = 0;
    for (const r of list) {
      const result =
        action === 'delete' ? stmt.run(r.id) : stmt.run(action === 'archive' ? now : until, r.id);
      changed += result.changes;
      // The single-signal route logs archives only; log every action so a
      // deletion is not untraceable.
      log.run(action, r.id, r.path, r.repository, now);
    }
    return changed;
  });
  const changed = run(rows);

  let gitignored = 0;
  if (opts.gitignore) {
    const ctx = await loadProfile();
    const byRepo = new Map();
    for (const r of rows) {
      if (!byRepo.has(r.repository)) byRepo.set(r.repository, []);
      byRepo.get(r.repository).push(r.path);
    }
    for (const [repo, paths] of byRepo) {
      const root = ctx.repoRoots.find(x => x.name === repo)?.path;
      if (!root) continue;
      const giPath = path.join(root, '.gitignore');
      let existing = '';
      try {
        existing = await fs.readFile(giPath, 'utf-8');
      } catch {
        /* create new */
      }
      const have = new Set(existing.split('\n').map(l => l.trim()));
      const add = paths
        .map(p => path.relative(root, abs(root, p)))
        .filter(p => p && !p.startsWith('..') && !have.has(p));
      if (add.length) {
        await fs.appendFile(giPath, `\n# Archived by DocuMind (${now})\n${add.join('\n')}\n`);
        gitignored += add.length;
      }
    }
  }

  summary.changed = changed;
  summary.gitignore_entries_added = gitignored;
  if (opts.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`\n✓ ${action}: ${changed} row(s) changed, ${rows.length} logged to action_log.`);
    if (opts.gitignore) console.log(`✓ .gitignore: ${gitignored} path(s) appended.`);
  }
  db.close();
}

main().catch(err => {
  console.error(`[obsolete-admin] ${err.message}`);
  process.exitCode = 1;
});
