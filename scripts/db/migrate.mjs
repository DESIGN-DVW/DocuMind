#!/usr/bin/env node

/**
 * DocuMind Database Migration Runner
 *
 * Applies numbered SQL migrations to the live database in sequence.
 * Each migration is tracked in the schema_migrations table.
 * A timestamped backup is created before any migrations are applied.
 *
 * Usage: node scripts/db/migrate.mjs
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { loadProfile } from '../../context/loader.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../../data/documind.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Create a filesystem-safe ISO timestamp string.
 * Replaces colons and dots with dashes for use in filenames.
 */
function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Copy a file if it exists. Silently skips if source does not exist.
 */
function copyIfExists(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    return true;
  }
  return false;
}

/**
 * Create a timestamped backup of the database and its WAL/SHM files.
 * Returns the backup path used.
 */
function backupDatabase(dbPath) {
  const ts = safeTimestamp();
  const backupPath = `${dbPath}.bak-${ts}`;

  fs.copyFileSync(dbPath, backupPath);
  copyIfExists(`${dbPath}-wal`, `${backupPath}-wal`);
  copyIfExists(`${dbPath}-shm`, `${backupPath}-shm`);

  return backupPath;
}

// ─── Main ────────────────────────────────────────────────────────────────────

try {
  console.log(chalk.blue('\n  DocuMind Database Migration\n'));
  console.log('  ' + '━'.repeat(58));
  console.log(chalk.gray(`  DB: ${DB_PATH}`));

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(chalk.green('  Created data directory'));
  }

  // Step 1: Backup existing database (if it exists)
  let backupPath = null;
  if (fs.existsSync(DB_PATH)) {
    backupPath = backupDatabase(DB_PATH);
    console.log(chalk.gray(`  Backup: ${path.basename(backupPath)}`));
  } else {
    console.log(chalk.yellow('  No existing database found — creating fresh DB'));
  }

  console.log('');

  // Step 2: Open database
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // Step 3: Bootstrap schema_migrations table
  // Run inline (not from file) so the tracking table exists before we read it
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL,
      description TEXT
    )
  `);

  // Step 4: Read applied versions into a Set
  const appliedVersions = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map(row => row.version)
  );

  // Step 5: Read migration files sorted lexicographically
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log(chalk.yellow('  No migrations directory found — nothing to apply'));
    db.close();
    process.exit(0);
  }

  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    console.log(chalk.yellow('  No migration files found — nothing to apply'));
    db.close();
    process.exit(0);
  }

  // Check for --backfill flag (forces backfill even when no new migrations applied)
  const forceBackfill = process.argv.includes('--backfill');

  // Step 6: Apply pending migrations
  let appliedCount = 0;
  let skippedCount = 0;

  for (const filename of migrationFiles) {
    const version = filename.replace(/\.sql$/, '');

    if (appliedVersions.has(version)) {
      console.log(chalk.gray(`  [skip] ${filename}`));
      skippedCount++;
      continue;
    }

    const sqlPath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Wrap migration + tracking in a single transaction
    const applyMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        `
        INSERT INTO schema_migrations (version, applied_at, description)
        VALUES (?, ?, ?)
      `
      ).run(version, new Date().toISOString(), filename);
    });

    applyMigration();

    console.log(chalk.green(`  [apply] ${filename}`));
    appliedCount++;
  }

  // Step 7: Post-migration backfill (runs when new migrations applied, or --backfill forced)
  if (appliedCount > 0 || forceBackfill) {
    console.log(chalk.blue('\nRunning post-migration backfill...'));

    // Load context profile for classification rules
    const ctx = await loadProfile();
    console.log(chalk.gray(`  Using profile: ${ctx.profileId}`));

    const { backfillSummaries } = await import('./backfill/backfill-summaries.mjs');
    const summaryCount = backfillSummaries(db);
    console.log(chalk.green(`  Backfilled ${summaryCount} document summaries`));

    const { backfillClassifications } = await import('./backfill/backfill-classifications.mjs');
    const classCount = backfillClassifications(db, ctx);
    console.log(chalk.green(`  Backfilled ${classCount} document classifications`));

    // FTS5 rebuild after bulk writes (mandatory — prevents stale index after bulk UPDATEs)
    console.log(chalk.blue('  Rebuilding FTS5 index...'));
    db.exec("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')");
    console.log(chalk.green('  FTS5 index rebuilt'));
  }

  // Step 8: Summary
  console.log('');
  console.log('  ' + '━'.repeat(58));
  if (appliedCount > 0) {
    console.log(chalk.green(`  Applied: ${appliedCount} migration(s)`));
  }
  if (skippedCount > 0) {
    console.log(chalk.gray(`  Skipped: ${skippedCount} already-applied migration(s)`));
  }
  if (appliedCount === 0 && skippedCount === 0) {
    console.log(chalk.gray('  No migrations to apply'));
  }
  if (forceBackfill) {
    console.log(chalk.blue('  Mode:    --backfill (forced)'));
  }
  if (backupPath) {
    console.log(chalk.gray(`  Backup:  ${path.basename(backupPath)}`));
  }
  console.log(chalk.green('\n  Migration complete.\n'));

  db.close();
} catch (error) {
  console.error(chalk.red('\n  Migration failed:'));
  console.error(chalk.red(error.message));
  console.error(error.stack);
  process.exit(1);
}
