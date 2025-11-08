#!/usr/bin/env node

/**
 * Setup Cron Jobs for Markdown Management
 *
 * Creates and manages cron jobs for automated markdown scanning and indexing.
 *
 * @version 1.0.0
 * @created 2025-11-06
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs/promises';

// ============================================================================
// Configuration
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const CRON_JOBS = [
  {
    name: 'markdown-scan-hourly',
    schedule: '0 * * * *', // Every hour at minute 0
    command: 'scan:report',
    description: 'Scan all repositories for markdown files every hour',
  },
  {
    name: 'markdown-index-hourly',
    schedule: '5 * * * *', // Every hour at minute 5
    command: 'index',
    description: 'Update markdown index every hour (5 min after scan)',
  },
  {
    name: 'markdown-validate-daily',
    schedule: '0 9 * * *', // Daily at 9:00 AM
    command: 'validate',
    description: 'Validate markdown timestamps and versions daily',
  },
  {
    name: 'markdown-lint-daily',
    schedule: '0 10 * * *', // Daily at 10:00 AM
    command: 'lint',
    description: 'Lint all markdown files daily',
  },
];

// ============================================================================
// Utilities
// ============================================================================

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '✓',
    error: '✗',
    warning: '⚠',
    action: '→',
  }[type] || 'ℹ';

  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function execCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || stdout));
      }
    });
  });
}

// ============================================================================
// Cron Management Functions
// ============================================================================

async function getCurrentCrontab() {
  try {
    const output = await execCommand('crontab -l 2>/dev/null || echo ""');
    return output.trim();
  } catch (error) {
    return '';
  }
}

function generateCronEntry(job) {
  const npmCommand = `cd ${REPO_ROOT} && npm run ${job.command} >> ${REPO_ROOT}/logs/cron-${job.name}.log 2>&1`;
  return `${job.schedule} ${npmCommand}`;
}

function generateCronComment(job) {
  return `# ${job.description} (${job.name})`;
}

async function installCronJobs() {
  log('Installing cron jobs...', 'action');

  // Create logs directory
  const logsDir = resolve(REPO_ROOT, 'logs');
  try {
    await fs.mkdir(logsDir, { recursive: true });
    log(`Created logs directory: ${logsDir}`, 'info');
  } catch (error) {
    log(`Logs directory already exists: ${logsDir}`, 'info');
  }

  // Get current crontab
  const currentCrontab = await getCurrentCrontab();
  const existingLines = currentCrontab.split('\n').filter(line => line.trim());

  // Remove existing markdown cron jobs
  const filteredLines = existingLines.filter(line => {
    const isMarkdownJob = CRON_JOBS.some(job =>
      line.includes(job.name) || line.includes(`npm run ${job.command}`)
    );
    return !isMarkdownJob;
  });

  // Add new markdown cron jobs
  const newLines = [];
  newLines.push('');
  newLines.push('# ============================================================================');
  newLines.push('# DVWDesign Markdown Management Cron Jobs');
  newLines.push('# Managed by: @dvwdesign/markdown-tools');
  newLines.push(`# Installed: ${new Date().toISOString()}`);
  newLines.push('# ============================================================================');
  newLines.push('');

  for (const job of CRON_JOBS) {
    newLines.push(generateCronComment(job));
    newLines.push(generateCronEntry(job));
    newLines.push('');
  }

  // Combine everything
  const newCrontab = [...filteredLines, ...newLines].join('\n');

  // Write to temporary file
  const tempFile = resolve(REPO_ROOT, '.crontab.tmp');
  await fs.writeFile(tempFile, newCrontab);

  // Install crontab
  try {
    await execCommand(`crontab ${tempFile}`);
    await fs.unlink(tempFile);

    log('Cron jobs installed successfully!', 'info');
    log('', 'info');

    // Display installed jobs
    log('Installed jobs:', 'action');
    for (const job of CRON_JOBS) {
      log(`  ${job.name}`, 'info');
      log(`    Schedule: ${job.schedule}`, 'info');
      log(`    Command: npm run ${job.command}`, 'info');
      log(`    Log: logs/cron-${job.name}.log`, 'info');
      log('', 'info');
    }

    log('To view cron jobs: crontab -l', 'action');
    log('To view logs: tail -f logs/cron-*.log', 'action');

  } catch (error) {
    await fs.unlink(tempFile).catch(() => {});
    throw error;
  }
}

async function removeCronJobs() {
  log('Removing cron jobs...', 'action');

  // Get current crontab
  const currentCrontab = await getCurrentCrontab();
  const existingLines = currentCrontab.split('\n').filter(line => line.trim());

  // Remove markdown cron jobs and their section
  let inMarkdownSection = false;
  const filteredLines = existingLines.filter(line => {
    // Detect start of markdown section
    if (line.includes('DVWDesign Markdown Management Cron Jobs')) {
      inMarkdownSection = true;
      return false;
    }

    // Skip lines in markdown section
    if (inMarkdownSection) {
      // Check if we've reached the end of the section (empty line after jobs)
      if (line.trim() === '' && !CRON_JOBS.some(job => line.includes(job.name))) {
        inMarkdownSection = false;
        return false;
      }
      return false;
    }

    // Also remove any standalone markdown job lines
    const isMarkdownJob = CRON_JOBS.some(job =>
      line.includes(job.name) || line.includes(`npm run ${job.command}`)
    );

    return !isMarkdownJob;
  });

  const newCrontab = filteredLines.join('\n');

  // Write to temporary file
  const tempFile = resolve(REPO_ROOT, '.crontab.tmp');
  await fs.writeFile(tempFile, newCrontab);

  // Install crontab
  try {
    await execCommand(`crontab ${tempFile}`);
    await fs.unlink(tempFile);

    log('Cron jobs removed successfully!', 'info');

  } catch (error) {
    await fs.unlink(tempFile).catch(() => {});
    throw error;
  }
}

async function listCronJobs() {
  log('Current markdown cron jobs:', 'action');
  log('', 'info');

  const currentCrontab = await getCurrentCrontab();
  const lines = currentCrontab.split('\n');

  let foundJobs = false;
  for (const line of lines) {
    const isMarkdownJob = CRON_JOBS.some(job =>
      line.includes(job.name) || line.includes(`npm run ${job.command}`)
    );

    if (isMarkdownJob || line.includes('DVWDesign Markdown Management')) {
      log(line, 'info');
      foundJobs = true;
    }
  }

  if (!foundJobs) {
    log('No markdown cron jobs installed.', 'warning');
    log('Run: npm run cron:setup', 'action');
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║         DVWDesign Markdown Management - Cron Setup                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    if (command === '--stop' || command === '--remove') {
      await removeCronJobs();
    } else if (command === '--list') {
      await listCronJobs();
    } else {
      await installCronJobs();
    }

    console.log('');
    log('Done!', 'info');
    console.log('');

  } catch (error) {
    log(`Error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { installCronJobs, removeCronJobs, listCronJobs };
