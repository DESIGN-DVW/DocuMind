#!/usr/bin/env node

/**
 * Markdown Auto-Fix Script (Markdown Repository Version)
 *
 * Automatically fixes systematic markdown linting errors across all DVWDesign repositories.
 *
 * @version 1.0.0
 * @created 2025-11-06
 */

import fs from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { LOCAL_BASE_PATH } from '../config/constants.mjs';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Base path for all repositories
  basePath: LOCAL_BASE_PATH,

  // File patterns to process
  patterns: ['**/*.md', '**/*.mdx'],

  // Exclude patterns
  exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/index/**'],

  // Fix options
  fixes: {
    lineBreaks: true,
    codeBlockLanguages: true,
    boldItalicToHeadings: true,
    boldItalicInLists: true,
  },

  // Code block language detection
  // Order matters: specific languages first, then defaults (md → diagram → text)
  languageDetection: {
    javascript: ['const ', 'let ', 'var ', 'function ', 'import ', 'export ', '=>', 'console.log'],
    typescript: ['interface ', 'type ', ': string', ': number', 'as ', 'enum '],
    bash: ['#!/bin/bash', '$ ', 'npm ', 'cd ', 'mkdir', 'chmod', 'export ', 'echo '],
    json: ['{', '[', '  "'],
    python: ['def ', 'class ', 'import ', 'from ', 'print('],
    yaml: ['---', 'version:', 'name:'],
    css: ['{', '}', ';', 'color:', 'display:'],
    html: ['<div', '<span', '<p>', '<!DOCTYPE'],
    diagram: [
      'graph ',
      'flowchart ',
      'sequenceDiagram',
      'classDiagram',
      'stateDiagram',
      'erDiagram',
      'gantt',
      'pie ',
      'journey',
      'mindmap',
      'timeline',
      'gitGraph',
      'C4Context',
    ],
    md: ['# ', '## ', '- ', '* ', '> ', '[', '**', '__'],
  },

  defaultLanguage: 'text',
  enforceCodeBlockType: true,
};

// ============================================================================
// Utilities (same as FigmailAPP version)
// ============================================================================

async function findMarkdownFiles(dir, excludePatterns = []) {
  const files = [];

  async function walk(currentPath) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        const shouldExclude = excludePatterns.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
          return regex.test(fullPath);
        });

        if (shouldExclude) continue;

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      if (error.code !== 'EACCES' && error.code !== 'ENOENT') {
        console.error(`Error reading ${currentPath}:`, error.message);
      }
    }
  }

  await walk(dir);
  return files;
}

export function detectLanguage(code) {
  const lines = code.split('\n').slice(0, 5);
  const content = lines.join('\n');

  for (const [lang, patterns] of Object.entries(CONFIG.languageDetection)) {
    if (patterns.some(pattern => content.includes(pattern))) {
      return lang;
    }
  }

  return CONFIG.defaultLanguage;
}

function findPreviousHeading(lines, currentIndex) {
  for (let i = currentIndex - 1; i >= 0; i--) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      return {
        level: headingMatch[1].length,
        text: headingMatch[2],
        index: i,
      };
    }
  }
  return null;
}

function isInsideList(lines, currentIndex) {
  for (let i = currentIndex - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === '') return false;
    if (/^[-*+]\s/.test(line) || /^\d+\.\s/.test(line)) {
      return true;
    }
  }
  return false;
}

function detectListIndent(lines, currentIndex) {
  for (let i = currentIndex - 1; i >= 0; i--) {
    const line = lines[i];
    const match = line.match(/^(\s*)([-*+]|\d+\.)\s/);
    if (match) {
      return match[1] + '  ';
    }
  }
  return '  ';
}

function extractBoldItalicText(line) {
  return line
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/^__(.+)__$/, '$1')
    .replace(/^\*(.+)\*$/, '$1')
    .replace(/^_(.+)_$/, '$1')
    .trim();
}

function isBoldItalicParagraph(line) {
  const trimmed = line.trim();
  return (
    /^\*\*[^*]+\*\*$/.test(trimmed) ||
    /^__[^_]+__$/.test(trimmed) ||
    (/^\*[^*]+\*$/.test(trimmed) && !trimmed.startsWith('* ')) ||
    (/^_[^_]+_$/.test(trimmed) && !trimmed.startsWith('_ '))
  );
}

function isBlockElement(line) {
  return blockType(line) !== null;
}

/**
 * Classify a line's block type. Consecutive lines of a "groupable" type
 * (table, list, quote) belong to the same block and must NOT be separated
 * by blank lines — a blank line inside a table breaks rendering entirely.
 */
