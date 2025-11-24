#!/usr/bin/env node

/**
 * Custom Markdown Error Fix Script
 *
 * Automatically fixes custom markdown error patterns defined in custom-error-patterns.json.
 * Only fixes patterns marked as "automated" - leaves "ai-assisted" for manual/agent review.
 *
 * @version 1.0.0
 * @created 2025-11-13
 */

import fs from 'fs/promises';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  basePath: '/Users/Shared/htdocs/github/DVWDesign',
  repositories: [
    'DocuMind',
    'RootDispatcher',
    'Figma-Plug-ins',
    'LibraryAssetManager',
    'GlossiaApp',
    'FigmaAPI/FigmailAPP',
    'FigmaAPI/FigmaDSController',
  ],
  exclude: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/index/**',
    '**/.next/**',
    '**/.cache/**',
  ],
  patternsFile: path.join(__dirname, '../config/custom-error-patterns.json'),
};

// Load patterns from JSON
let PATTERNS;
try {
  PATTERNS = JSON.parse(readFileSync(CONFIG.patternsFile, 'utf8'));
} catch (error) {
  console.error(`❌ Failed to load patterns from ${CONFIG.patternsFile}`);
  process.exit(1);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Find all markdown files in a directory
 */
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

/**
 * Get line number from string index
 */
function getLineNumber(content, index) {
  return content.substring(0, index).split('\n').length;
}

// ============================================================================
// Fix Functions (Automated Patterns Only)
// ============================================================================

/**
 * Fix trailing whitespace
 */
function fixTrailingSpaces(content) {
  const lines = content.split('\n');
  const fixed = lines.map(line => line.replace(/\s+$/, ''));
  return { content: fixed.join('\n'), changed: content !== fixed.join('\n') };
}

/**
 * Fix inconsistent list indentation (standardize to 2 spaces)
 */
function fixListIndentation(content) {
  let changed = false;
  const lines = content.split('\n');

  const fixed = lines.map(line => {
    // Match lines with 4+ spaces before list marker
    const match = line.match(/^(\s{4,})([-*+])\s+/);
    if (match) {
      const indent = match[1];
      const marker = match[2];
      // Convert to 2-space increments
      const level = Math.floor(indent.length / 4);
      const newIndent = '  '.repeat(level);
      const newLine = line.replace(/^(\s{4,})([-*+])\s+/, `${newIndent}${marker} `);
      if (newLine !== line) changed = true;
      return newLine;
    }
    return line;
  });

  return { content: fixed.join('\n'), changed };
}

/**
 * Fix table header separators
 * Adds missing separator line after table headers
 */
function fixTableSeparators(content) {
  let changed = false;
  const lines = content.split('\n');
  const fixed = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    fixed.push(line);

    // Check if this is a table header (starts with |, contains |, ends with |)
    if (/^\|(.+\|)+$/.test(line)) {
      const nextLine = lines[i + 1];

      // Check if next line is NOT a separator
      if (nextLine && !/^\|[-:\s]+\|/.test(nextLine) && /^\|(.+\|)+$/.test(nextLine)) {
        // Count columns in header
        const columns = line.split('|').length - 2; // Remove empty first/last
        const separator = '|' + ' --- |'.repeat(columns);

        fixed.push(separator);
        changed = true;
      }
    }
  }

  return { content: fixed.join('\n'), changed };
}

/**
 * Fix table column alignment
 * Ensures all rows have same number of columns as header
 */
function fixTableAlignment(content) {
  let changed = false;
  const lines = content.split('\n');
  const fixed = [];
  let inTable = false;
  let expectedColumns = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\|(.+\|)+$/.test(line)) {
      const columns = line.split('|').filter(c => c.trim()).length;

      // Start of table or separator
      if (!inTable || /^\|[-:\s]+\|/.test(line)) {
        inTable = true;
        expectedColumns = columns;
        fixed.push(line);
      } else {
        // Data row - check column count
        if (columns !== expectedColumns) {
          // Pad or trim to match expected
          const cells = line.split('|').filter(c => c.trim());
          if (cells.length < expectedColumns) {
            // Add empty cells
            while (cells.length < expectedColumns) {
              cells.push(' ');
            }
          } else {
            // Trim excess cells
            cells.splice(expectedColumns);
          }
          const fixedLine = '| ' + cells.join(' | ') + ' |';
          fixed.push(fixedLine);
          changed = true;
        } else {
          fixed.push(line);
        }
      }
    } else {
      inTable = false;
      expectedColumns = 0;
      fixed.push(line);
    }
  }

  return { content: fixed.join('\n'), changed };
}

