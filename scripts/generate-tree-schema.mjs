#!/usr/bin/env node

/**
 * Generate Tree Schema
 *
 * Generates a JSON schema of the repository directory structure
 * for programmatic analysis and cross-repository insights.
 *
 * Usage:
 *   node scripts/generate-tree-schema.mjs
 *
 * Output:
 *   config/repo-schema.json
 *
 * @author RootDispatcher
 * @created 2025-11-08
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Directories to exclude from analysis
const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  'out',
  '.turbo'
];

/**
 * Get repository name from package.json
 */
async function getRepoName() {
  try {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    return pkg.name.replace('@dvwdesign/', '');
  } catch (error) {
    // Fallback to directory name
    return path.basename(ROOT_DIR);
  }
}

/**
 * Get repository type from package.json
 */
async function getRepoType() {
  try {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);

    // Determine type from dependencies and structure
    if (pkg.dependencies?.react && pkg.dependencies?.express) return 'fullstack-app';
    if (pkg.dependencies?.react) return 'frontend-app';
    if (pkg.dependencies?.express) return 'backend-app';
    if (pkg.workspaces) return 'monorepo';
    if (pkg.description?.includes('documentation')) return 'documentation';
    if (pkg.description?.includes('library')) return 'shared-library';

    return 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Count files in a directory recursively
 */
async function countFiles(dir, depth = 0, maxDepth = 10) {
  if (depth > maxDepth) return 0;

  let count = 0;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (EXCLUDED_DIRS.includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isFile()) {
        count++;
      } else if (entry.isDirectory()) {
        count += await countFiles(fullPath, depth + 1, maxDepth);
      }
    }
  } catch (error) {
    // Permission denied or other error, skip
  }

  return count;
}

/**
 * Get directory size in bytes
 */
async function getDirectorySize(dir, depth = 0, maxDepth = 10) {
  if (depth > maxDepth) return 0;

  let size = 0;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (EXCLUDED_DIRS.includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        size += stats.size;
      } else if (entry.isDirectory()) {
        size += await getDirectorySize(fullPath, depth + 1, maxDepth);
      }
    }
  } catch (error) {
    // Permission denied or other error, skip
  }

  return size;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Analyze directory structure
 */
async function analyzeDirectory(dirPath, dirName) {
  const fileCount = await countFiles(dirPath);
  const totalSize = await getDirectorySize(dirPath);

  // Get key subdirectories (depth 1)
  const subdirs = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !EXCLUDED_DIRS.includes(entry.name)) {
        subdirs.push(entry.name);
      }
    }
  } catch (error) {
    // Skip if error
  }

  return {
    type: 'directory',
    fileCount,
    totalSize: formatBytes(totalSize),
    totalSizeBytes: totalSize,
    keySubdirectories: subdirs.sort()
  };
}

/**
 * Detect technologies from package.json
 */
async function detectTechnologies() {
  const technologies = {
    frontend: [],
    backend: [],
    testing: [],
    tools: []
  };

  try {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies
    };

    // Frontend
    if (allDeps.react) technologies.frontend.push('React');
    if (allDeps.vue) technologies.frontend.push('Vue');
    if (allDeps['@angular/core']) technologies.frontend.push('Angular');
    if (allDeps.typescript) technologies.frontend.push('TypeScript');
    if (allDeps.vite) technologies.frontend.push('Vite');
    if (allDeps['@mui/material']) technologies.frontend.push('Material-UI');

    // Backend
    if (allDeps.express) technologies.backend.push('Express');
    if (allDeps.mongoose) technologies.backend.push('MongoDB');
    if (allDeps.firebase) technologies.backend.push('Firebase');
    if (allDeps.postgres) technologies.backend.push('PostgreSQL');

    // Testing
    if (allDeps.jest) technologies.testing.push('Jest');
    if (allDeps.vitest) technologies.testing.push('Vitest');
    if (allDeps['@storybook/react']) technologies.testing.push('Storybook');

    // Tools
    if (allDeps.eslint) technologies.tools.push('ESLint');
    if (allDeps.prettier) technologies.tools.push('Prettier');
    if (allDeps.turbo) technologies.tools.push('Turborepo');

  } catch (error) {
    // No package.json or error reading
  }

  return technologies;
}

/**
 * Calculate max depth of directory tree
 */
async function calculateMaxDepth(dir, currentDepth = 0, maxDepth = 0) {
  if (currentDepth > 20) return maxDepth; // Safety limit

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || EXCLUDED_DIRS.includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const newDepth = currentDepth + 1;

      if (newDepth > maxDepth) maxDepth = newDepth;

      maxDepth = Math.max(maxDepth, await calculateMaxDepth(fullPath, newDepth, maxDepth));
    }
  } catch (error) {
    // Skip
  }

  return maxDepth;
}

/**
 * Main execution
 */
async function generateSchema() {
  console.log('🌳 Generating repository tree schema...\n');

  const repoName = await getRepoName();
  const repoType = await getRepoType();
  const technologies = await detectTechnologies();

  console.log(`📦 Repository: ${repoName}`);
  console.log(`🏷️  Type: ${repoType}\n`);

  // Analyze key directories
  const directories = {};
  const possibleDirs = ['client', 'server', 'docs', 'src', 'packages', 'scripts'];

  for (const dir of possibleDirs) {
    const dirPath = path.join(ROOT_DIR, dir);
    try {
      await fs.access(dirPath);
      console.log(`📁 Analyzing ${dir}/...`);
      directories[dir] = await analyzeDirectory(dirPath, dir);
    } catch (error) {
      // Directory doesn't exist, skip
    }
  }

  // Get root files
  const rootFiles = {};
  const importantFiles = ['package.json', 'README.md', 'CLAUDE.md', '.gitignore', 'tsconfig.json'];

  for (const file of importantFiles) {
    const filePath = path.join(ROOT_DIR, file);
    try {
      await fs.access(filePath);
      rootFiles[file] = `Root configuration file`;
    } catch (error) {
      // File doesn't exist, skip
    }
  }

  // Calculate metrics
  const totalFiles = Object.values(directories).reduce((sum, dir) => sum + dir.fileCount, 0);
  const totalSizeBytes = Object.values(directories).reduce((sum, dir) => sum + dir.totalSizeBytes, 0);
  const maxDepth = await calculateMaxDepth(ROOT_DIR);

  // Build schema
  const schema = {
    repository: {
      name: repoName,
      type: repoType,
      path: ROOT_DIR,
      generatedAt: new Date().toISOString(),
      version: '1.0.0'
    },
    structure: {
      directories,
      rootFiles
    },
    technologies,
    metrics: {
      totalFiles,
      totalSize: formatBytes(totalSizeBytes),
      totalSizeBytes,
      maxDepth,
      documentationCoverage: directories.docs ? 'high' : 'low'
    }
  };

  // Ensure config directory exists
  const configDir = path.join(ROOT_DIR, 'config');
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }

  // Write schema
  const schemaPath = path.join(configDir, 'repo-schema.json');
  await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2));

  console.log(`\n✅ Schema generated: ${schemaPath}`);
  console.log(`📊 Total files: ${totalFiles}`);
  console.log(`💾 Total size: ${formatBytes(totalSizeBytes)}`);
  console.log(`📏 Max depth: ${maxDepth}`);
}

// Run
generateSchema().catch(error => {
  console.error('❌ Error generating schema:', error);
  process.exit(1);
});
