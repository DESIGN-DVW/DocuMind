#!/usr/bin/env node

/**
 * Backfill classifications for all documents that have a NULL classification.
 *
 * Classification uses ordered path-matching rules. First match wins.
 * Documents not matching any rule are classified as 'uncategorized'.
 *
 * Designed to be idempotent — only processes rows WHERE classification IS NULL.
 * Accepts an open better-sqlite3 db instance (does NOT open or close the DB).
 *
 * @module backfill-classifications
 */

import chalk from 'chalk';

const BATCH_SIZE = 500;
const DEFAULT_CLASSIFICATION = 'uncategorized';

/**
 * Determine the classification for a document path using ctx.classificationRules.
 * Rules are already compiled RegExp objects (done once in loader.mjs).
 *
 * @param {string} docPath - The document path
 * @param {Array<{pattern: RegExp, classification: string}>} rules - Compiled classification rules
 * @returns {string} Classification string (materialized path or 'uncategorized')
 */
function classifyPath(docPath, rules) {
  for (const rule of rules) {
    if (rule.pattern.test(docPath)) {
      return rule.classification;
    }
  }
  return DEFAULT_CLASSIFICATION;
}

/**
 * Backfill classifications for all documents where classification IS NULL.
 *
 * @param {import('better-sqlite3').Database} db - Open better-sqlite3 database instance
 * @param {object} ctx - Context profile object (ctx.classificationRules used for path matching)
 * @returns {number} Number of documents updated
 */
export function backfillClassifications(db, ctx) {
  const rows = db.prepare('SELECT id, path FROM documents WHERE classification IS NULL').all();

  const total = rows.length;

  if (total === 0) {
    console.log(chalk.gray('  backfill-classifications: no NULL classifications found — skipping'));
    return 0;
  }

  console.log(chalk.blue(`  Backfilling classifications for ${total} documents...`));

  const update = db.prepare('UPDATE documents SET classification = ? WHERE id = ?');

  const batchUpdate = db.transaction(batch => {
    for (const doc of batch) {
      const classification = classifyPath(doc.path, ctx.classificationRules);
      update.run(classification, doc.id);
    }
  });

  let processed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    batchUpdate(batch);
    processed += batch.length;

    const pct = Math.round((processed / total) * 100);
    process.stdout.write(
      chalk.gray(`\r  Backfilling classifications: ${processed}/${total} (${pct}%)...`)
    );
  }

  // Clear progress line
  process.stdout.write('\n');
  console.log(chalk.green(`  Classifications backfilled: ${processed} documents updated`));

  // Print classification distribution (top 10)
  const dist = db
    .prepare(
      'SELECT classification, COUNT(*) as cnt FROM documents GROUP BY classification ORDER BY cnt DESC LIMIT 10'
    )
    .all();

  console.log(chalk.blue('\n  Classification distribution (top 10):'));
  for (const row of dist) {
    const bar = '█'.repeat(Math.min(Math.ceil(row.cnt / 100), 30));
    console.log(
      chalk.gray(`    ${row.classification.padEnd(36)} ${String(row.cnt).padStart(5)}  ${bar}`)
    );
  }

  return processed;
}
