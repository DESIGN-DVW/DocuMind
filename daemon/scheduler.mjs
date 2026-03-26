#!/usr/bin/env node

/**
 * DocuMind v2.0 — Cron Job Scheduler
 * Orchestrates periodic scanning, indexing, and analysis tasks
 */

import cron from 'node-cron';
import { runScan, generateDiagramSnapshot } from '../orchestrator.mjs';
import { pullAllRepos } from './ingestion.mjs';
import {
  CRON_HEARTBEAT,
  CRON_HOURLY,
  CRON_DAILY,
  CRON_WEEKLY,
  CRON_RELINK,
  REPO_MODE,
} from '../config/env.mjs';

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} root - DocuMind root directory
 * @param {object} ctx - Context profile object from loadProfile()
 */
export function initScheduler(db, root, ctx) {
  console.log('[scheduler] Initializing cron jobs...');

  // Every 15 minutes: heartbeat + quick stats update
  cron.schedule(CRON_HEARTBEAT, () => {
    const now = new Date().toISOString();
    const docs = db.prepare('SELECT COUNT(*) as count FROM documents').get();
    db.prepare(
      `
      INSERT INTO statistics (stat_name, stat_value, updated_at)
      VALUES ('total_documents', ?, ?)
      ON CONFLICT(stat_name) DO UPDATE SET stat_value = ?, updated_at = ?
    `
    ).run(String(docs.count), now, String(docs.count), now);
    console.log(`[scheduler] Heartbeat — ${docs.count} documents indexed`);
  });

  // Every hour: incremental scan (changed files only)
  cron.schedule(CRON_HOURLY, async () => {
    console.log('[scheduler] Starting hourly incremental scan...');
    const scanId = db
      .prepare(
        `
      INSERT INTO scan_history (scan_started, status)
      VALUES (datetime('now'), 'running')
    `
      )
      .run().lastInsertRowid;

    try {
      const result = await runScan(db, ctx, { mode: 'incremental' });
      db.prepare(
        `
        UPDATE scan_history
        SET scan_completed = datetime('now'), status = 'completed',
            duration_ms = ?, documents_found = ?, documents_added = ?, documents_updated = ?
        WHERE id = ?
      `
      ).run(result.durationMs, result.documentsFound, result.added, result.updated, scanId);
      console.log(
        `[scheduler] Hourly scan completed: ${result.added} added, ${result.updated} updated in ${result.durationMs}ms`
      );
    } catch (err) {
      db.prepare(
        `
        UPDATE scan_history
        SET scan_completed = datetime('now'), status = 'failed', error = ?
        WHERE id = ?
      `
      ).run(err.message, scanId);
      console.error('[scheduler] Hourly scan failed:', err.message);
    }
  });

  // Daily at 2 AM: full scan + similarity detection + deviation analysis
  cron.schedule(CRON_DAILY, async () => {
    console.log('[scheduler] Starting daily full scan...');
    const scanId = db
      .prepare(
        `
      INSERT INTO scan_history (scan_started, status)
      VALUES (datetime('now'), 'running')
    `
      )
      .run().lastInsertRowid;
    try {
      const result = await runScan(db, ctx, { mode: 'full' });
      db.prepare(
        `
        UPDATE scan_history
        SET scan_completed = datetime('now'), status = 'completed',
            duration_ms = ?, documents_found = ?, documents_added = ?, documents_updated = ?
        WHERE id = ?
      `
      ).run(result.durationMs, result.documentsFound, result.added, result.updated, scanId);
      console.log(`[scheduler] Daily full scan completed in ${result.durationMs}ms`);
      try {
        await generateDiagramSnapshot(db, root);
        console.log('[scheduler] Daily diagram snapshot regenerated');
      } catch (snapErr) {
        console.error('[scheduler] Diagram snapshot failed:', snapErr.message);
      }
    } catch (err) {
      db.prepare(
        `
        UPDATE scan_history SET scan_completed = datetime('now'), status = 'failed', error = ? WHERE id = ?
      `
      ).run(err.message, scanId);
      console.error('[scheduler] Daily scan failed:', err.message);
    }
  });

  // Weekly Sunday at 3 AM: PDF re-index + keyword refresh + graph rebuild
  cron.schedule(CRON_WEEKLY, async () => {
    console.log('[scheduler] Starting weekly deep analysis...');
    const scanId = db
      .prepare(
        `
      INSERT INTO scan_history (scan_started, status)
      VALUES (datetime('now'), 'running')
    `
      )
      .run().lastInsertRowid;
    try {
      const result = await runScan(db, ctx, { mode: 'deep' });
      db.prepare(
        `
        UPDATE scan_history
        SET scan_completed = datetime('now'), status = 'completed',
            duration_ms = ?, documents_found = ?, documents_added = ?, documents_updated = ?
        WHERE id = ?
      `
      ).run(result.durationMs, result.documentsFound, result.added, result.updated, scanId);
      console.log(`[scheduler] Weekly deep analysis completed in ${result.durationMs}ms`);
      try {
        await generateDiagramSnapshot(db, root);
        console.log('[scheduler] Weekly diagram snapshot regenerated');
      } catch (snapErr) {
        console.error('[scheduler] Diagram snapshot failed:', snapErr.message);
      }
    } catch (err) {
      db.prepare(
        `
        UPDATE scan_history SET scan_completed = datetime('now'), status = 'failed', error = ? WHERE id = ?
      `
      ).run(err.message, scanId);
      console.error('[scheduler] Weekly analysis failed:', err.message);
    }
  });

  // Every 6 hours: check for diagrams pending curation
  cron.schedule(CRON_RELINK, () => {
    console.log('[scheduler] Checking pending diagram relinks...');
    const hasView = db
      .prepare(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='view' AND name='pending_relinks'`
      )
      .get();

    if (!hasView.count) {
      console.log('[scheduler] pending_relinks view not found — run migration');
      return;
    }

    const pending = db.prepare('SELECT * FROM pending_relinks').all();
    if (pending.length === 0) {
      console.log('[scheduler] No diagrams pending curation');
      return;
    }

    console.log(`[scheduler] ${pending.length} diagram(s) awaiting curation:`);
    for (const d of pending) {
      console.log(`  - "${d.name}" (${d.repository || 'unknown repo'}) → ${d.generated_url}`);
    }

    // Update statistics
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO statistics (stat_name, stat_value, updated_at)
      VALUES ('pending_relinks', ?, ?)
      ON CONFLICT(stat_name) DO UPDATE SET stat_value = ?, updated_at = ?
    `
    ).run(String(pending.length), now, String(pending.length), now);
  });

  // Clone mode: pull repos and re-scan changed ones on hourly schedule
  if (REPO_MODE === 'clone') {
    cron.schedule(CRON_HOURLY, async () => {
      console.log('[scheduler] Pulling cloned repos...');
      try {
        const updated = await pullAllRepos();
        if (updated.length === 0) {
          console.log('[scheduler] All repos up to date');
          return;
        }
        for (const name of updated) {
          console.log(`[scheduler] Re-scanning ${name} after pull...`);
          await runScan(db, ctx, { mode: 'incremental', repo: name });
        }
        console.log(`[scheduler] Pull + re-scan complete: ${updated.length} repo(s) updated`);
      } catch (err) {
        console.error('[scheduler] Pull cron failed:', err.message);
      }
    });
  }

  console.log('[scheduler] Cron jobs registered:');
  console.log(`  ${CRON_HEARTBEAT}  — heartbeat + stats`);
  console.log(`  ${CRON_HOURLY}     — hourly incremental scan`);
  console.log(`  ${CRON_RELINK}   — pending diagram relinks check`);
  console.log(`  ${CRON_DAILY}     — daily full scan + analysis + diagram snapshot`);
  console.log(`  ${CRON_WEEKLY}     — weekly deep analysis + diagram snapshot`);
  if (REPO_MODE === 'clone') {
    console.log(`  ${CRON_HOURLY}     — clone mode: git pull + re-scan`);
  }
}
