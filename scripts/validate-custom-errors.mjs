#!/usr/bin/env node

/**
 * Custom Markdown Error Validator
 *
 * Detects advanced markdown errors beyond standard linter capabilities.
 * Uses pattern matching, context analysis, and file system validation.
 *
 * @module scripts/validate-custom-errors
 * @version 1.0.0
 * @created 2025-11-13
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { globSync } from 'glob';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_PATH = resolve(__dirname, '..');
const CONFIG_PATH = join(BASE_PATH, 'config/custom-error-patterns.json');

// Load pattern configuration
let PATTERNS;
try {
  PATTERNS = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
} catch (error) {
  console.error(chalk.red('Error loading pattern configuration:'), error.message);
  process.exit(1);
}

const REPOSITORIES = [
  '.',
  '../RootDispatcher',
  '../Figma-Plug-ins',
  '../LibraryAssetManager',
  '../Aprimo',
  '../CampaignManager',
  '../GlossiaApp',
  '../FigmaAPI/FigmaDSController',
  '../FigmaAPI/FigmailAPP',
];

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/index/**',
  '**/.backups/**',
  '**/dist/**',
  '**/build/**',
];

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate a single markdown file
 * @param {string} filePath - Path to markdown file
 * @param {Object} options - Validation options
 * @returns {Array} Array of validation errors
 */
function validateFile(filePath, options = {}) {
  const errors = [];

  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\\n');
    const fileDir = dirname(filePath);

    // Run each pattern against the content
    for (const pattern of PATTERNS.patterns) {
      // Skip if pattern is disabled or filtered by category
      if (options.category && pattern.category !== options.category) continue;
      if (options.severity && pattern.severity !== options.severity) continue;

      const regex = new RegExp(pattern.regex, pattern.flags || 'g');

      // Standard regex matching
      let match;
      while ((match = regex.exec(content)) !== null) {
        const lineNumber = getLineNumber(content, match.index);

        // Additional validation based on pattern type
        let isValid = true;
        if (pattern.validation) {
          isValid = runValidation(pattern.validation, match, content, filePath, fileDir, lines);
        }

        if (!isValid) {
          errors.push({
            file: filePath,
            line: lineNumber,
            column: getColumnNumber(content, match.index),
            patternId: pattern.id,
            category: pattern.category,
            name: pattern.name,
            severity: pattern.severity,
            description: pattern.description,
            match: match[0],
            fixStrategy: pattern.fixStrategy,
          });
        }
      }
    }

    // Additional complex validations
    errors.push(...validateMixedListTypes(content, filePath));
    errors.push(...validateTableConsistency(content, filePath));
    errors.push(...validateReferenceLinks(content, filePath));
    errors.push(...validateMultipleH1(content, filePath));
  } catch (error) {
    console.error(chalk.red(`Error validating ${filePath}:`), error.message);
  }

  return errors;
}

/**
 * Run special validation logic based on validation type
 */
function runValidation(validationType, match, content, filePath, fileDir, lines) {
  switch (validationType) {
    case 'file-system-check':
      // Check if linked file exists
      const linkPath = match[0].match(/\\(([^)]+)\\)/)?.[1];
      if (linkPath && !linkPath.startsWith('http')) {
        const fullPath = resolve(fileDir, linkPath);
        return existsSync(fullPath);
      }
      return true;

    case 'yaml-parse':
      // Validate YAML frontmatter
      try {
        const yamlContent = match[0].replace(/^---\\n|---$/g, '');
        // Simple YAML validation (could use yaml parser library)
        return yamlContent
          .split('\\n')
          .every(line => line.trim() === '' || line.match(/^\\w+:\\s*.+$/));
      } catch {
        return false;
      }

    case 'pipe-count-consistency':
      // Handled by validateTableConsistency
      return true;

    case 'check-definition-exists':
      // Handled by validateReferenceLinks
      return true;

    default:
      return true;
  }
}

/**
 * Validate mixed list types (numbered + bulleted)
 */
