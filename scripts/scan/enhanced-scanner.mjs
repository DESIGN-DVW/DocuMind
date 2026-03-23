#!/usr/bin/env node

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { glob } from 'glob';
import matter from 'gray-matter';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';
import { LOCAL_BASE_PATH } from '../../config/constants.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
const DB_PATH = path.join(__dirname, '../../data/documind.db');
const db = new Database(DB_PATH);

// Repository configuration
const REPOS = [
  { name: 'FigmailAPP', path: path.join(LOCAL_BASE_PATH, 'FigmaAPI/FigmailAPP'), priority: 'high' },
  {
    name: 'FigmaDSController',
    path: path.join(LOCAL_BASE_PATH, 'FigmaAPI/FigmaDSController'),
    priority: 'high',
  },
  {
    name: '@figma-core',
    path: path.join(LOCAL_BASE_PATH, 'FigmaAPI/@figma-core'),
    priority: 'high',
  },
  {
    name: '@figma-docs',
    path: path.join(LOCAL_BASE_PATH, 'FigmaAPI/@figma-docs'),
    priority: 'high',
  },
  { name: 'Figma-Plug-ins', path: path.join(LOCAL_BASE_PATH, 'Figma-Plug-ins'), priority: 'high' },
  { name: 'Markdown', path: path.join(LOCAL_BASE_PATH, 'Markdown'), priority: 'high' },
  { name: 'GlossiaApp', path: path.join(LOCAL_BASE_PATH, 'GlossiaApp'), priority: 'medium' },
  { name: 'Contentful', path: path.join(LOCAL_BASE_PATH, 'Contentful'), priority: 'medium' },
  { name: 'IconJar', path: path.join(LOCAL_BASE_PATH, 'IconJar'), priority: 'low' },
  { name: 'AdobePlugIns', path: path.join(LOCAL_BASE_PATH, 'AdobePlugIns'), priority: 'low' },
];

// Category detection
function detectCategory(filePath) {
  const pathLower = filePath.toLowerCase();

  if (pathLower.includes('/.claude/agents/')) return 'agents';
  if (pathLower.includes('/docs/01-agents/')) return 'agents';
  if (pathLower.includes('/docs/02-backend/')) return 'backend';
  if (pathLower.includes('/docs/03-frontend/')) return 'frontend';
  if (pathLower.includes('/docs/04-architecture/')) return 'architecture';
  if (pathLower.includes('/docs/05-guides/')) return 'guides';
  if (pathLower.includes('/docs/06-issues/')) return 'issues';
  if (pathLower.includes('/docs/99-shared/')) return 'shared';
  if (pathLower.includes('/docs/00-references/')) return 'references';
  if (pathLower.match(/readme\.md$/i)) return 'readme';
  if (pathLower.match(/claude\.md$/i)) return 'claude-instructions';
  if (pathLower.includes('/docs/')) return 'documentation';

  return 'other';
}

// Generate SHA-256 hash
function generateHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

// Parse markdown file
function parseMarkdownFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = matter(content);

    const stats = fs.statSync(filePath);
    const lines = content.split('\n').length;
    const words = content.split(/\s+/).length;

    return {
      content,
      frontmatter: parsed.data,
      body: parsed.content,
      stats: {
        size: stats.size,
        lines,
        words,
        created: stats.birthtime,
        modified: stats.mtime,
      },
      hash: generateHash(content),
    };
  } catch (error) {
    console.error(chalk.red(`Error parsing ${filePath}: ${error.message}`));
    return null;
  }
}

