#!/usr/bin/env node

/**
 * DocuMind v2.0 — Repository Ingestion Module
 *
 * Supports two modes controlled by the REPO_MODE environment variable:
 *
 *   mount (default) — repos are provided via host bind mount; this module
 *     is a no-op. DOCUMIND_REPOS_DIR points to the pre-mounted directory.
 *
 *   clone — repos are cloned from GitHub into /app/repos on daemon startup,
 *     then pulled on the hourly cron schedule.
 *
 * In clone mode, DOCUMIND_REPOS_DIR must be set to /app/repos (via docker-compose)
 * and DOCUMIND_REPOS must list the repos as "org/repo" slugs. GIT_TOKEN must
 * be set for private repository access.
 *
 * NOTE: initIngestion() does NOT mutate process.env.DOCUMIND_REPOS_DIR.
 * docker-compose.yml sets DOCUMIND_REPOS_DIR=/app/repos so env.mjs already
 * exports the correct REPOS_DIR value at import time.
 *
 * @module daemon/ingestion
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { REPO_MODE, REPOS_LIST } from '../config/env.mjs';

const execFileAsync = promisify(execFile);

/** Absolute path where repos are cloned in clone mode */
const CLONE_DIR = '/app/repos';

// ============================================================================
// INIT INGESTION
// ============================================================================

/**
 * Called once at daemon startup (before loadProfile).
 *
 * In mount mode: logs and returns immediately — no filesystem changes.
 * In clone mode: validates config, creates CLONE_DIR, and clones any repos
 * that are not already present (detected by .git directory).
 *
 * @returns {Promise<void>}
 */
export async function initIngestion() {
  if (REPO_MODE === 'mount') {
    console.log('[ingestion] mount mode — skipping clone');
    return;
  }

  if (REPO_MODE !== 'clone') {
    console.error(
      `[ingestion] ERROR: Invalid REPO_MODE="${REPO_MODE}". Must be "mount" or "clone".`
    );
    process.exit(1);
  }

  // Validate required config for clone mode
  if (!REPOS_LIST || REPOS_LIST.length === 0) {
    console.error(
      '[ingestion] ERROR: REPO_MODE=clone but DOCUMIND_REPOS is not set or empty. ' +
        'Set DOCUMIND_REPOS to a comma-separated list of "org/repo" slugs.'
    );
    process.exit(1);
  }

  const token = process.env.GIT_TOKEN;
  if (!token) {
    console.error(
      '[ingestion] ERROR: REPO_MODE=clone but GIT_TOKEN is not set. ' +
        'Provide a GitHub personal access token with repo read permissions.'
    );
    process.exit(1);
  }

  // Ensure clone directory exists
  await fs.mkdir(CLONE_DIR, { recursive: true });
  console.log(`[ingestion] clone mode — target directory: ${CLONE_DIR}`);
  console.log(`[ingestion] Repos to clone: ${REPOS_LIST.join(', ')}`);

  let cloned = 0;
  let skipped = 0;

  for (const slug of REPOS_LIST) {
    const name = slug.split('/').pop();
    const repoPath = path.join(CLONE_DIR, name);
    const gitDir = path.join(repoPath, '.git');

    // Skip repos already cloned (idempotent restarts)
    try {
      await fs.access(gitDir);
      console.log(`[ingestion] skip ${name} — already cloned`);
      skipped++;
      continue;
    } catch {
      // .git not found — proceed with clone
    }

    const url = `https://${token}@github.com/${slug}.git`;
    console.log(`[ingestion] Cloning ${slug} into ${repoPath}...`);

    try {
      await execFileAsync('git', ['clone', '--depth=1', url, repoPath]);
      console.log(`[ingestion] Cloned ${slug}`);
      cloned++;
    } catch (err) {
      console.error(`[ingestion] ERROR: Failed to clone ${slug}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(
    `[ingestion] Ready — ${cloned} cloned, ${skipped} already present (${REPOS_LIST.length} total)`
  );
}

// ============================================================================
// PULL ALL REPOS
// ============================================================================

/**
 * Called by the scheduler on the hourly cron when REPO_MODE=clone.
 *
 * Runs `git pull --ff-only` on each repo in CLONE_DIR. If a repo has
 * diverged (ff-only fails), falls back to `git fetch` + `git reset --hard origin/HEAD`.
 *
 * @returns {Promise<string[]>} Array of repo names that had changes pulled
 */
export async function pullAllRepos() {
  if (REPO_MODE !== 'clone') {
    return [];
  }

  let entries;
  try {
    entries = await fs.readdir(CLONE_DIR, { withFileTypes: true });
  } catch (err) {
    console.error(`[ingestion] pullAllRepos: Cannot read ${CLONE_DIR}: ${err.message}`);
    return [];
  }

  const dirs = entries.filter(e => e.isDirectory());
  const updated = [];

  for (const entry of dirs) {
    const name = entry.name;
    const repoPath = path.join(CLONE_DIR, name);

    try {
      const { stdout } = await execFileAsync('git', ['-C', repoPath, 'pull', '--ff-only']);
      const output = stdout.trim();

      if (!output.includes('Already up to date')) {
        console.log(`[ingestion] ${name}: pulled changes`);
        updated.push(name);
      }
    } catch (pullErr) {
      // ff-only failed — attempt fetch + reset fallback
      console.warn(
        `[ingestion] ${name}: ff-only pull failed (${pullErr.message.trim()}) — attempting fallback`
      );

      try {
        await execFileAsync('git', ['-C', repoPath, 'fetch', 'origin']);
        await execFileAsync('git', ['-C', repoPath, 'reset', '--hard', 'origin/HEAD']);
        console.log(`[ingestion] ${name}: reset to origin/HEAD`);
        updated.push(name);
      } catch (fallbackErr) {
        console.error(
          `[ingestion] ${name}: fallback also failed — skipping: ${fallbackErr.message.trim()}`
        );
      }
    }
  }

  return updated;
}