function blockType(line) {
  const trimmed = line.trim();
  if (/^#{1,6}\s/.test(trimmed)) return 'heading';
  if (/^```/.test(trimmed)) return 'fence';
  if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) return 'list';
  if (/^>/.test(trimmed)) return 'quote';
  if (/^---$/.test(trimmed)) return 'hr';
  if (/^\|/.test(trimmed)) return 'table';
  return null;
}

const GROUPABLE_TYPES = new Set(['table', 'list', 'quote']);

// ============================================================================
// Fix Functions (same as FigmailAPP version)
// ============================================================================

export function fixLineBreaks(lines) {
  const fixed = [];
  let inCodeBlock = false;

  // Skip YAML frontmatter entirely
  let start = 0;
  if (lines[0] && lines[0].trim() === '---') {
    const close = lines.findIndex((l, idx) => idx > 0 && l.trim() === '---');
    if (close !== -1) {
      for (let i = 0; i <= close; i++) fixed.push(lines[i]);
      start = close + 1;
    }
  }

  for (let i = start; i < lines.length; i++) {
    const current = lines[i];
    const previous = i > 0 ? lines[i - 1] : undefined;
    const next = lines[i + 1];

    const currentType = blockType(current);

    // Inside fenced code blocks: pass lines through untouched
    if (inCodeBlock) {
      fixed.push(current);
      if (currentType === 'fence') {
        inCodeBlock = false;
        // Closing fence needs a blank line after (MD031)
        if (next !== undefined && next.trim() !== '') {
          fixed.push('');
        }
      }
      continue;
    }

    const previousType = previous !== undefined ? blockType(previous) : null;
    const currentIsBlank = current.trim() === '';
    const previousIsBlank = previous ? previous.trim() === '' : true;
    const nextIsBlank = next ? next.trim() === '' : true;

    // Consecutive rows of the same groupable block (table/list/quote) must
    // stay tight — a blank line between table rows breaks the table.
    const continuesGroup = GROUPABLE_TYPES.has(currentType) && previousType === currentType;

    if (currentType && !previousIsBlank && previous !== undefined && !continuesGroup) {
      fixed.push('');
    }

    fixed.push(current);

    if (currentType === 'fence') {
      inCodeBlock = true;
      continue;
    }

    if (currentType && !nextIsBlank && next !== undefined && !isBlockElement(next)) {
      fixed.push('');
    }

    if (currentIsBlank && previousIsBlank) {
      fixed.pop();
    }
  }

  return fixed;
}

export function fixCodeBlockLanguages(lines) {
  const fixed = [];
  let inCodeBlock = false;
  let codeBlockStart = -1;
  let codeBlockContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockStart = i;
        codeBlockContent = [];

        const lang = trimmed.substring(3).trim();

        if (lang === '') {
          fixed.push(line);
        } else {
          fixed.push(line);
        }
      } else {
        inCodeBlock = false;

        const openingLine = fixed[codeBlockStart];
        if (openingLine.trim() === '```') {
          const detectedLang = detectLanguage(codeBlockContent.join('\n'));
          fixed[codeBlockStart] = openingLine.replace('```', '```' + detectedLang);
        }

        fixed.push(line);
        codeBlockContent = [];
      }
    } else {
      fixed.push(line);
      if (inCodeBlock) {
        codeBlockContent.push(line);
      }
    }
  }

  return fixed;
}

export function fixBoldItalicToHeadingsOrLists(lines) {
  const fixed = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isBoldItalicParagraph(line)) {
      const text = extractBoldItalicText(line);
      const insideList = isInsideList(lines, i);

      if (insideList) {
        const indent = detectListIndent(lines, i);
        fixed.push(`${indent}- ${text}`);
      } else {
        const previousHeading = findPreviousHeading(lines, i);

        if (previousHeading) {
          const newLevel = Math.min(previousHeading.level + 1, 6);
          fixed.push(`${'#'.repeat(newLevel)} ${text}`);
        } else {
          fixed.push(`### ${text}`);
        }
      }
    } else {
      fixed.push(line);
    }
  }

  return fixed;
}

// ============================================================================
// Dictionary
// ============================================================================