// Upsert document into database
function upsertDocument(repo, filePath, data) {
  const relativePath = filePath.replace(repo.path, '').replace(/^\//, '');
  const filename = path.basename(filePath);
  const category = detectCategory(filePath);

  const version = data.frontmatter?.version || data.frontmatter?.Version || null;
  const frontmatterJson = JSON.stringify(data.frontmatter);

  const stmt = db.prepare(`
    INSERT INTO documents (
      path, repository, filename, category, version,
      created_at, modified_at, last_scanned,
      file_size, line_count, word_count,
      content_hash, frontmatter, content
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      modified_at = excluded.modified_at,
      last_scanned = excluded.last_scanned,
      file_size = excluded.file_size,
      line_count = excluded.line_count,
      word_count = excluded.word_count,
      content_hash = excluded.content_hash,
      frontmatter = excluded.frontmatter,
      content = excluded.content
  `);

  try {
    stmt.run(
      relativePath,
      repo.name,
      filename,
      category,
      version,
      data.stats.created.toISOString(),
      data.stats.modified.toISOString(),
      new Date().toISOString(),
      data.stats.size,
      data.stats.lines,
      data.stats.words,
      data.hash,
      frontmatterJson,
      data.content
    );
    return true;
  } catch (error) {
    console.error(chalk.red(`Error inserting ${relativePath}: ${error.message}`));
    return false;
  }
}

// Scan repository
async function scanRepository(repo) {
  const spinner = ora(`Scanning ${repo.name}...`).start();

  // Check if repo exists
  if (!fs.existsSync(repo.path)) {
    spinner.warn(`Repository not found: ${repo.path}`);
    return { scanned: 0, added: 0, updated: 0, skipped: 0 };
  }

  // Find all markdown files
  const pattern = `${repo.path}/**/*.{md,mdx}`;
  const files = await glob(pattern, {
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/index/**'],
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const data = parseMarkdownFile(file);
    if (!data) {
      skipped++;
      continue;
    }

    // Check if document exists and if hash changed
    const existing = db
      .prepare('SELECT content_hash FROM documents WHERE path = ?')
      .get(file.replace(repo.path, '').replace(/^\//, ''));

    if (existing && existing.content_hash === data.hash) {
      // No changes, just update last_scanned
      db.prepare('UPDATE documents SET last_scanned = ? WHERE path = ?').run(
        new Date().toISOString(),
        file.replace(repo.path, '').replace(/^\//, '')
      );
      skipped++;
    } else {
      const success = upsertDocument(repo, file, data);
      if (success) {
        if (existing) {
          updated++;
        } else {
          added++;
        }
      } else {
        skipped++;
      }
    }
  }

  spinner.succeed(
    `${repo.name}: ${files.length} files scanned, ${added} added, ${updated} updated, ${skipped} skipped`
  );

  return { scanned: files.length, added, updated, skipped };
}

// Record scan history
function recordScanHistory(stats) {
  const stmt = db.prepare(`
    INSERT INTO scan_history (
      scan_started, scan_completed, repositories_scanned,
      documents_found, documents_added, documents_updated,
      duration_ms, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  stmt.run(
    now,
    now,
    stats.repositories,
    stats.totalScanned,
    stats.totalAdded,
    stats.totalUpdated,
    stats.duration * 1000, // Convert to milliseconds
    'completed'
  );
}

// Update statistics
function updateStatistics() {
  const totalDocs = db.prepare('SELECT COUNT(*) as count FROM documents').get().count;
  const totalSize = db.prepare('SELECT SUM(file_size) as size FROM documents').get().size || 0;

  const updateStmt = db.prepare(`
    INSERT OR REPLACE INTO statistics (stat_name, stat_value, updated_at)
    VALUES (?, ?, ?)
  `);

  updateStmt.run('total_documents', totalDocs.toString(), new Date().toISOString());
  updateStmt.run('total_size', totalSize.toString(), new Date().toISOString());
  updateStmt.run('last_scan', new Date().toISOString(), new Date().toISOString());
}

// Main function
async function main() {
  console.log(chalk.bold.cyan('\n🔍 DocuMind Enhanced Scanner\n'));
  console.log(chalk.gray('━'.repeat(60)));

  const startTime = Date.now();

  let totalScanned = 0;
  let totalAdded = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  // Scan all repositories
  for (const repo of REPOS) {
    const stats = await scanRepository(repo);
    totalScanned += stats.scanned;
    totalAdded += stats.added;
    totalUpdated += stats.updated;
    totalSkipped += stats.skipped;
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  // Get total size
  const totalSize = db.prepare('SELECT SUM(file_size) as size FROM documents').get().size || 0;

  // Record scan history
  recordScanHistory({
    totalScanned,
    totalAdded,
    totalUpdated,
    totalSize,
    duration,
    repositories: REPOS.length,
  });

  // Update statistics
  updateStatistics();

  // Display summary
  console.log(chalk.gray('━'.repeat(60)));
  console.log(chalk.bold.green('\n✨ Scan Complete!\n'));
  console.log(chalk.cyan('📊 Summary:'));
  console.log(`   ${chalk.green('✓')} Repositories: ${REPOS.length}`);
  console.log(`   ${chalk.green('✓')} Files scanned: ${totalScanned}`);
  console.log(`   ${chalk.green('✓')} New documents: ${totalAdded}`);
  console.log(`   ${chalk.yellow('↻')} Updated documents: ${totalUpdated}`);
  console.log(`   ${chalk.gray('○')} Unchanged: ${totalSkipped}`);
  console.log(`   ${chalk.blue('ⓘ')} Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   ${chalk.blue('ⓘ')} Duration: ${duration}s`);

  console.log(chalk.gray('\n━'.repeat(60)));
  console.log(chalk.bold('\n📚 Next Steps:'));
  console.log('   1. Run: ' + chalk.cyan('npm run analyze:similarities'));
  console.log('   2. Run: ' + chalk.cyan('npm run analyze:deviations'));
  console.log('   3. Run: ' + chalk.cyan('npm run report:dashboard'));
  console.log();

  db.close();
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  db.close();
  process.exit(1);
});
