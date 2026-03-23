#!/usr/bin/env node

/**
 * Fix GitHub Organization References
 *
 * This script fixes all incorrect GitHub organization references across all repositories.
 * It replaces:
 * - github.com/DVWDesign → github.com/DESIGN-DVW
 * - github.com/FigmaAPI/* → github.com/DESIGN-DVW/*
 * - "DVWDesign organization" → "DESIGN-DVW organization"
 *
 * @module scripts/fix-github-org-references
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { globSync } from 'glob';
import chalk from 'chalk';
import { LOCAL_BASE_PATH } from '../config/constants.mjs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_PATH = LOCAL_BASE_PATH;

const REPOSITORIES = [
  'DocuMind',
  'RootDispatcher',
  'Figma-Plug-ins',
  'LibraryAssetManager',
  'Aprimo',
  'CampaignManager',
  'GlossiaApp',
  'FigmaAPI/@figma-core',
  'FigmaAPI/@figma-docs',
  'FigmaAPI/FigmailAPP',
  'FigmaAPI/FigmaDSController',
];

const FILE_PATTERNS = ['**/*.md', '**/*.json', '**/*.mjs', '**/*.js'];

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/index/**',
  '**/.backups/**',
];

// ============================================================================
// REPLACEMENT RULES
// ============================================================================

const REPLACEMENTS = [
  // Fix incorrect GitHub organization URLs
  {
    pattern: /github\.com\/DVWDesign\//g,
    replacement: 'github.com/DESIGN-DVW/',
    description: 'Fix DVWDesign → DESIGN-DVW in URLs',
  },

  // Fix FigmaAPI references (FigmaAPI doesn't exist on GitHub)
  {
    pattern: /github\.com\/DESIGN-DVW\/FigmaAPI\/FigmailAPP/g,
    replacement: 'github.com/DESIGN-DVW/FigmailAPP',
    description: 'Fix FigmaAPI/FigmailAPP → FigmailAPP',
  },
  {
    pattern: /github\.com\/DESIGN-DVW\/FigmaAPI\/FigmaDSController/g,
    replacement: 'github.com/DESIGN-DVW/FigmaDSController',
    description: 'Fix FigmaAPI/FigmaDSController → FigmaDSController',
  },
  {
    pattern: /github\.com\/DESIGN-DVW\/FigmaAPI\/@figma-core/g,
    replacement: 'github.com/DESIGN-DVW/@figma-core',
    description: 'Fix FigmaAPI/@figma-core → @figma-core',
  },
  {
    pattern: /github\.com\/DESIGN-DVW\/FigmaAPI\/@figma-docs/g,
    replacement: 'github.com/DESIGN-DVW/@figma-docs',
    description: 'Fix FigmaAPI/@figma-docs → @figma-docs',
  },
  {
    pattern: /github\.com\/DESIGN-DVW\/FigmaAPI\/Figma-DAM/g,
    replacement: 'github.com/DESIGN-DVW/Figma-DAM',
    description: 'Fix FigmaAPI/Figma-DAM → Figma-DAM',
  },
  {
    pattern: /github\.com\/DESIGN-DVW\/FigmaAPI\/Figma-Plug-ins/g,
    replacement: 'github.com/DESIGN-DVW/Figma-Plug-ins',
    description: 'Fix FigmaAPI/Figma-Plug-ins → Figma-Plug-ins',
  },
  {
    pattern: /github\.com\/DESIGN-DVW\/FigmaAPI\/FigmaRestAPI/g,
    replacement: 'github.com/DESIGN-DVW/FigmaRestAPI',
    description: 'Fix FigmaAPI/FigmaRestAPI → FigmaRestAPI',
  },

  // Fix text references to organization name
  {
    pattern: /DVWDesign [Oo]rganization/g,
    replacement: 'DESIGN-DVW organization',
    description: 'Fix "DVWDesign organization" → "DESIGN-DVW organization"',
  },
  {
    pattern: /for DVWDesign/g,
    replacement: 'for DESIGN-DVW',
    description: 'Fix "for DVWDesign" → "for DESIGN-DVW"',
  },
  {
    pattern: /of DVWDesign/g,
    replacement: 'of DESIGN-DVW',
    description: 'Fix "of DVWDesign" → "of DESIGN-DVW"',
  },
  {
    pattern: /@DVWDesign/g,
    replacement: '@DESIGN-DVW',
    description: 'Fix @DVWDesign → @DESIGN-DVW (in links)',
  },

  // Fix generic FigmaAPI references (when not a local path)
  {
    pattern: /github\.com\/DESIGN-DVW\/FigmaAPI/g,
    replacement: 'github.com/DESIGN-DVW',
    description: 'Remove orphaned FigmaAPI references',
  },
];

// Special case: Don't replace these patterns
const EXCEPTIONS = [
  // Keep local file paths as-is
  /\/Users\/Shared\/htdocs\/github\/DVWDesign\//,
  // Keep package scope in package.json name field (handled separately)
  /"name": "@dvwdesign\//,
  // Keep BBEdit project references
  /\.bbproject/,
];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function fixGitHubOrgReferences() {
  console.log(chalk.bold.cyan('\n🔧 Fixing GitHub Organization References\n'));

  const stats = {
    totalFiles: 0,
    modifiedFiles: 0,
    totalReplacements: 0,
    byType: {},
  };

  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');

  if (dryRun) {
    console.log(chalk.yellow('📋 DRY RUN MODE - No files will be modified\n'));
  }

  // Process each repository
  for (const repo of REPOSITORIES) {
    const repoPath = join(BASE_PATH, repo);
    console.log(chalk.bold(`\n📂 Processing: ${repo}`));

    // Find all files matching patterns
    const files = globSync(FILE_PATTERNS, {
      cwd: repoPath,
      ignore: IGNORE_PATTERNS,
      absolute: true,
      nodir: true,
    });

    console.log(chalk.gray(`   Found ${files.length} files to check`));

    // Process each file
    for (const file of files) {
      try {
        let content = readFileSync(file, 'utf8');
        const originalContent = content;
        let fileModified = false;
        let replacementCount = 0;

        // Check if file should be skipped (based on exceptions)
        const shouldSkip = EXCEPTIONS.some(pattern => pattern.test(content));
        if (shouldSkip && content === originalContent) {
          // Only skip if it's entirely exception-based content
          continue;
        }

        // Apply each replacement rule
        for (const rule of REPLACEMENTS) {
          const before = content;
          content = content.replace(rule.pattern, rule.replacement);

          if (content !== before) {
            fileModified = true;
            const count = (before.match(rule.pattern) || []).length;
            replacementCount += count;

            if (!stats.byType[rule.description]) {
              stats.byType[rule.description] = 0;
            }
            stats.byType[rule.description] += count;

            if (verbose) {
              console.log(chalk.green(`   ✓ ${rule.description}: ${count} replacement(s)`));
            }
          }
        }

        // Write file if modified
        if (fileModified && content !== originalContent) {
          stats.modifiedFiles++;
          stats.totalReplacements += replacementCount;

          const relativePath = file.replace(BASE_PATH + '/', '');
          console.log(
            chalk.green(`   ✓ Modified: ${relativePath} (${replacementCount} replacements)`)
          );

          if (!dryRun) {
            writeFileSync(file, content, 'utf8');
          }
        }

        stats.totalFiles++;
      } catch (error) {
        console.log(chalk.red(`   ✗ Error processing ${file}: ${error.message}`));
      }
    }
  }

  // Print summary
  console.log(chalk.bold.cyan('\n📊 Summary\n'));
  console.log(`Total files scanned: ${stats.totalFiles}`);
  console.log(`Files modified: ${chalk.green(stats.modifiedFiles)}`);
  console.log(`Total replacements: ${chalk.green(stats.totalReplacements)}`);

  if (Object.keys(stats.byType).length > 0) {
    console.log(chalk.bold('\n📋 Replacements by type:\n'));
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`   ${chalk.green(count.toString().padStart(3))} × ${type}`);
    }
  }

  if (dryRun) {
    console.log(chalk.yellow('\n⚠️  This was a DRY RUN - no files were actually modified'));
    console.log(chalk.yellow('   Run without --dry-run to apply changes\n'));
  } else {
    console.log(chalk.bold.green('\n✅ All references updated successfully!\n'));
  }
}

// ============================================================================
// RUN
// ============================================================================

fixGitHubOrgReferences().catch(error => {
  console.error(chalk.red('\n❌ Error:'), error.message);
  process.exit(1);
});
