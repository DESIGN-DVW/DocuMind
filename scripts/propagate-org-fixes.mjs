#!/usr/bin/env node

/**
 * Propagate Organization Fixes to All Repositories
 *
 * This script copies the central configuration and documentation
 * to all active repositories in the DVWDesign workspace.
 *
 * @module scripts/propagate-org-fixes
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { LOCAL_BASE_PATH } from '../config/constants.mjs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_PATH = LOCAL_BASE_PATH;

const SOURCE_REPO = 'DocuMind';

const TARGET_REPOS = [
  'RootDispatcher',
  'Figma-Plug-ins',
  'LibraryAssetManager',
  'Aprimo',
  'CampaignManager',
  'GlossiaApp',
  'FigmaAPI/FigmaDSController',
  'FigmaAPI/FigmailAPP',
];

const FILES_TO_COPY = [
  {
    source: 'config/constants.mjs',
    target: 'config/constants.mjs',
    description: 'Central configuration file',
  },
  {
    source: 'scripts/fix-github-org-references.mjs',
    target: 'scripts/fix-github-org-references.mjs',
    description: 'GitHub org reference fix script',
  },
  {
    source: 'docs/GITHUB-ORGANIZATION-AUDIT-REPORT.md',
    target: 'docs/GITHUB-ORGANIZATION-AUDIT-REPORT.md',
    description: 'Organization audit report',
  },
  {
    source: 'docs/GLOSSIAAPP-MIGRATION-GUIDE.md',
    target: 'docs/GLOSSIAAPP-MIGRATION-GUIDE.md',
    description: 'GlossiaApp migration guide',
  },
  {
    source: 'docs/USER-INVITATION-GUIDE.md',
    target: 'docs/USER-INVITATION-GUIDE.md',
    description: 'User invitation guide',
  },
  {
    source: 'docs/ORGANIZATION-NAMING-FIX-SUMMARY.md',
    target: 'docs/ORGANIZATION-NAMING-FIX-SUMMARY.md',
    description: 'Complete fix summary',
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function ensureDirectoryExists(filePath) {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function copyFile(sourcePath, targetPath, description) {
  try {
    ensureDirectoryExists(targetPath);
    copyFileSync(sourcePath, targetPath);
    return { success: true, description };
  } catch (error) {
    return { success: false, description, error: error.message };
  }
}

function updatePackageJson(repoPath, repoName) {
  const packagePath = join(repoPath, 'package.json');

  if (!existsSync(packagePath)) {
    return { success: false, reason: 'No package.json found' };
  }

  try {
    const content = readFileSync(packagePath, 'utf8');
    const pkg = JSON.parse(content);

    let modified = false;

    // Update name if it uses @dvwdesign
    if (pkg.name && pkg.name.startsWith('@dvwdesign/')) {
      pkg.name = pkg.name.replace('@dvwdesign/', '@design-dvw/');
      modified = true;
    }

    // Update description if it mentions DVWDesign
    if (pkg.description && pkg.description.includes('DVWDesign')) {
      pkg.description = pkg.description.replace(/DVWDesign/g, 'DESIGN-DVW');
      modified = true;
    }

    // Update author if it says DVWDesign
    if (pkg.author === 'DVWDesign') {
      pkg.author = 'DESIGN-DVW';
      modified = true;
    }

    // Add repository info if missing
    if (!pkg.repository) {
      pkg.repository = {
        type: 'git',
        url: `https://github.com/DESIGN-DVW/${repoName}.git`,
      };
      modified = true;
    }

    // Add homepage if missing
    if (!pkg.homepage) {
      pkg.homepage = `https://github.com/DESIGN-DVW/${repoName}`;
      modified = true;
    }

    // Add bugs if missing
    if (!pkg.bugs) {
      pkg.bugs = {
        url: `https://github.com/DESIGN-DVW/${repoName}/issues`,
      };
      modified = true;
    }

    if (modified) {
      writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      return { success: true, modified: true };
    }

    return { success: true, modified: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function propagateOrgFixes() {
  console.log(chalk.bold.cyan('\n🚀 Propagating Organization Fixes\n'));

  const sourcePath = join(BASE_PATH, SOURCE_REPO);

  const stats = {
    totalRepos: TARGET_REPOS.length,
    successfulRepos: 0,
    failedRepos: 0,
    filesCopied: 0,
    filesFailed: 0,
    packagesUpdated: 0,
  };

  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log(chalk.yellow('📋 DRY RUN MODE - No files will be modified\n'));
  }

  // Process each repository
  for (const repo of TARGET_REPOS) {
    const repoPath = join(BASE_PATH, repo);
    const repoName = repo.split('/').pop(); // Get last part for nested repos

    console.log(chalk.bold(`\n📂 Processing: ${repo}`));

    if (!existsSync(repoPath)) {
      console.log(chalk.yellow(`   ⚠️  Repository not found, skipping`));
      stats.failedRepos++;
      continue;
    }

    let repoSuccess = true;

    // Copy files
    for (const file of FILES_TO_COPY) {
      const source = join(sourcePath, file.source);
      const target = join(repoPath, file.target);

      if (!existsSync(source)) {
        console.log(chalk.yellow(`   ⚠️  Source file not found: ${file.source}`));
        continue;
      }

      if (!dryRun) {
        const result = copyFile(source, target, file.description);
        if (result.success) {
          console.log(chalk.green(`   ✓ Copied: ${file.description}`));
          stats.filesCopied++;
        } else {
          console.log(chalk.red(`   ✗ Failed: ${file.description} - ${result.error}`));
          stats.filesFailed++;
          repoSuccess = false;
        }
      } else {
        console.log(chalk.gray(`   Would copy: ${file.description}`));
      }
    }

    // Update package.json
    if (!dryRun) {
      const pkgResult = updatePackageJson(repoPath, repoName);
      if (pkgResult.success) {
        if (pkgResult.modified) {
          console.log(chalk.green(`   ✓ Updated: package.json`));
          stats.packagesUpdated++;
        } else {
          console.log(chalk.gray(`   → No changes needed: package.json`));
        }
      } else if (pkgResult.reason) {
        console.log(chalk.gray(`   → ${pkgResult.reason}`));
      } else {
        console.log(chalk.red(`   ✗ Failed to update package.json: ${pkgResult.error}`));
        repoSuccess = false;
      }
    } else {
      console.log(chalk.gray(`   Would update: package.json`));
    }

    if (repoSuccess) {
      stats.successfulRepos++;
    } else {
      stats.failedRepos++;
    }
  }

  // Print summary
  console.log(chalk.bold.cyan('\n📊 Summary\n'));
  console.log(`Total repositories: ${stats.totalRepos}`);
  console.log(`Successful: ${chalk.green(stats.successfulRepos)}`);
  console.log(
    `Failed: ${stats.failedRepos > 0 ? chalk.red(stats.failedRepos) : stats.failedRepos}`
  );
  console.log(`Files copied: ${chalk.green(stats.filesCopied)}`);
  console.log(
    `Files failed: ${stats.filesFailed > 0 ? chalk.red(stats.filesFailed) : stats.filesFailed}`
  );
  console.log(`Packages updated: ${chalk.green(stats.packagesUpdated)}`);

  if (dryRun) {
    console.log(chalk.yellow('\n⚠️  This was a DRY RUN - no files were actually modified'));
    console.log(chalk.yellow('   Run without --dry-run to apply changes\n'));
  } else {
    console.log(chalk.bold.green('\n✅ Propagation complete!\n'));
  }
}

// ============================================================================
// RUN
// ============================================================================

propagateOrgFixes().catch(error => {
  console.error(chalk.red('\n❌ Error:'), error.message);
  process.exit(1);
});
