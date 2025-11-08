#!/usr/bin/env node

/**
 * Scan All Repositories for Markdown Files
 *
 * Scans all DVWDesign repositories and generates comprehensive index.
 *
 * @version 1.0.0
 * @created 2025-11-06
 */

import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';
import grayMatter from 'gray-matter';

// ============================================================================
// Configuration
// ============================================================================

const BASE_PATH = '/Users/Shared/htdocs/github/DVWDesign';
const OUTPUT_FILE = 'index/all-markdown-files.json';
const REPORT_FILE = 'index/scan-report.md';

const REPOS = [
  { name: 'FigmaAPI/FigmailAPP', priority: 'high', active: true },
  { name: 'FigmaAPI/FigmaDSController', priority: 'high', active: true },
  { name: 'FigmaAPI/@figma-core', priority: 'high', active: true },
  { name: 'FigmaAPI/@figma-docs', priority: 'high', active: true },
  { name: 'Figma-Plug-ins', priority: 'high', active: true },
  { name: 'mjml-dev-mode-proposal', priority: 'high', active: true }, // MJML Dev Mode Proposal - added 2025-11-08
  { name: 'GlossiaApp', priority: 'medium', active: true },
  { name: 'Contentful', priority: 'medium', active: true },
  { name: 'IconJar', priority: 'low', active: true },
  { name: 'AdobePlugIns', priority: 'low', active: true },
  { name: 'DocuMind', priority: 'high', active: true }, // Renamed from Markdown on 2025-11-08
];

