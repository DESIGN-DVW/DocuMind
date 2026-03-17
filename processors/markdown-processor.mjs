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
 * Extract a plain-text summary from frontmatter or content.
 * Priority 1: frontmatter.description (up to 500 chars)
 * Priority 2: first non-heading, non-empty paragraph > 20 chars
 * Priority 3: null
 *
 * @param {object} frontmatter
 * @param {string} content - raw markdown content (after frontmatter stripped)
 * @returns {string|null}
 */
export function extractSummary(frontmatter, content) {
  if (frontmatter.description && typeof frontmatter.description === 'string') {
    return frontmatter.description.slice(0, 500);
  }

  // Walk lines looking for first substantive paragraph
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue; // skip blank lines
    if (trimmed.startsWith('#')) continue; // skip headings
    if (trimmed.startsWith('|')) continue; // skip table rows
    if (trimmed.startsWith('```')) continue; // skip code fence markers
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) continue; // skip list items
    if (trimmed.length > 20) {
      return trimmed.slice(0, 500);
    }
  }

  return null;
}

/**
 * Classify a document using ctx.classificationRules.
 * Priority 1: frontmatter.classification
 * Priority 2: frontmatter.category (backward compat)
 * Priority 3: iterate ctx.classificationRules — first match wins
 * Priority 4: 'other'
 *
 * @param {string} filePath
 * @param {object} frontmatter
 * @param {object} ctx - context profile (from context/loader.mjs)
 * @returns {string}
 */
export function classifyPath(filePath, frontmatter, ctx) {
  if (frontmatter.classification) return frontmatter.classification;
  if (frontmatter.category) return frontmatter.category;

  if (ctx && Array.isArray(ctx.classificationRules)) {
    for (const rule of ctx.classificationRules) {
      if (rule.pattern instanceof RegExp && rule.pattern.test(filePath)) {
        return rule.classification;
      }
    }
  }

  return 'other';
}

/**
 * Process a single markdown file: parse, validate, and prepare for indexing.
 * Does NOT accept ctx — category detection uses a simple frontmatter fallback.
 * Use indexMarkdown (which has ctx) for full ctx-based classification.
 *
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

  // Simple category fallback (no ctx available here)
  const category = frontmatter.category || 'other';

  // Extract summary
  const summary = extractSummary(frontmatter, content);

  return {
    content: raw,
    frontmatter,
    metadata: {
      path: filePath,
      filename: path.basename(filePath),
      category,
      summary,
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
 * Index a markdown file into the database.
 * Uses ctx.classificationRules for full classification.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} filePath
 * @param {string} repository
 * @param {object} ctx - context profile from loadProfile()
 * @returns {Promise<object>} metadata
 */
export async function indexMarkdown(db, filePath, repository, ctx) {
  const { content, frontmatter, metadata } = await processMarkdown(filePath);
  const now = new Date().toISOString();

  // Full ctx-based classification (overrides processMarkdown's simple fallback)
  const classification = classifyPath(filePath, frontmatter, ctx);

  db.prepare(
    `
    INSERT INTO documents (path, repository, filename, category, classification, version,
                          created_at, modified_at, last_scanned,
                          file_size, line_count, word_count,
                          content_hash, frontmatter, content, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      category = ?, classification = ?, version = ?, modified_at = ?, last_scanned = ?,
      file_size = ?, line_count = ?, word_count = ?,
      content_hash = ?, frontmatter = ?, content = ?, summary = ?
  `
  ).run(
    // INSERT params
    filePath,
    repository,
    metadata.filename,
    classification,
    classification,
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
    metadata.summary,
    // ON CONFLICT UPDATE params
    classification,
    classification,
    metadata.version,
    metadata.modified_at,
    now,
    metadata.file_size,
    metadata.line_count,
    metadata.word_count,
    metadata.content_hash,
    JSON.stringify(frontmatter),
    content,
    metadata.summary
  );

  return { ...metadata, category: classification, classification };
}
