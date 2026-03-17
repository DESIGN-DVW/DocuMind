#!/usr/bin/env node

/**
 * DocuMind Database Reset (Guarded)
 *
 * DESTRUCTIVE OPERATION — destroys all indexed documents in documind.db.
 * Requires the --force flag to proceed. Without it, prints a loud warning
 * and exits with code 1.
 *
 * Usage:
 *   npm run db:reset              # Prints warning, exits 1 (safe)
 *   npm run db:reset -- --force   # Creates backup, then resets DB
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../../data/documind.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const hasForce = process.argv.includes('--force');

// ─── Guard: print warning and exit if --force not present ───────────────────

if (!hasForce) {
  console.log('');
  console.log(chalk.red('╔══════════════════════════════════════════════════════════════╗'));
  console.log(
    chalk.red('║  ') +
      chalk.yellow('DESTRUCTIVE OPERATION: db:reset') +
      chalk.red('                          ║')
  );
  console.log(chalk.red('║                                                              ║'));
  console.log(
    chalk.red('║  ') +
      chalk.yellow('This will DESTROY all indexed documents in documind.db') +
      chalk.red('   ║')
  );
  console.log(
    chalk.red('║  ') +
      chalk.yellow('Current corpus: 8,000+ documents') +
      chalk.red('                         ║')
  );
  console.log(chalk.red('║                                                              ║'));
  console.log(
    chalk.red('║  ') +
      chalk.white('Run with --force to confirm:') +
      chalk.red('                             ║')
  );
  console.log(
    chalk.red('║  ') +
      chalk.white('npm run db:reset -- --force') +
      chalk.red('                               ║')
  );
  console.log(chalk.red('╚══════════════════════════════════════════════════════════════╝'));
  console.log('');
  process.exit(1);
}

// ─── --force path: backup then reset ────────────────────────────────────────

try {
  console.log(chalk.yellow('\n  db:reset --force: proceeding with database reset\n'));

  /**
   * Create a filesystem-safe ISO timestamp string.
   */
  function safeTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  /**
   * Copy a file if it exists. Returns true if copied.
   */
  function copyIfExists(src, dest) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      return true;
    }
    return false;
  }

  // Step 1: Create a timestamped backup before destroying anything
  let backupPath = null;
  if (fs.existsSync(DB_PATH)) {
    const ts = safeTimestamp();
    backupPath = `${DB_PATH}.bak-${ts}`;
    fs.copyFileSync(DB_PATH, backupPath);
    copyIfExists(`${DB_PATH}-wal`, `${backupPath}-wal`);
    copyIfExists(`${DB_PATH}-shm`, `${backupPath}-shm`);
    console.log(chalk.gray(`  Backup: ${path.basename(backupPath)}`));
  }

  // Step 2: Delete existing database and WAL/SHM files
  const filesToDelete = [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`];
  for (const f of filesToDelete) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(chalk.gray(`  Deleted: ${path.basename(f)}`));
    }
  }

  // Step 3: Recreate from schema.sql
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(chalk.red(`  ERROR: schema.sql not found at ${SCHEMA_PATH}`));
    process.exit(1);
  }

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.exec(schema);

  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    .all();

  db.close();

  console.log('');
  console.log(chalk.green(`  Database reset complete.`));
  console.log(chalk.gray(`  Tables created: ${tables.length}`));
  if (backupPath) {
    console.log(chalk.gray(`  Backup saved:   ${path.basename(backupPath)}`));
  }
  console.log(chalk.blue('\n  Run `npm run db:migrate` to apply pending migrations.'));
  console.log(chalk.blue('  Run `npm run scan:enhanced` to reindex all documents.\n'));
} catch (error) {
  console.error(chalk.red('\n  Reset failed:'));
  console.error(chalk.red(error.message));
  console.error(error.stack);
  process.exit(1);
}