/**
 * Fix skipped heading levels
 * Converts H4 to H3 when preceded by H2, etc.
 */
function fixSkippedHeadingLevels(content) {
  let changed = false;
  const lines = content.split('\n');
  const fixed = [];
  let lastHeadingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const currentLevel = headingMatch[1].length;
      const text = headingMatch[2];

      // Check if we skipped a level
      if (lastHeadingLevel > 0 && currentLevel > lastHeadingLevel + 1) {
        // Reduce to lastLevel + 1
        const correctLevel = lastHeadingLevel + 1;
        const fixedLine = '#'.repeat(correctLevel) + ' ' + text;
        fixed.push(fixedLine);
        changed = true;
        lastHeadingLevel = correctLevel;
      } else {
        fixed.push(line);
        lastHeadingLevel = currentLevel;
      }
    } else {
      fixed.push(line);
    }
  }

  return { content: fixed.join('\n'), changed };
}

/**
 * Fix nested code blocks
 * Ensures code blocks are properly closed before next one starts
 */
function fixNestedCodeBlocks(content) {
  let changed = false;
  const lines = content.split('\n');
  const fixed = [];
  let inCodeBlock = false;
  let codeBlockStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^```/.test(line)) {
      if (inCodeBlock) {
        // Closing code block
        inCodeBlock = false;
        fixed.push(line);
      } else {
        // Opening code block
        inCodeBlock = true;
        codeBlockStart = i;
        fixed.push(line);
      }
    } else {
      fixed.push(line);
    }
  }

  // If still in code block at end, close it
  if (inCodeBlock) {
    fixed.push('```');
    changed = true;
  }

  return { content: fixed.join('\n'), changed };
}

/**
 * Fix broken internal links
 * Reports broken links but doesn't auto-fix (just validates)
 */