const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.cache/**',
];

// ============================================================================
// Utilities
// ============================================================================

async function scanRepository(repo) {
  const repoPath = path.join(BASE_PATH, repo.name);

  console.log(`\n📁 Scanning: ${repo.name}`);

  try {
    // Check if repository exists
    await fs.access(repoPath);
  } catch (error) {
    console.log(`  ⚠️  Repository not found: ${repoPath}`);
    return {
      repo: repo.name,
      priority: repo.priority,
      active: repo.active,
      found: false,
      files: [],
      stats: { total: 0, size: 0, errors: 0 },
    };
  }

  const files = await glob('**/*.{md,mdx}', {
    cwd: repoPath,
    ignore: EXCLUDE_PATTERNS,
    absolute: false,
  });

  console.log(`  Found ${files.length} markdown files`);

  const fileData = await Promise.all(
    files.map(async (file) => {
      const fullPath = path.join(repoPath, file);

      try {
        const stats = await fs.stat(fullPath);
        const content = await fs.readFile(fullPath, 'utf-8');

        // Extract frontmatter
        let frontmatter = {};
        try {
          const parsed = grayMatter(content);
          frontmatter = parsed.data;
        } catch (error) {
          // No frontmatter or invalid YAML
        }

        // Analyze content
        const lines = content.split('\n');
        const hasClaudeMarker = content.includes('🤖 Generated with');
        const hasTimestamp = /Last Updated:.*\d{4}-\d{2}-\d{2}/.test(content);
        const hasVersion = /Version:.*\d+\.\d+/.test(content);

        // Extract headings
        const headings = lines
          .filter((line) => /^#{1,6}\s/.test(line))
          .map((line) => {
            const match = line.match(/^(#{1,6})\s+(.+)/);
            return match ? { level: match[1].length, text: match[2] } : null;
          })
          .filter(Boolean);

        return {
          repo: repo.name,
          path: file,
          fullPath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          lines: lines.length,
          headings: headings.length,
          hasClaudeMarker,
          hasTimestamp,
          hasVersion,
          frontmatter,
          firstHeading: headings[0]?.text || null,
        };
      } catch (error) {
        console.log(`  ✗ Error reading ${file}: ${error.message}`);
        return {
          repo: repo.name,
          path: file,
          fullPath,
          error: error.message,
        };
      }
    })
  );

  const validFiles = fileData.filter((f) => !f.error);
  const errorFiles = fileData.filter((f) => f.error);

  const stats = {
    total: files.length,
    valid: validFiles.length,
    errors: errorFiles.length,
    size: validFiles.reduce((sum, f) => sum + (f.size || 0), 0),
    lines: validFiles.reduce((sum, f) => sum + (f.lines || 0), 0),
    withTimestamp: validFiles.filter((f) => f.hasTimestamp).length,
    withVersion: validFiles.filter((f) => f.hasVersion).length,
    withClaudeMarker: validFiles.filter((f) => f.hasClaudeMarker).length,
  };

  console.log(`  ✓ Valid: ${stats.valid}, Errors: ${stats.errors}`);
  console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  return {
    repo: repo.name,
    priority: repo.priority,
    active: repo.active,
    found: true,
    files: fileData,
    stats,
  };
}

function generateMarkdownReport(results, outputPath) {
  const timestamp = new Date().toISOString();
  const totalFiles = results.reduce((sum, r) => sum + r.stats.total, 0);
  const totalSize = results.reduce((sum, r) => sum + r.stats.size, 0);
  const totalLines = results.reduce((sum, r) => sum + r.stats.lines, 0);

  let report = `# Markdown Scan Report

**Generated**: ${timestamp}

---

## Summary

- **Total Repositories**: ${results.length}
- **Total Files**: ${totalFiles}
- **Total Size**: ${(totalSize / 1024 / 1024).toFixed(2)} MB
- **Total Lines**: ${totalLines.toLocaleString()}

---

## Repository Breakdown

`;

  results.forEach((result) => {
    if (!result.found) {
      report += `### ${result.repo} (NOT FOUND)\n\n`;
      report += `⚠️ Repository not found at expected location\n\n`;
      return;
    }

    const { stats } = result;

    report += `### ${result.repo}\n\n`;
    report += `**Priority**: ${result.priority} | **Active**: ${result.active ? 'Yes' : 'No'}\n\n`;
    report += `- Files: ${stats.total}\n`;
    report += `- Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`;
    report += `- Lines: ${stats.lines.toLocaleString()}\n`;
    report += `- With Timestamp: ${stats.withTimestamp} (${((stats.withTimestamp / stats.valid) * 100).toFixed(1)}%)\n`;
    report += `- With Version: ${stats.withVersion} (${((stats.withVersion / stats.valid) * 100).toFixed(1)}%)\n`;
    report += `- With Claude Marker: ${stats.withClaudeMarker} (${((stats.withClaudeMarker / stats.valid) * 100).toFixed(1)}%)\n`;
    report += `- Errors: ${stats.errors}\n`;
    report += `\n`;

    // Top 5 largest files
    const topFiles = result.files
      .filter((f) => !f.error)
      .sort((a, b) => b.size - a.size)
      .slice(0, 5);

    if (topFiles.length > 0) {
      report += `**Largest Files**:\n\n`;
      topFiles.forEach((file) => {
        report += `- [${file.path}](${file.fullPath}) (${(file.size / 1024).toFixed(1)} KB, ${file.lines} lines)\n`;
      });
      report += `\n`;
    }
  });

  report += `---

**Status**: ✅ Scan Complete
**Output**: ${outputPath}

`;

  return report;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const generateReport = args.includes('--report') || args.includes('-r');

  console.log('📊 Markdown Repository Scanner');
  console.log('==============================\n');
  console.log(`Base Path: ${BASE_PATH}`);
  console.log(`Repositories: ${REPOS.length}\n`);

  const results = [];

  for (const repo of REPOS) {
    const result = await scanRepository(repo);
    results.push(result);
  }

  // Create output directory
  const outputDir = path.dirname(OUTPUT_FILE);
  await fs.mkdir(outputDir, { recursive: true });

  // Save JSON index
  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        basePath: BASE_PATH,
        results,
      },
      null,
      2
    )
  );

  console.log(`\n✓ Index saved: ${OUTPUT_FILE}`);

  // Generate markdown report if requested
  if (generateReport) {
    const report = generateMarkdownReport(results, OUTPUT_FILE);
    await fs.writeFile(REPORT_FILE, report);
    console.log(`✓ Report saved: ${REPORT_FILE}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60) + '\n');

  const foundRepos = results.filter((r) => r.found);
  const notFoundRepos = results.filter((r) => !r.found);
  const totalFiles = results.reduce((sum, r) => sum + r.stats.total, 0);
  const totalSize = results.reduce((sum, r) => sum + r.stats.size, 0);

  console.log(`Repositories Found:     ${foundRepos.length}/${REPOS.length}`);
  console.log(`Total Files:            ${totalFiles}`);
  console.log(`Total Size:             ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

  if (notFoundRepos.length > 0) {
    console.log(`\n⚠️  Repositories Not Found:`);
    notFoundRepos.forEach((r) => console.log(`  - ${r.repo}`));
  }

  console.log('\n✓ Done!\n');
}

main().catch(console.error);
