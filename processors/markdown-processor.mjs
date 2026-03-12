#!/usr/bin/env node

/**
 * DocuMind v2.0 — Markdown Processor
 * Lint, fix, and enhance markdown files for compliance
 * Integrates with existing fix-markdown.mjs patterns
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import matter from 'gray-matter';

/**
 * Process a single markdown file: parse, validate, and prepare for indexing
 * @param {string} filePath - Path to markdown file
 * @returns {Promise<{content: string, frontmatter: object, metadata: object}>}
 */
export async function processMarkdown(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  const { data: frontmatter, content } = matter(raw);
  const stat = await fs.stat(filePath);

  const contentHash = crypto.createHash('sha256').update(raw).digest('hex');
  const lines = raw.split('\n');
  const words = content.split(/\s+/).filter(Boolean);

  // Extract headings
  const headings = lines.filter(l => /^#{1,6}\s/.test(l)).map(l => l.replace(/^#+\s*/, '').trim());

  // Detect category from path
  const category = detectCategory(filePath, headings, frontmatter);

  return {
    content: raw,
    frontmatter,
    metadata: {
      path: filePath,
      filename: path.basename(filePath),
      category,
      version: frontmatter.version || null,
      created_at: frontmatter.created || frontmatter.date || stat.birthtime.toISOString(),
      modified_at: stat.mtime.toISOString(),
      file_size: stat.size,
      line_count: lines.length,
      word_count: words.length,
      content_hash: contentHash,
      headings,
    },
  };
}

/**
 * Index a markdown file into the database
 * @param {import('better-sqlite3').Database} db
 * @param {string} filePath
 * @param {string} repository
 */
export async function indexMarkdown(db, filePath, repository) {
  const { content, frontmatter, metadata } = await processMarkdown(filePath);
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO documents (path, repository, filename, category, version,
                          created_at, modified_at, last_scanned,
                          file_size, line_count, word_count,
                          content_hash, frontmatter, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      category = ?, version = ?, modified_at = ?, last_scanned = ?,
      file_size = ?, line_count = ?, word_count = ?,
      content_hash = ?, frontmatter = ?, content = ?
  `
  ).run(
    filePath,
    repository,
    metadata.filename,
    metadata.category,
    metadata.version,
    metadata.created_at,
    metadata.modified_at,
    now,
    metadata.file_size,
    metadata.line_count,
    metadata.word_count,
    metadata.content_hash,
    JSON.stringify(frontmatter),
    content,
    // ON CONFLICT UPDATE params
    metadata.category,
    metadata.version,
    metadata.modified_at,
    now,
    metadata.file_size,
    metadata.line_count,
    metadata.word_count,
    metadata.content_hash,
    JSON.stringify(frontmatter),
    content
  );

  return metadata;
}

/**
 * Detect document category from path, headings, and frontmatter
 */
function detectCategory(filePath, headings, frontmatter) {
  if (frontmatter.category) return frontmatter.category;

  const lower = filePath.toLowerCase();
  const filename = path.basename(lower);

  if (filename === 'claude.md') return 'claude-instructions';
  if (filename === 'readme.md') return 'readme';
  if (filename.startsWith('dispatch-')) return 'dispatch';
  if (filename.startsWith('prop-')) return 'proposal';

  if (lower.includes('/docs/')) return 'documentation';
  if (lower.includes('/memory/')) return 'memory';
  if (lower.includes('/agents/') || lower.includes('agent')) return 'ai-agents';
  if (lower.includes('/guides/') || lower.includes('guide')) return 'guides';
  if (lower.includes('/api/') || lower.includes('endpoint')) return 'api';
  if (lower.includes('deploy') || lower.includes('ci-cd')) return 'deployment';
  if (lower.includes('architecture') || lower.includes('design')) return 'architecture';
  if (lower.includes('changelog') || lower.includes('changes')) return 'changelog';
  if (lower.includes('/commands/')) return 'commands';

  return 'other';
}
