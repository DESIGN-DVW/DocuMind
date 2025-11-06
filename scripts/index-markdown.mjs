#!/usr/bin/env node

/**
 * Markdown Index Generator
 *
 * Creates organized searchable index from scan results.
 *
 * @version 1.0.0
 * @created 2025-11-06
 */

import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const INPUT_FILE = 'index/all-markdown-files.json';
const OUTPUT_FILE = 'index/organized-index.md';
const CATEGORIES_FILE = 'index/categories.json';

// ============================================================================
// Indexing Logic
// ============================================================================

async function createIndex() {
  console.log('📑 Creating Organized Markdown Index\n');

  // Load scan results
  const scanData = JSON.parse(await fs.readFile(INPUT_FILE, 'utf-8'));

  // Categorize files
  const categories = {
    agents: [],
    docs: [],
    guides: [],
    architecture: [],
    backend: [],
    frontend: [],
    shared: [],
    readme: [],
    claude: [],
    other: [],
  };

  let totalProcessed = 0;

  scanData.results.forEach((repoResult) => {
    if (!repoResult.found) return;

    repoResult.files.forEach((file) => {
      if (file.error) return;

      totalProcessed++;

      const lowerPath = file.path.toLowerCase();

      if (lowerPath.includes('agents/')) categories.agents.push(file);
      else if (lowerPath.includes('docs/') && lowerPath.includes('guides/'))
        categories.guides.push(file);
      else if (lowerPath.includes('docs/') && lowerPath.includes('architecture/'))
        categories.architecture.push(file);
      else if (lowerPath.includes('docs/') && lowerPath.includes('backend/'))
        categories.backend.push(file);
      else if (lowerPath.includes('docs/') && lowerPath.includes('frontend/'))
        categories.frontend.push(file);
      else if (lowerPath.includes('docs/') && lowerPath.includes('shared/'))
        categories.shared.push(file);
      else if (lowerPath.includes('docs/')) categories.docs.push(file);
      else if (lowerPath === 'readme.md') categories.readme.push(file);
      else if (lowerPath.includes('claude.md') || lowerPath.includes('.claude/'))
        categories.claude.push(file);
      else categories.other.push(file);
    });
  });

  // Generate markdown index
  let index = `# DVWDesign Markdown Index

**Generated**: ${new Date().toISOString()}
**Total Files**: ${totalProcessed}

---

## Table of Contents

- [AI Agents](#ai-agents) (${categories.agents.length})
- [Documentation](#documentation) (${categories.docs.length})
- [Guides](#guides) (${categories.guides.length})
- [Architecture](#architecture) (${categories.architecture.length})
- [Backend](#backend) (${categories.backend.length})
- [Frontend](#frontend) (${categories.frontend.length})
- [Shared Resources](#shared-resources) (${categories.shared.length})
- [README Files](#readme-files) (${categories.readme.length})
- [Claude Instructions](#claude-instructions) (${categories.claude.length})
- [Other](#other) (${categories.other.length})

---

`;

  // Generate each category section
  const categoryTitles = {
    agents: 'AI Agents',
    docs: 'Documentation',
    guides: 'Guides',
    architecture: 'Architecture',
    backend: 'Backend',
    frontend: 'Frontend',
    shared: 'Shared Resources',
    readme: 'README Files',
    claude: 'Claude Instructions',
    other: 'Other',
  };

  for (const [key, title] of Object.entries(categoryTitles)) {
    const files = categories[key];
    if (files.length === 0) continue;

    index += `## ${title}\n\n`;
    index += `**Total**: ${files.length}\n\n`;

    // Group by repository
    const byRepo = {};
    files.forEach((file) => {
      if (!byRepo[file.repo]) byRepo[file.repo] = [];
      byRepo[file.repo].push(file);
    });

    Object.keys(byRepo)
      .sort()
      .forEach((repo) => {
        index += `### ${repo}\n\n`;

        byRepo[repo]
          .sort((a, b) => a.path.localeCompare(b.path))
          .forEach((file) => {
            const sizeKB = (file.size / 1024).toFixed(1);
            const heading = file.firstHeading ? ` - ${file.firstHeading}` : '';
            index += `- [${file.path}](${file.fullPath})${heading}\n`;
            index += `  - ${file.lines} lines, ${sizeKB} KB, Modified: ${file.modified.split('T')[0]}\n`;
          });

        index += `\n`;
      });

    index += `---\n\n`;
  }

  // Save organized index
  await fs.writeFile(OUTPUT_FILE, index);

  // Save categories as JSON
  const categoriesData = {};
  Object.keys(categories).forEach((key) => {
    categoriesData[key] = categories[key].map((f) => ({
      repo: f.repo,
      path: f.path,
      fullPath: f.fullPath,
      firstHeading: f.firstHeading,
      lines: f.lines,
      size: f.size,
      modified: f.modified,
    }));
  });

  await fs.writeFile(CATEGORIES_FILE, JSON.stringify(categoriesData, null, 2));

  console.log(`✓ Organized index saved: ${OUTPUT_FILE}`);
  console.log(`✓ Categories saved: ${CATEGORIES_FILE}`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Index Summary');
  console.log('='.repeat(60) + '\n');

  Object.entries(categoryTitles).forEach(([key, title]) => {
    const count = categories[key].length;
    if (count > 0) {
      console.log(`${title.padEnd(25)} ${count.toString().padStart(5)} files`);
    }
  });

  console.log('\n✓ Done!\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    await createIndex();
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