/**
 * Expand shorthand and normalise product-name casing from config/dictionary.json.
 *
 * Same `lines[] → lines[]` shape as the other passes, so it drops straight
 * into the convergence loop in processors/lint-processor.mjs.
 *
 * Rewrites are word-boundary matched and case-preserving: a lowercase key
 * matches `Maj` and `MAJ`, and the replacement adopts the same casing. Nothing
 * is touched inside frontmatter, fenced code, inline code, link targets, or
 * URLs — the pass masks those regions, rewrites the remainder, then splices
 * the masked spans back so offsets never shift under it.
 *
 * Disabled by default via `enabled: false` in the dictionary file; pass
 * `{ force: true }` to run it regardless (used by tests and by an explicit
 * slash-command invocation).
 *
 * @param {string[]} lines
 * @param {{locale?: 'en'|'fr', force?: boolean}} [options]
 * @returns {string[]}
 */
export function applyDictionary(lines, options = {}) {
  const dict = loadDictionary();
  if (!dict) return lines;
  if (dict.enabled === false && !options.force) return lines;

  const locale = options.locale ?? detectDictionaryLocale(lines);
  const entries = [
    ...Object.entries(dict.expansions?.[locale] ?? {}),
    ...Object.entries(dict.normalisations ?? {}),
  ];
  if (entries.length === 0) return lines;

  const protectedTerms = dict.protected ?? [];

  // Longest keys first so a longer phrase wins over a prefix of it
  const rules = entries
    .sort((a, b) => b[0].length - a[0].length)
    .map(([from, to]) => ({
      re: new RegExp(`(?<![\\p{L}\\p{N}_-])${escapeRegExp(from)}(?![\\p{L}\\p{N}_-])`, 'giu'),
      to,
    }));

  const out = [];
  let inFence = false;
  let inFrontmatter = lines[0]?.trim() === '---';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inFrontmatter) {
      out.push(line);
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(line.trim())) inFrontmatter = false;
      continue;
    }
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence || protectedTerms.some(t => line.includes(t))) {
      out.push(line);
      continue;
    }

    out.push(rewriteLine(line, rules));
  }

  return out;
}

