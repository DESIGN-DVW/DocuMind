#!/usr/bin/env node

/**
 * DocuMind Database Initialization
 *
 * Creates SQLite database with full schema for documentation intelligence
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

console.log(chalk.blue('\n🗄️  DocuMind Database Initialization\n'));
console.log('━'.repeat(60));

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(chalk.green('✅ Created data directory'));
}

// Check if database already exists
const dbExists = fs.existsSync(DB_PATH);
if (dbExists) {
  console.log(chalk.yellow(`⚠️  Database already exists: ${DB_PATH}`));
  console.log(chalk.yellow('   This will reinitialize the database (existing data will be preserved if schema matches)'));
}

try {
  // Connect to database
  console.log(chalk.blue('\n📊 Connecting to database...'));
  const db = new Database(DB_PATH);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Read schema
  console.log(chalk.blue('📋 Reading schema...'));
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');

  // Execute schema
  console.log(chalk.blue('🔨 Creating tables...'));
  db.exec(schema);

  // Verify tables were created
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  console.log(chalk.green(`\n✅ Created ${tables.length} tables:`));
  tables.forEach(table => {
    console.log(chalk.gray(`   - ${table.name}`));
  });

  // Verify views were created
  const views = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='view'
    ORDER BY name
  `).all();

  console.log(chalk.green(`\n✅ Created ${views.length} views:`));
  views.forEach(view => {
    console.log(chalk.gray(`   - ${view.name}`));
  });

  // Verify indexes were created
  const indexes = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='index' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  console.log(chalk.green(`\n✅ Created ${indexes.length} indexes for performance`));

  // Insert initial statistics
  const statsStmt = db.prepare(`
    INSERT OR REPLACE INTO statistics (stat_name, stat_value, updated_at)
    VALUES (?, ?, ?)
  `);

  statsStmt.run('db_initialized', 'true', new Date().toISOString());
  statsStmt.run('db_version', '1.0.0', new Date().toISOString());
  statsStmt.run('total_documents', '0', new Date().toISOString());
  statsStmt.run('total_repositories', '0', new Date().toISOString());

  // Get database file size
  const stats = fs.statSync(DB_PATH);
  const fileSizeKB = (stats.size / 1024).toFixed(2);

  console.log(chalk.blue('\n📈 Database Statistics:'));
  console.log(chalk.gray(`   Size: ${fileSizeKB} KB`));
  console.log(chalk.gray(`   Location: ${DB_PATH}`));
  console.log(chalk.gray(`   Mode: WAL (Write-Ahead Logging)`));
  console.log(chalk.gray(`   Foreign Keys: Enabled`));

  // Test database with a query
  console.log(chalk.blue('\n🧪 Testing database...'));
  const testResult = db.prepare('SELECT sqlite_version() as version').get();
  console.log(chalk.green(`✅ SQLite version: ${testResult.version}`));

  // Close database
  db.close();

  console.log(chalk.green('\n✨ Database initialization complete!\n'));
  console.log('━'.repeat(60));
  console.log(chalk.blue('\n📚 Next steps:'));
  console.log(chalk.gray('   1. Run: npm run scan:enhanced'));
  console.log(chalk.gray('   2. Run: npm run analyze:similarities'));
  console.log(chalk.gray('   3. Run: npm run report:dashboard\n'));

} catch (error) {
  console.error(chalk.red('\n❌ Database initialization failed:'));
  console.error(chalk.red(error.message));
  console.error(error.stack);
  process.exit(1);
}