function validateMixedListTypes(content, filePath) {
  const errors = [];
  const lines = content.split('\\n');

  let prevType = null;
  let prevIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const numberedMatch = line.match(/^(\\s*)(\\d+\\.\\s+)/);
    const bulletMatch = line.match(/^(\\s*)([-*]\\s+)/);

    if (numberedMatch || bulletMatch) {
      const indent = (numberedMatch || bulletMatch)[1].length;
      const type = numberedMatch ? 'numbered' : 'bullet';

      // Check if type changed without indentation change
      if (prevType && prevType !== type && indent === prevIndent) {
        errors.push({
          file: filePath,
          line: i + 1,
          column: indent + 1,
          patternId: 'context-numbering-2',
          category: 'Context-Dependent Numbering',
          name: 'Mixed Numbered/Unnumbered Lists',
          severity: 'warning',
          description: `List type changed from ${prevType} to ${type} without nesting`,
          match: line.trim(),
          fixStrategy: 'ai-assisted',
        });
      }

      prevType = type;
      prevIndent = indent;
    } else if (line.trim() === '') {
      // Blank line resets context
      prevType = null;
      prevIndent = 0;
    }
  }

  return errors;
}

/**
 * Validate table column consistency
 */
function validateTableConsistency(content, filePath) {
  const errors = [];
  const lines = content.split('\\n');

  let inTable = false;
  let expectedColumns = 0;
  let tableStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.match(/^\\|(.+\\|)+$/)) {
      const columnCount = (line.match(/\\|/g) || []).length - 1;

      if (!inTable) {
        // First row of table
        inTable = true;
        expectedColumns = columnCount;
        tableStartLine = i + 1;
      } else {
        // Subsequent rows
        if (columnCount !== expectedColumns) {
          errors.push({
            file: filePath,
            line: i + 1,
            column: 1,
            patternId: 'table-1',
            category: 'Table Formatting',
            name: 'Misaligned Table Columns',
            severity: 'error',
            description: `Expected ${expectedColumns} columns, found ${columnCount}`,
            match: line.trim(),
            fixStrategy: 'automated',
          });
        }
      }
    } else if (inTable && line.trim() !== '') {
      // Non-table line, end of table
      inTable = false;
      expectedColumns = 0;
    }
  }

  return errors;
}

/**
 * Validate reference-style links have definitions
 */
function validateReferenceLinks(content, filePath) {
  const errors = [];

  // Extract reference usages
  const refUsages = [];
  const refRegex = /\\[.+?\\]\\[(\\w+)\\]/g;
  let match;
  while ((match = refRegex.exec(content)) !== null) {
    refUsages.push({
      ref: match[1],
      index: match.index,
      full: match[0],
    });
  }

  // Extract reference definitions
  const refDefinitions = new Set();
  const defRegex = /^\\[(\\w+)\\]:/gm;
  while ((match = defRegex.exec(content)) !== null) {
    refDefinitions.add(match[1]);
  }

  // Check for undefined references
  for (const usage of refUsages) {
    if (!refDefinitions.has(usage.ref)) {
      const lineNumber = getLineNumber(content, usage.index);
      errors.push({
        file: filePath,
        line: lineNumber,
        column: getColumnNumber(content, usage.index),
        patternId: 'link-ref-1',
        category: 'Link & Reference',
        name: 'Undefined Reference Links',
        severity: 'error',
        description: `Reference [${usage.ref}] is used but not defined`,
        match: usage.full,
        fixStrategy: 'ai-assisted',
      });
    }
  }

  return errors;
}

/**
 * Validate multiple H1 headings
 */