/** Spans that must survive a dictionary rewrite untouched. */
const DICT_SKIP = /`+[^`]*`+|!?\[[^\]]*\]\([^)]*\)|\b[a-z][a-z0-9+.-]*:\/\/\S+|\S*\/\S*\.\w+/gi;

/**
 * Apply the rules to the prose portions of a line, leaving code, links, and
 * URLs byte-identical.
 *
 * @param {string} line
 * @param {{re: RegExp, to: string}[]} rules
 * @returns {string}
 */
function rewriteLine(line, rules) {
  const parts = [];
  let cursor = 0;

  for (const m of line.matchAll(DICT_SKIP)) {
    parts.push({ text: line.slice(cursor, m.index), rewrite: true });
    parts.push({ text: m[0], rewrite: false });
    cursor = m.index + m[0].length;
  }
  parts.push({ text: line.slice(cursor), rewrite: true });

  return parts
    .map(part => {
      if (!part.rewrite) return part.text;
      let text = part.text;
      for (const { re, to } of rules) {
        text = text.replace(re, match => matchCase(match, to));
      }
      return text;
    })
    .join('');
}

/**
 * Apply the casing of the matched text to the replacement, so `Maj` expands to
 * `Mise à jour` and `MAJ` to `MISE À JOUR`.
 *
 * @param {string} match
 * @param {string} replacement
 * @returns {string}
 */
function matchCase(match, replacement) {
  if (match === match.toUpperCase() && match !== match.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (match[0] === match[0].toUpperCase() && match.slice(1) === match.slice(1).toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Read `lang:` out of frontmatter; default English. */
function detectDictionaryLocale(lines) {
  if (lines[0]?.trim() !== '---') return 'en';
  for (let i = 1; i < lines.length; i++) {
    if (/^(---|\.\.\.)\s*$/.test(lines[i].trim())) break;
    const m = lines[i].match(/^lang\s*:\s*["']?([a-z]{2})/i);
    if (m) return m[1].toLowerCase() === 'fr' ? 'fr' : 'en';
  }
  return 'en';
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let dictionaryCache;

/** Load config/dictionary.json once. Returns null when absent or malformed. */
function loadDictionary() {
  if (dictionaryCache !== undefined) return dictionaryCache;
  try {
    const dictPath = new URL('../config/dictionary.json', import.meta.url);
    dictionaryCache = JSON.parse(readFileSync(dictPath, 'utf-8'));
  } catch {
    dictionaryCache = null;
  }
  return dictionaryCache;
}

// ============================================================================
// Main Processing
// ============================================================================

async function processFile(filePath, options = {}) {
  const { dryRun = false, verbose = false } = options;

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    let processed = lines;
    const fixes = [];

    if (CONFIG.fixes.lineBreaks) {
      const before = processed.join('\n');
      processed = fixLineBreaks(processed);
      const after = processed.join('\n');
      if (before !== after) fixes.push('line-breaks');
    }

    if (CONFIG.fixes.codeBlockLanguages) {
      const before = processed.join('\n');
      processed = fixCodeBlockLanguages(processed);
      const after = processed.join('\n');
      if (before !== after) fixes.push('code-languages');
    }

    if (CONFIG.fixes.boldItalicToHeadings || CONFIG.fixes.boldItalicInLists) {
      const before = processed.join('\n');
      processed = fixBoldItalicToHeadingsOrLists(processed);
      const after = processed.join('\n');
      if (before !== after) fixes.push('bold-italic-conversion');
    }

    const newContent = processed.join('\n');

    if (content === newContent) {
      if (verbose) {
        console.log(`✓ ${filePath} - No changes needed`);
      }
      return { filePath, changed: false, fixes: [] };
    }

    if (!dryRun) {
      await fs.writeFile(filePath, newContent, 'utf-8');
    }

    if (verbose || dryRun) {
      const status = dryRun ? '[DRY-RUN]' : '✓';
      console.log(`${status} ${filePath} - Fixed: ${fixes.join(', ')}`);
    }

    return {
      filePath,
      changed: true,
      fixes,
      linesChanged: Math.abs(lines.length - processed.length),
    };
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
    return { filePath, changed: false, fixes: [], error: error.message };
  }
}

async function main() {
  const args = process.argv.slice(2);

  const options = {
    dryRun: args.includes('--dry-run') || args.includes('--dry'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    check: args.includes('--check'),
    all: args.includes('--all'),
    report: args.includes('--report'),
  };

  const targetArg = args.find(arg => !arg.startsWith('--') && !arg.startsWith('-'));
  const targetPath = targetArg || '.';

  console.log('🔧 Markdown Auto-Fix (Cross-Repository)');
  console.log('=======================================\n');

  if (options.dryRun) {
    console.log('Mode: DRY RUN (no files will be modified)\n');
  }

  if (options.check) {
    console.log('Mode: CHECK ONLY (no fixes applied)\n');
    options.dryRun = true;
  }

  console.log(`Scanning: ${targetPath}\n`);

  let filteredFiles = [];

  try {
    const stats = await fs.stat(targetPath);

    if (stats.isFile()) {
      if (/\.(md|mdx)$/.test(targetPath)) {
        filteredFiles = [path.resolve(targetPath)];
      }
    } else if (stats.isDirectory()) {
      const allFiles = await findMarkdownFiles(targetPath, CONFIG.exclude);
      filteredFiles = allFiles;
    }
  } catch (error) {
    console.error(`Error accessing ${targetPath}:`, error.message);
    return;
  }

  if (filteredFiles.length === 0) {
    console.log('No markdown files found.');
    return;
  }

  console.log(`Found ${filteredFiles.length} markdown files\n`);

  const results = [];
  for (const file of filteredFiles) {
    const result = await processFile(file, options);
    results.push(result);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60) + '\n');

  const changed = results.filter(r => r.changed);
  const unchanged = results.filter(r => !r.changed);
  const errors = results.filter(r => r.error);

  console.log(`Total files:    ${results.length}`);
  console.log(`Changed:        ${changed.length}`);
  console.log(`Unchanged:      ${unchanged.length}`);
  console.log(`Errors:         ${errors.length}`);

  if (changed.length > 0) {
    console.log('\nFixes Applied:');
    const fixCounts = {};
    changed.forEach(r => {
      r.fixes.forEach(fix => {
        fixCounts[fix] = (fixCounts[fix] || 0) + 1;
      });
    });
    Object.entries(fixCounts).forEach(([fix, count]) => {
      console.log(`  - ${fix}: ${count} files`);
    });
  }

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(r => {
      console.log(`  ✗ ${r.filePath}: ${r.error}`);
    });
  }

  if (options.report) {
    const reportPath = `index/fix-${Date.now()}.json`;
    const reportDir = path.dirname(reportPath);

    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(
      reportPath,
      JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)
    );

    console.log(`\nReport saved to: ${reportPath}`);
  }

  console.log('\n✓ Done!\n');
}

// Only run the CLI when executed directly — this module is also imported by
// daemon/mcp-server.mjs for its fix functions, and importing must never
// trigger a repository-wide fix pass.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(console.error);
}
