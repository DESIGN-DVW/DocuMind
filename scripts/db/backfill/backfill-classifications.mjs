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

/**
 * Classification rules — checked in order, first match wins.
 * Using materialized path format for category hierarchy.
 */
const CLASSIFICATION_RULES = [
  { pattern: /\/docs\/api\//, classification: 'engineering/api-docs' },
  { pattern: /CLAUDE\.md$/, classification: 'engineering/architecture' },
  { pattern: /\/\.planning\//, classification: 'engineering/architecture' },
  { pattern: /ADR[-_]/i, classification: 'engineering/architecture/adrs' },
  { pattern: /README\.md$/i, classification: 'references/readme' },
  { pattern: /CHANGELOG/i, classification: 'operations/changelog' },
  { pattern: /\/scripts\//, classification: 'engineering/scripts' },
  { pattern: /\/config\//, classification: 'engineering/config' },
  { pattern: /\/tests?\//, classification: 'engineering/tests' },
  { pattern: /\/docs\//, classification: 'guides/documentation' },
  { pattern: /\.github\//, classification: 'operations/ci-cd' },
  { pattern: /package\.json$/, classification: 'engineering/config' },
];

const DEFAULT_CLASSIFICATION = 'uncategorized';

/**
 * Determine the classification for a document path.
 *
 * @param {string} docPath - The document path
 * @returns {string} Classification string (materialized path or 'uncategorized')
 */
function classifyPath(docPath) {
  for (const rule of CLASSIFICATION_RULES) {
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
 * @returns {number} Number of documents updated
 */
export function backfillClassifications(db) {
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
      const classification = classifyPath(doc.path);
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