function validateMultipleH1(content, filePath) {
  const errors = [];
  const h1Regex = /^#\\s+.+$/gm;
  const matches = [];
  let match;

  while ((match = h1Regex.exec(content)) !== null) {
    matches.push({
      index: match.index,
      text: match[0],
    });
  }

  if (matches.length > 1) {
    for (let i = 1; i < matches.length; i++) {
      const lineNumber = getLineNumber(content, matches[i].index);
      errors.push({
        file: filePath,
        line: lineNumber,
        column: 1,
        patternId: 'heading-context-2',
        category: 'Heading Context',
        name: 'Multiple H1 Headings',
        severity: 'warning',
        description: `Found ${matches.length} H1 headings (should be 1)`,
        match: matches[i].text,
        fixStrategy: 'ai-assisted',
      });
    }
  }

  return errors;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getLineNumber(content, index) {
  return content.substring(0, index).split('\\n').length;
}

function getColumnNumber(content, index) {
  const lineStart = content.lastIndexOf('\\n', index) + 1;
  return index - lineStart + 1;
}

// ============================================================================
// REPORTING
// ============================================================================

function generateReport(allErrors, options = {}) {
  console.log(chalk.bold.cyan('\\n📋 Custom Markdown Validation Report\\n'));

  if (allErrors.length === 0) {
    console.log(chalk.green('✅ No custom errors found!\\n'));
    return;
  }

  // Group by category
  const byCategory = {};
  for (const error of allErrors) {
    if (!byCategory[error.category]) {
      byCategory[error.category] = [];
    }
    byCategory[error.category].push(error);
  }

  // Statistics
  const errorCount = allErrors.filter(e => e.severity === 'error').length;
  const warningCount = allErrors.filter(e => e.severity === 'warning').length;

  console.log(chalk.bold('📊 Summary:'));
  console.log(`   Total Issues: ${chalk.yellow(allErrors.length)}`);
  console.log(`   Errors: ${chalk.red(errorCount)}`);
  console.log(`   Warnings: ${chalk.yellow(warningCount)}\\n`);

  // Print by category
  for (const [category, errors] of Object.entries(byCategory)) {
    console.log(chalk.bold(`\\n📂 ${category} (${errors.length} issues)\\n`));

    // Group by file
    const byFile = {};
    for (const error of errors) {
      const relPath = error.file.replace(BASE_PATH + '/', '');
      if (!byFile[relPath]) byFile[relPath] = [];
      byFile[relPath].push(error);
    }

    for (const [file, fileErrors] of Object.entries(byFile)) {
      console.log(chalk.cyan(`   ${file}:`));
      for (const error of fileErrors) {
        const icon = error.severity === 'error' ? '✗' : '⚠';
        const color = error.severity === 'error' ? chalk.red : chalk.yellow;
        console.log(color(`     ${icon} Line ${error.line}:${error.column} - ${error.name}`));
        console.log(chalk.gray(`        ${error.description}`));
        console.log(chalk.gray(`        Fix: ${error.fixStrategy}`));
      }
    }
  }

  // Fix strategy summary
  console.log(chalk.bold('\\n🔧 Fix Strategy Summary:\\n'));
  const byStrategy = {};
  for (const error of allErrors) {
    if (!byStrategy[error.fixStrategy]) byStrategy[error.fixStrategy] = 0;
    byStrategy[error.fixStrategy]++;
  }
  for (const [strategy, count] of Object.entries(byStrategy)) {
    console.log(`   ${strategy}: ${chalk.yellow(count)} issues`);
  }

  console.log('\\n');
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    category: args.find(arg => arg.startsWith('--category='))?.split('=')[1],
    severity: args.find(arg => arg.startsWith('--severity='))?.split('=')[1],
    allRepos: args.includes('--all'),
  };

  console.log(chalk.bold.cyan('\\n🔍 Custom Markdown Error Validation\\n'));

  const reposToScan = options.allRepos ? REPOSITORIES : ['.'];
  const allErrors = [];

  for (const repo of reposToScan) {
    const repoPath = resolve(BASE_PATH, repo);

    if (!existsSync(repoPath)) {
      console.log(chalk.yellow(`⚠ Skipping ${repo} (not found)`));
      continue;
    }

    const repoName = repo === '.' ? 'DocuMind' : repo.split('/').pop();
    console.log(chalk.bold(`📂 Scanning ${repoName}...`));

    // Find all markdown files
    const files = globSync('**/*.md', {
      cwd: repoPath,
      absolute: true,
      ignore: IGNORE_PATTERNS,
    });

    console.log(chalk.gray(`   Found ${files.length} markdown files`));

    // Validate each file
    for (const file of files) {
      const errors = validateFile(file, options);
      if (errors.length > 0) {
        allErrors.push(...errors);
        if (options.verbose) {
          console.log(chalk.yellow(`   ⚠ ${file}: ${errors.length} issues`));
        }
      }
    }
  }

  // Generate report
  generateReport(allErrors, options);

  // Exit code based on errors
  const hasErrors = allErrors.some(e => e.severity === 'error');
  process.exit(hasErrors ? 1 : 0);
}

// ============================================================================
// RUN
// ============================================================================

main().catch(error => {
  console.error(chalk.red('\\n❌ Error:'), error.message);
  process.exit(1);
});