function validateInternalLinks(content, filePath) {
  const brokenLinks = [];
  const linkRegex = /\[.+?\]\((?!http)([^\)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const linkPath = match[1];
    const absolutePath = path.resolve(path.dirname(filePath), linkPath.split('#')[0]);

    if (!existsSync(absolutePath)) {
      brokenLinks.push({
        link: linkPath,
        line: getLineNumber(content, match.index),
      });
    }
  }

  return brokenLinks;
}

/**
 * Remove excessive horizontal rules
 * Keeps max 3 per document
 */
function fixExcessiveHorizontalRules(content) {
  let changed = false;
  const lines = content.split('\n');
  let hrCount = 0;
  const maxHR = 3;

  const fixed = lines.map(line => {
    if (/^---+$/.test(line)) {
      hrCount++;
      if (hrCount > maxHR) {
        changed = true;
        return ''; // Remove excess
      }
    }
    return line;
  });

  return { content: fixed.join('\n').replace(/\n{3,}/g, '\n\n'), changed };
}

// ============================================================================
// Main Fix Logic
// ============================================================================

/**
 * Apply all automated fixes to a file
 */
async function fixFile(filePath, dryRun = false) {
  try {
    const originalContent = await fs.readFile(filePath, 'utf8');
    let content = originalContent;
    const fixes = [];

    // Apply each automated fix
    const fixFunctions = [
      { name: 'Trailing Spaces', fn: fixTrailingSpaces },
      { name: 'List Indentation', fn: fixListIndentation },
      { name: 'Table Separators', fn: fixTableSeparators },
      { name: 'Table Alignment', fn: fixTableAlignment },
      { name: 'Skipped Heading Levels', fn: fixSkippedHeadingLevels },
      { name: 'Nested Code Blocks', fn: fixNestedCodeBlocks },
      { name: 'Excessive Horizontal Rules', fn: fixExcessiveHorizontalRules },
    ];

    for (const { name, fn } of fixFunctions) {
      const result = fn(content);
      if (result.changed) {
        content = result.content;
        fixes.push(name);
      }
    }

    // Validate internal links (report only)
    const brokenLinks = validateInternalLinks(content, filePath);

    if (fixes.length > 0 || brokenLinks.length > 0) {
      if (!dryRun && fixes.length > 0) {
        await fs.writeFile(filePath, content, 'utf8');
      }

      return {
        file: filePath,
        fixes,
        brokenLinks,
        changed: fixes.length > 0,
      };
    }

    return null;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Process a single repository
 */
async function processRepository(repoPath, dryRun = false) {
  console.log(`\n📂 Processing: ${path.basename(repoPath)}`);

  if (!existsSync(repoPath)) {
    console.log(`   ⚠️  Repository not found: ${repoPath}`);
    return { processed: 0, fixed: 0, errors: [] };
  }

  const files = await findMarkdownFiles(repoPath, CONFIG.exclude);
  console.log(`   Found ${files.length} markdown files`);

  const results = [];
  let fixedCount = 0;

  for (const file of files) {
    const result = await fixFile(file, dryRun);
    if (result) {
      results.push(result);
      if (result.changed) fixedCount++;
    }
  }

  // Report
  if (results.length > 0) {
    console.log(`\n   ✅ Fixed ${fixedCount} files:`);
    for (const result of results) {
      const relativePath = path.relative(repoPath, result.file);
      if (result.fixes.length > 0) {
        console.log(`      ${relativePath}`);
        console.log(`         Fixes: ${result.fixes.join(', ')}`);
      }
      if (result.brokenLinks.length > 0) {
        console.log(`         ⚠️  Broken links: ${result.brokenLinks.length}`);
        result.brokenLinks.forEach(link => {
          console.log(`            Line ${link.line}: ${link.link}`);
        });
      }
    }
  } else {
    console.log(`   ✨ No issues found`);
  }

  return {
    processed: files.length,
    fixed: fixedCount,
    errors: results.filter(r => r.brokenLinks.length > 0),
  };
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const allRepos = args.includes('--all');
  const targetDir = args.find(arg => !arg.startsWith('--'));

  console.log('🔧 Custom Markdown Error Fix Script');
  console.log('=====================================');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  let totalProcessed = 0;
  let totalFixed = 0;
  let totalErrors = [];

  if (allRepos) {
    // Process all repositories
    console.log('\n📦 Processing all repositories...\n');

    for (const repo of CONFIG.repositories) {
      const repoPath = path.join(CONFIG.basePath, repo);
      const stats = await processRepository(repoPath, dryRun);
      totalProcessed += stats.processed;
      totalFixed += stats.fixed;
      totalErrors.push(...stats.errors);
    }
  } else if (targetDir) {
    // Process specific directory
    const stats = await processRepository(targetDir, dryRun);
    totalProcessed += stats.processed;
    totalFixed += stats.fixed;
    totalErrors.push(...stats.errors);
  } else {
    // Process current repository (DocuMind)
    const currentRepo = path.join(CONFIG.basePath, 'DocuMind');
    const stats = await processRepository(currentRepo, dryRun);
    totalProcessed += stats.processed;
    totalFixed += stats.fixed;
    totalErrors.push(...stats.errors);
  }

  // Summary
  console.log('\n=====================================');
  console.log('📊 Summary');
  console.log('=====================================');
  console.log(`Total files processed: ${totalProcessed}`);
  console.log(`Total files fixed: ${totalFixed}`);
  console.log(`Files with broken links: ${totalErrors.length}`);

  if (dryRun) {
    console.log('\n💡 Run without --dry-run to apply fixes');
  }

  console.log('\n✨ Done!\n');

  // Exit code based on whether fixes were needed
  process.exit(totalFixed > 0 ? 1 : 0);
}

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
