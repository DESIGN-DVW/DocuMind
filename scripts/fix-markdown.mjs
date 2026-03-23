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
import path from 'path';
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
  const trimmed = line.trim();
  return (
    /^#{1,6}\s/.test(trimmed) ||
    /^[-*+]\s/.test(trimmed) ||
    /^\d+\.\s/.test(trimmed) ||
    /^```/.test(trimmed) ||
    /^>/.test(trimmed) ||
    /^---$/.test(trimmed) ||
    /^\|/.test(trimmed)
  );
}

// ============================================================================
// Fix Functions (same as FigmailAPP version)
// ============================================================================

export function fixLineBreaks(lines) {
  const fixed = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const previous = lines[i - 1];
    const next = lines[i + 1];

    const currentIsBlock = isBlockElement(current);
    const previousIsBlock = previous ? isBlockElement(previous) : false;

    const currentIsBlank = current.trim() === '';
    const previousIsBlank = previous ? previous.trim() === '' : true;
    const nextIsBlank = next ? next.trim() === '' : true;

    if (currentIsBlock && !previousIsBlank && previous !== undefined) {
      fixed.push('');
    }

    fixed.push(current);

    if (currentIsBlock && !nextIsBlank && next !== undefined && !isBlockElement(next)) {
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

main().catch(console.error);
