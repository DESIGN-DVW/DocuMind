#!/usr/bin/env node

/**
 * DocuMind v2.0 — PDF Processor
 * Extracts text from PDFs, indexes content, generates summaries
 */

import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/**
 * Process a PDF file: extract text, generate summary, prepare for indexing
 * @param {string} inputPath - Path to .pdf file
 * @param {object} [options]
 * @param {boolean} [options.generateMarkdown=false] - Also create a .md summary file
 * @param {string} [options.outputDir] - Output directory for markdown
 * @returns {Promise<{content: string, metadata: object, summary: string}>}
 */
export async function processPdf(inputPath, options = {}) {
  const buffer = await fs.readFile(inputPath);
  const data = await pdfParse(buffer);

  const text = data.text || '';
  const contentHash = crypto.createHash('sha256').update(text).digest('hex');

  // Generate summary: first 500 words + extracted headings
  const words = text.split(/\s+/).filter(Boolean);
  const summaryText = words.slice(0, 500).join(' ');
  const headingPattern = /^[A-Z][A-Z\s]{2,}$/gm;
  const headings = [...text.matchAll(headingPattern)].map(m => m[0].trim()).slice(0, 20);

  const metadata = {
    source: inputPath,
    format: 'pdf',
    title: data.info?.Title || path.basename(inputPath, '.pdf'),
    author: data.info?.Author || null,
    creator: data.info?.Creator || null,
    producer: data.info?.Producer || null,
    creationDate: data.info?.CreationDate || null,
    modDate: data.info?.ModDate || null,
    pages: data.numpages,
    wordCount: words.length,
    lineCount: text.split('\n').length,
    contentHash,
    headings,
  };

  const summary =
    headings.length > 0
      ? `**Headings:** ${headings.join(', ')}\n\n${summaryText}...`
      : `${summaryText}...`;

  // Optionally generate a markdown summary file
  if (options.generateMarkdown) {
    const basename = path.basename(inputPath, '.pdf');
    const outDir = options.outputDir || path.dirname(inputPath);
    const outputPath = path.join(outDir, `${basename}-summary.md`);

    const now = new Date().toISOString().split('T')[0];
    const md = [
      '---',
      `title: "${metadata.title}"`,
      `source_pdf: "${path.basename(inputPath)}"`,
      `pages: ${metadata.pages}`,
      `word_count: ${metadata.wordCount}`,
      `indexed_at: "${now}"`,
      `indexer: "DocuMind v2.0 (pdf-parse)"`,
      '---',
      '',
      `# ${metadata.title}`,
      '',
      metadata.author ? `**Author:** ${metadata.author}` : '',
      `**Pages:** ${metadata.pages}`,
      `**Words:** ${metadata.wordCount}`,
      '',
      '## Extracted Headings',
      '',
      ...headings.map(h => `- ${h}`),
      '',
      '## Summary',
      '',
      summaryText + '...',
      '',
    ]
      .filter(Boolean)
      .join('\n');

    await fs.writeFile(outputPath, md, 'utf-8');
    metadata.outputPath = outputPath;
  }

  return {
    content: text,
    metadata,
    summary,
  };
}

/**
 * Index a PDF into the DocuMind database
 * @param {import('better-sqlite3').Database} db
 * @param {string} inputPath
 * @param {string} repository
 */
export async function indexPdf(db, inputPath, repository) {
  const { content, metadata, summary } = await processPdf(inputPath, { generateMarkdown: true });
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO documents (path, repository, filename, category, created_at, modified_at,
                          last_scanned, file_size, line_count, word_count, content_hash,
                          frontmatter, content)
    VALUES (?, ?, ?, 'pdf-indexed', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      last_scanned = ?, content_hash = ?, content = ?,
      word_count = ?, line_count = ?
  `
  ).run(
    inputPath,
    repository,
    path.basename(inputPath),
    now,
    now,
    now,
    0,
    metadata.lineCount,
    metadata.wordCount,
    metadata.contentHash,
    JSON.stringify(metadata),
    content,
    now,
    metadata.contentHash,
    content,
    metadata.wordCount,
    metadata.lineCount
  );

  // Log conversion
  db.prepare(
    `
    INSERT INTO conversions (source_path, source_format, output_path, output_format,
                            status, converted_at, metadata)
    VALUES (?, 'pdf', ?, 'markdown', 'completed', ?, ?)
  `
  ).run(inputPath, metadata.outputPath || inputPath, now, JSON.stringify(metadata));

  return metadata;
}
