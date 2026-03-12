#!/usr/bin/env node

/**
 * DocuMind v2.0 — Word/RTF to Markdown Processor
 * Converts DOCX files to enhanced markdown using mammoth + turndown
 */

import mammoth from 'mammoth';
import TurndownService from 'turndown';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});

// Enhance table output for markdownlint compliance
turndown.addRule('tables', {
  filter: 'table',
  replacement: (content, node) => {
    // mammoth doesn't produce tables well — pass through as-is
    return '\n\n' + content + '\n\n';
  },
});

/**
 * Convert a DOCX file to Markdown
 * @param {string} inputPath - Path to .docx file
 * @param {string} [outputDir] - Output directory (defaults to same dir as input)
 * @returns {Promise<{outputPath: string, content: string, metadata: object}>}
 */
export async function convertDocx(inputPath, outputDir) {
  const buffer = await fs.readFile(inputPath);
  const basename = path.basename(inputPath, path.extname(inputPath));
  const outDir = outputDir || path.dirname(inputPath);
  const outputPath = path.join(outDir, `${basename}.md`);

  // Convert DOCX → HTML
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;
  const warnings = result.messages;

  // Convert HTML → Markdown
  let markdown = turndown.turndown(html);

  // Add frontmatter
  const now = new Date().toISOString().split('T')[0];
  const frontmatter = [
    '---',
    `title: "${basename}"`,
    `converted_from: "${path.basename(inputPath)}"`,
    `converted_at: "${now}"`,
    `converter: "DocuMind v2.0 (mammoth + turndown)"`,
    '---',
    '',
  ].join('\n');

  markdown = frontmatter + markdown;

  // Ensure blank lines around headings (markdownlint MD022)
  markdown = markdown.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2');
  markdown = markdown.replace(/(#{1,6} .+)\n([^\n])/g, '$1\n\n$2');

  // Ensure trailing newline
  if (!markdown.endsWith('\n')) markdown += '\n';

  await fs.writeFile(outputPath, markdown, 'utf-8');

  const contentHash = crypto.createHash('sha256').update(markdown).digest('hex');

  return {
    outputPath,
    content: markdown,
    metadata: {
      source: inputPath,
      format: 'docx',
      warnings: warnings.length,
      wordCount: markdown.split(/\s+/).length,
      lineCount: markdown.split('\n').length,
      contentHash,
    },
  };
}

/**
 * Convert an RTF file to Markdown (via plain text extraction)
 * @param {string} inputPath - Path to .rtf file
 * @param {string} [outputDir] - Output directory
 * @returns {Promise<{outputPath: string, content: string, metadata: object}>}
 */
export async function convertRtf(inputPath, outputDir) {
  const raw = await fs.readFile(inputPath, 'utf-8');
  const basename = path.basename(inputPath, '.rtf');
  const outDir = outputDir || path.dirname(inputPath);
  const outputPath = path.join(outDir, `${basename}.md`);

  // Strip RTF control sequences for basic text extraction
  let text = raw
    .replace(/\{\\[^{}]*\}/g, '') // Remove nested groups
    .replace(/\\[a-z]+\d*\s?/gi, '') // Remove control words
    .replace(/[{}]/g, '') // Remove remaining braces
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple blank lines
    .trim();

  // Add frontmatter
  const now = new Date().toISOString().split('T')[0];
  const frontmatter = [
    '---',
    `title: "${basename}"`,
    `converted_from: "${path.basename(inputPath)}"`,
    `converted_at: "${now}"`,
    `converter: "DocuMind v2.0 (rtf-text-extract)"`,
    '---',
    '',
  ].join('\n');

  const markdown = frontmatter + text + '\n';

  await fs.writeFile(outputPath, markdown, 'utf-8');

  const contentHash = crypto.createHash('sha256').update(markdown).digest('hex');

  return {
    outputPath,
    content: markdown,
    metadata: {
      source: inputPath,
      format: 'rtf',
      wordCount: markdown.split(/\s+/).length,
      lineCount: markdown.split('\n').length,
      contentHash,
    },
  };
}
