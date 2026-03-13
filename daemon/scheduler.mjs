#!/usr/bin/env node

/**
 * DocuMind v2.0 — Cron Job Scheduler
 * Orchestrates periodic scanning, indexing, and analysis tasks
 */

import cron from 'node-cron';

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} root - DocuMind root directory
 */
export function initScheduler(db, root) {
  console.log('[scheduler] Initializing cron jobs...');

  // Every 15 minutes: heartbeat + quick stats update
  cron.schedule('*/15 * * * *', () => {
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
  cron.schedule('0 * * * *', async () => {
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
      // TODO: integrate with scan-all-repos.mjs incremental mode
      db.prepare(
        `
        UPDATE scan_history
        SET scan_completed = datetime('now'), status = 'completed', duration_ms = 0
        WHERE id = ?
      `
      ).run(scanId);
      console.log('[scheduler] Hourly scan completed');
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
  cron.schedule('0 2 * * *', async () => {
    console.log('[scheduler] Starting daily full scan...');
    // TODO: integrate with scan-all-repos.mjs + analyze:similarities + analyze:deviations
    console.log('[scheduler] Daily scan completed');
  });

  // Weekly Sunday at 3 AM: PDF re-index + keyword refresh + graph rebuild
  cron.schedule('0 3 * * 0', async () => {
    console.log('[scheduler] Starting weekly deep analysis...');
    // TODO: integrate with pdf-processor, keyword-processor, graph relations builder
    console.log('[scheduler] Weekly analysis completed');
  });

  // Every 6 hours: check for diagrams pending curation
  cron.schedule('0 */6 * * *', () => {
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

  console.log('[scheduler] Cron jobs registered:');
  console.log('  */15 * * * *  — heartbeat + stats');
  console.log('  0 * * * *     — hourly incremental scan');
  console.log('  0 */6 * * *   — pending diagram relinks check');
  console.log('  0 2 * * *     — daily full scan + analysis');
  console.log('  0 3 * * 0     — weekly deep analysis');
}
