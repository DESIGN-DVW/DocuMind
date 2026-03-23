#!/usr/bin/env node

/**
 * Watch and Auto-Index Markdown Files
 *
 * Watches for changes in DVWDesign repositories and auto-updates index.
 *
 * @version 1.0.0
 * @created 2025-11-06
 */

import chokidar from 'chokidar';
import { spawn } from 'child_process';
import path from 'path';
import { LOCAL_BASE_PATH } from '../config/constants.mjs';

// ============================================================================
// Configuration
// ============================================================================

const BASE_PATH = LOCAL_BASE_PATH;

const WATCH_PATTERNS = [`${BASE_PATH}/**/*.md`, `${BASE_PATH}/**/*.mdx`];

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/index/**', // Don't watch our own output
];

// Debounce configuration
let updateTimeout = null;
const DEBOUNCE_MS = 5000; // Wait 5 seconds after last change

// ============================================================================
// Watcher Logic
// ============================================================================

function runScanAndIndex() {
  console.log('\n🔄 Running scan and index...\n');

  const scan = spawn('npm', ['run', 'scan'], { stdio: 'inherit' });

  scan.on('close', code => {
    if (code === 0) {
      const index = spawn('npm', ['run', 'index'], { stdio: 'inherit' });

      index.on('close', indexCode => {
        if (indexCode === 0) {
          console.log('\n✅ Scan and index complete!\n');
        } else {
          console.log('\n⚠️ Index failed\n');
        }
      });
    } else {
      console.log('\n⚠️ Scan failed\n');
    }
  });
}

function scheduleUpdate() {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }

  updateTimeout = setTimeout(() => {
    runScanAndIndex();
  }, DEBOUNCE_MS);

  console.log(`⏳ Update scheduled in ${DEBOUNCE_MS / 1000}s...`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('👁️  Markdown File Watcher');
  console.log('========================\n');
  console.log(`Watching: ${BASE_PATH}`);
  console.log(`Debounce: ${DEBOUNCE_MS / 1000}s\n`);
  console.log('Press Ctrl+C to stop\n');

  // Initial scan
  console.log('Running initial scan...\n');
  runScanAndIndex();

  // Setup watcher
  const watcher = chokidar.watch(WATCH_PATTERNS, {
    ignored: IGNORE_PATTERNS,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  watcher.on('add', filePath => {
    const relativePath = path.relative(BASE_PATH, filePath);
    console.log(`➕ Added: ${relativePath}`);
    scheduleUpdate();
  });

  watcher.on('change', filePath => {
    const relativePath = path.relative(BASE_PATH, filePath);
    console.log(`✏️  Changed: ${relativePath}`);
    scheduleUpdate();
  });

  watcher.on('unlink', filePath => {
    const relativePath = path.relative(BASE_PATH, filePath);
    console.log(`➖ Removed: ${relativePath}`);
    scheduleUpdate();
  });

  watcher.on('error', error => {
    console.error(`⚠️ Watcher error: ${error.message}`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n👋 Stopping watcher...\n');
    watcher.close();
    process.exit(0);
  });
}

main().catch(console.error);
