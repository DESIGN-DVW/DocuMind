#!/usr/bin/env node

/**
 * Normalise `documents.path` to one form: absolute.
 *
 * The column was stored inconsistently. At the time of writing: 5,351 rows
 * absolute and continuously re-scanned, against 8,162 rows repo-relative whose
 * `last_scanned` all fall inside a single 14-second window on 2025-11-07 — the
 * original v1 import, never refreshed since.
 *
 * They were never refreshed because the repos they belong to were unreachable:
 * FigmailAPP, @figma-core and @figma-docs live one level down under FigmaAPI/,
 * and `discoverRepos()` only looked one level deep (DISPATCH-150). So those
 * repos were invisible to every scan, their 2025 rows went stale, and the
 * obsolescence detector has been flagging them ever since — 6,329 of the 8,423
 * active signals sit on these legacy rows.
 *
 * Absolute is the canonical form because it is what the code already assumes:
 * every writer stores the path it just read from disk, `graph/relations.mjs`
 * resolves sibling links with `path.dirname`/`path.resolve`, and the archive
 * route feeds the value straight to `path.relative`.
 *
 * Rows are converted rather than deleted, so the index is preserved. Where a
 * relative row's absolute form already exists as another row the two are
 * duplicates of one file; the relative one is dropped, because the absolute
 * twin is the freshly-scanned copy. `path` is UNIQUE, so a blind UPDATE would
 * fail on exactly those.
 *
 * `obsolescence_signals.document_id` is ON DELETE CASCADE with foreign_keys=1,
 * so dropping a duplicate takes its stale signals with it.
 *
 * Dry run is the default. Nothing is written without `--apply`.
 *
 * Usage:
 *   node scripts/db/normalise-document-paths.mjs [--apply] [--json]
 *
 * @module scripts/db/normalise-document-paths
 */

import fs from 'fs';
import path from 'path';
import ignore from 'ignore';
import Database from 'better-sqlite3';
import { DB_PATH } from '../../config/env.mjs';
import { loadProfile } from '../../context/loader.mjs';

const apply = process.argv.includes('--apply');
const asJson = process.argv.includes('--json');

const ctx = await loadProfile();
/** @type {Map<string,string>} repo name -> absolute root */
const roots = new Map(ctx.repoRoots.map(r => [r.name, r.path]));

// The same ignore set orchestrator.mjs applies when scanning, so a row this
// migration keeps is a row a future scan would actually refresh.
const SCAN_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.claude/worktrees/**',
  ...(ctx.scanIgnore ?? []),
];
const ignored = ignore().add(SCAN_IGNORE);

const db = new Database(DB_PATH);
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON'); // required for the CASCADE below

const relRows = db
  .prepare(`SELECT id, repository, path FROM documents WHERE path NOT LIKE '/%'`)
  .all();
const absPaths = new Set(
  db
    .prepare(`SELECT path FROM documents WHERE path LIKE '/%'`)
    .all()
    .map(r => r.path)
);

const convert = [];
const dropDuplicate = [];
const prune = [];
const unresolved = [];
let missingOnDisk = 0;

for (const row of relRows) {
  const root = roots.get(row.repository);
  if (!root) {
    // Repo not in the current profile — leave the row alone rather than guess.
    unresolved.push(row);
    continue;
  }
  // A path the scanner ignores will never be refreshed, so converting it would
  // make a dead 2025 row permanent. 7,380 of these are node_modules READMEs
  // from the legacy import; the live scanner has never produced one.
  if (ignored.ignores(row.path)) {
    prune.push({ ...row, abs: path.join(root, row.path) });
    continue;
  }
  const abs = path.join(root, row.path);
  if (absPaths.has(abs)) dropDuplicate.push({ ...row, abs });
  else {
    convert.push({ ...row, abs });
    if (!fs.existsSync(abs)) missingOnDisk++;
  }
}

const summary = {
  dry_run: !apply,
  relative_rows: relRows.length,
  to_convert: convert.length,
  to_drop_as_duplicate: dropDuplicate.length,
  to_prune_as_scan_ignored: prune.length,
  unresolved_repository: unresolved.length,
  converted_but_missing_on_disk: missingOnDisk,
};

if (!asJson) {
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — normalise documents.path to absolute\n`);
  console.log(`  relative rows found            ${relRows.length}`);
  console.log(`  → convert to absolute          ${convert.length}`);
  console.log(`  → drop (absolute twin exists)  ${dropDuplicate.length}`);
  console.log(`  → prune (scanner ignores path)  ${prune.length}`);
  console.log(`  → skip (repo not in profile)   ${unresolved.length}`);
  console.log(`  of the converted, missing file ${missingOnDisk}`);
  if (unresolved.length) {
    const repos = [...new Set(unresolved.map(r => r.repository))];
    console.log(`\n  unresolved repositories: ${repos.join(', ')}`);
  }
  console.log('\n  sample conversions:');
  for (const r of convert.slice(0, 5))
    console.log(`    #${r.id}  ${r.repository}: ${r.path}\n           -> ${r.abs}`);
  if (dropDuplicate.length) {
    console.log('\n  sample duplicates to drop:');
    for (const r of dropDuplicate.slice(0, 5))
      console.log(`    #${r.id}  ${r.repository}/${r.path}`);
  }
}

if (!apply) {
  if (asJson) console.log(JSON.stringify(summary, null, 2));
  else console.log(`\nNothing written. Re-run with --apply.`);
  db.close();
  process.exit(0);
}

const update = db.prepare('UPDATE documents SET path = ? WHERE id = ?');
const remove = db.prepare('DELETE FROM documents WHERE id = ?');
const signalsBefore = db.prepare('SELECT COUNT(*) n FROM obsolescence_signals').get().n;

const run = db.transaction(() => {
  for (const r of dropDuplicate) remove.run(r.id); // CASCADE removes its signals
  for (const r of prune) remove.run(r.id);
  for (const r of convert) update.run(r.abs, r.id);
});
run();

const signalsAfter = db.prepare('SELECT COUNT(*) n FROM obsolescence_signals').get().n;
const left = db.prepare(`SELECT COUNT(*) n FROM documents WHERE path NOT LIKE '/%'`).get().n;

summary.signals_removed_by_cascade = signalsBefore - signalsAfter;
summary.relative_rows_remaining = left;

if (asJson) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(
    `\n✓ converted ${convert.length}, dropped ${dropDuplicate.length}, pruned ${prune.length}`
  );
  console.log(`✓ signals removed by cascade: ${signalsBefore - signalsAfter}`);
  console.log(`✓ relative rows remaining: ${left}${left ? ' (unresolved repositories)' : ''}`);
}
db.close();
