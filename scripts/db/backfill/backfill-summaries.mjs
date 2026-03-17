#!/usr/bin/env node

/**
 * Backfill summaries for all documents that have a NULL summary.
 *
 * Extraction hierarchy (user-locked decision):
 *   1. frontmatter.description field (if present and > 20 chars)
 *   2. First non-heading, non-table, non-fence paragraph (if > 30 chars)
 *   3. Filename fallback from path
 *
 * Designed to be idempotent — only processes rows WHERE summary IS NULL.
 * Accepts an open better-sqlite3 db instance (does NOT open or close the DB).
 *
 * @module backfill-summaries
 */

import chalk from 'chalk';

const BATCH_SIZE = 500;
const DESCRIPTION_MIN_CHARS = 20;
const PARAGRAPH_MIN_CHARS = 30;
const SUMMARY_MAX_CHARS = 200;

/**
 * Extract a summary string from a document's frontmatter and content.
 *
 * @param {object} doc - Row from the documents table
 * @param {number} doc.id - Document ID
 * @param {string} doc.path - Document path
 * @param {string|null} doc.frontmatter - JSON-serialized frontmatter (may be null)
 * @param {string|null} doc.content - Full document content (may be null)
 * @returns {string} Extracted summary (never empty)
 */
function extractSummary(doc) {
  // Priority 1: frontmatter.description (JSON-encoded in DB, not raw YAML)
  if (doc.frontmatter) {
    try {
      const fm = JSON.parse(doc.frontmatter);
      if (
        fm &&
        typeof fm.description === 'string' &&
        fm.description.length > DESCRIPTION_MIN_CHARS
      ) {
        return fm.description.slice(0, SUMMARY_MAX_CHARS);
      }
    } catch {
      // Malformed JSON — fall through to next priority
    }
  }

  // Priority 2: First qualifying paragraph from content
  if (doc.content) {
    const lines = doc.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.length > PARAGRAPH_MIN_CHARS &&
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('|') &&
        !trimmed.startsWith('```') &&
        !trimmed.startsWith('~~~')
      ) {
        return trimmed.slice(0, SUMMARY_MAX_CHARS);
      }
    }
  }

  // Priority 3: Filename fallback
  return doc.path.split('/').pop().replace(/\.md$/i, '');
}

/**
 * Backfill summaries for all documents where summary IS NULL.
 *
 * @param {import('better-sqlite3').Database} db - Open better-sqlite3 database instance
 * @returns {number} Number of documents updated
 */
export function backfillSummaries(db) {
  const rows = db
    .prepare('SELECT id, path, frontmatter, content FROM documents WHERE summary IS NULL')
    .all();

  const total = rows.length;

  if (total === 0) {
    console.log(chalk.gray('  backfill-summaries: no NULL summaries found — skipping'));
    return 0;
  }

  console.log(chalk.blue(`  Backfilling summaries for ${total} documents...`));

  const update = db.prepare('UPDATE documents SET summary = ? WHERE id = ?');

  const batchUpdate = db.transaction(batch => {
    for (const doc of batch) {
      const summary = extractSummary(doc);
      update.run(summary, doc.id);
    }
  });

  let processed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    batchUpdate(batch);
    processed += batch.length;

    const pct = Math.round((processed / total) * 100);
    process.stdout.write(
      chalk.gray(`\r  Backfilling summaries: ${processed}/${total} (${pct}%)...`)
    );
  }

  // Clear progress line and print final status
  process.stdout.write('\n');
  console.log(chalk.green(`  Summaries backfilled: ${processed} documents updated`));

  return processed;
}
