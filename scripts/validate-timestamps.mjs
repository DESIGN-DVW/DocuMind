#!/usr/bin/env node

/**
 * Validate Timestamps and Versions
 *
 * Checks markdown files for missing timestamps, versions, and metadata.
 *
 * @version 1.0.0
 * @created 2025-11-06
 */

import fs from 'fs/promises';

// ============================================================================
// Configuration
// ============================================================================

const INPUT_FILE = 'index/all-markdown-files.json';
const REPORT_FILE = 'index/validation-report.md';

// ============================================================================
// Validation Logic
// ============================================================================

async function validateFiles() {
  console.log('✅ Validating Markdown Timestamps & Versions\n');

  const scanData = JSON.parse(await fs.readFile(INPUT_FILE, 'utf-8'));

  const issues = {
    noTimestamp: [],
    noVersion: [],
    noClaudeMarker: [],
    outdated: [], // Modified > 30 days ago but no recent timestamp
  };

  let totalFiles = 0;
  let validFiles = 0;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  scanData.results.forEach((repoResult) => {
    if (!repoResult.found) return;

    repoResult.files.forEach((file) => {
      if (file.error) return;

      totalFiles++;

      const modified = new Date(file.modified);
      const isRecent = modified > thirtyDaysAgo;

      if (!file.hasTimestamp) issues.noTimestamp.push(file);
      if (!file.hasVersion) issues.noVersion.push(file);
      if (!file.hasClaudeMarker && file.path.includes('docs/'))
        issues.noClaudeMarker.push(file);
      if (isRecent && !file.hasTimestamp) issues.outdated.push(file);

      if (file.hasTimestamp && file.hasVersion) validFiles++;
    });
  });

  // Generate report
  let report = `# Markdown Validation Report

**Generated**: ${new Date().toISOString()}
**Total Files**: ${totalFiles}
**Valid Files**: ${validFiles} (${((validFiles / totalFiles) * 100).toFixed(1)}%)

---

## Summary

| Issue | Count | Percentage |
|-------|-------|------------|
| Missing Timestamp | ${issues.noTimestamp.length} | ${((issues.noTimestamp.length / totalFiles) * 100).toFixed(1)}% |
| Missing Version | ${issues.noVersion.length} | ${((issues.noVersion.length / totalFiles) * 100).toFixed(1)}% |
| Missing Claude Marker | ${issues.noClaudeMarker.length} | ${((issues.noClaudeMarker.length / totalFiles) * 100).toFixed(1)}% |
| Recently Modified, No Timestamp | ${issues.outdated.length} | ${((issues.outdated.length / totalFiles) * 100).toFixed(1)}% |

---

## Issues

`;

  // Missing Timestamp
  if (issues.noTimestamp.length > 0) {
    report += `### Missing Timestamp (${issues.noTimestamp.length})\n\n`;
    issues.noTimestamp.slice(0, 20).forEach((file) => {
      report += `- [${file.repo}/${file.path}](${file.fullPath})\n`;
    });
    if (issues.noTimestamp.length > 20) {
      report += `\n... and ${issues.noTimestamp.length - 20} more\n`;
    }
    report += `\n`;
  }

  // Missing Version
  if (issues.noVersion.length > 0) {
    report += `### Missing Version (${issues.noVersion.length})\n\n`;
    issues.noVersion.slice(0, 20).forEach((file) => {
      report += `- [${file.repo}/${file.path}](${file.fullPath})\n`;
    });
    if (issues.noVersion.length > 20) {
      report += `\n... and ${issues.noVersion.length - 20} more\n`;
    }
    report += `\n`;
  }

  // Recently Modified, No Timestamp
  if (issues.outdated.length > 0) {
    report += `### Recently Modified, No Timestamp (${issues.outdated.length})\n\n`;
    report += `These files were modified in the last 30 days but lack timestamps.\n\n`;
    issues.outdated.forEach((file) => {
      report += `- [${file.repo}/${file.path}](${file.fullPath})\n`;
      report += `  - Modified: ${file.modified.split('T')[0]}\n`;
    });
    report += `\n`;
  }

  report += `---

**Status**: ${validFiles === totalFiles ? '✅ All Valid' : '⚠️ Issues Found'}

`;

  await fs.writeFile(REPORT_FILE, report);

  console.log(`✓ Validation report saved: ${REPORT_FILE}\n`);

  // Console summary
  console.log('='.repeat(60));
  console.log('Validation Summary');
  console.log('='.repeat(60) + '\n');

  console.log(`Total Files:                ${totalFiles}`);
  console.log(`Valid Files:                ${validFiles} (${((validFiles / totalFiles) * 100).toFixed(1)}%)`);
  console.log(`Missing Timestamp:          ${issues.noTimestamp.length}`);
  console.log(`Missing Version:            ${issues.noVersion.length}`);
  console.log(`Recently Modified (no TS):  ${issues.outdated.length}`);

  if (validFiles === totalFiles) {
    console.log('\n✅ All files have timestamps and versions!\n');
  } else {
    console.log('\n⚠️  Some files need attention.\n');
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    await validateFiles();
  } catch (error) {
    if (error.code === 'ENOENT' && error.path?.includes(INPUT_FILE)) {
      console.error(`\n✗ Error: ${INPUT_FILE} not found.`);
      console.error(`\nRun: npm run scan\n`);
    } else {
      console.error(`\n✗ Error: ${error.message}\n`);
    }
    process.exit(1);
  }
}

main();
