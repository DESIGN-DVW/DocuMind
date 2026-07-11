#!/usr/bin/env node

/**
 * Slides Processor — Render Stage (Phase 24, v3.4 Presentation Pipeline)
 *
 * Turns a single EN Marp deck (docs/slides/**\/*.md) into HTML, PDF, and PPTX
 * siblings via three sequential `npx marp` subprocess calls.
 *
 * Multi-format invocation pattern (2026-07-11, Phase 24 Task 1 spike):
 * A `--config-file` with `pdf: true` / `pptx: true` booleans set CLI-flag
 * DEFAULTS for a single marp invocation — they do NOT fan a single call out
 * into multiple output files. Spiked with:
 *   printf 'pdf: true\npptx: true\n' > /tmp/marp-spike.marprc.yml
 *   npx marp --config-file /tmp/marp-spike.marprc.yml <deck.md> -o /tmp/spike-output.html
 * Result: only spike-output.html was emitted (no .pdf/.pptx siblings appeared).
 * Decision: three separate per-format `execFileAsync('npx', ['marp', ...])`
 * calls (HTML, then PDF, then PPTX) is the confirmed and only pattern — this
 * is what renderDeck() below implements. Do not attempt to collapse this into
 * a single config-driven call without re-validating against a newer marp-cli.
 *
 * RNDR-02 (editable PPTX gating): before the PPTX call, this module runs a
 * pre-flight `fs.access(SOFFICE_PATH, X_OK)` check. When it resolves, marp-cli
 * is invoked with `--pptx-editable` (LibreOffice-backed, editable output).
 * When it does NOT resolve (the default state on this machine — LibreOffice
 * is not installed), an explicit warning is logged via console.warn AND
 * appended to the returned `warnings[]` array, then a standard (non-editable,
 * image-based-slide) PPTX is produced instead. This module NEVER silently
 * downgrades to an image-only PPTX without surfacing that fact to the caller.
 *
 * Return contract (deliberately ledger-friendly — Phase 26 wraps this with
 * recordRun() without needing a contract change):
 *   { html, pdf, pptx, pptxEditable, warnings }
 *
 * @module processors/slides-processor
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import puppeteer from 'puppeteer';
import { SOFFICE_PATH } from '../config/env.mjs';

const execFileAsync = promisify(execFile);

/**
 * Timeout for a single marp render call, in milliseconds.
 * Headless-Chrome render is heavier than the 60s markdownlint precedent in
 * daemon/scheduler.mjs; the editable-PPTX call additionally multiplies this
 * by 1.5x since LibreOffice conversion is slower than the HTML/PDF paths.
 * @constant {number}
 */
const RENDER_TIMEOUT_MS = 120_000;

/**
 * Checks whether the configured LibreOffice `soffice` binary resolves and is
 * executable. Used to gate `--pptx-editable` (RNDR-02).
 *
 * @param {string} sofficePath - Absolute path to the soffice binary.
 * @returns {Promise<boolean>} true if the path resolves and is executable.
 */
async function sofficeResolvable(sofficePath) {
  try {
    await fs.access(sofficePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders a single EN Marp deck to HTML, PDF, and PPTX siblings.
 *
 * Output paths derive from the source: `deck.md` -> `deck.html` / `deck.pdf`
 * / `deck.pptx` (siblings of the source file, same directory).
 *
 * @param {string} mdPath - Absolute (or cwd-relative) path to the source .md deck.
 * @param {object} [options]
 * @param {string} [options.cwd] - Working directory for the marp subprocess calls.
 * @returns {Promise<{html: string, pdf: string, pptx: string, pptxEditable: boolean, warnings: string[]}>}
 */
export async function renderDeck(mdPath, { cwd = process.cwd() } = {}) {
  const browserPath = puppeteer.executablePath();
  const base = mdPath.replace(/\.md$/, '');
  const outputs = { html: `${base}.html`, pdf: `${base}.pdf`, pptx: `${base}.pptx` };
  const warnings = [];

  // HTML
  await execFileAsync(
    'npx',
    ['marp', mdPath, '--no-stdin', '--browser-path', browserPath, '-o', outputs.html],
    { cwd, timeout: RENDER_TIMEOUT_MS }
  );

  // PDF
  await execFileAsync(
    'npx',
    ['marp', mdPath, '--no-stdin', '--pdf', '--browser-path', browserPath, '-o', outputs.pdf],
    { cwd, timeout: RENDER_TIMEOUT_MS }
  );

  // PPTX — gated on SOFFICE_PATH pre-flight (RNDR-02)
  const editable = await sofficeResolvable(SOFFICE_PATH);
  const pptxArgs = [
    'marp',
    mdPath,
    '--no-stdin',
    '--pptx',
    '--browser-path',
    browserPath,
    '-o',
    outputs.pptx,
  ];
  if (editable) {
    pptxArgs.push('--pptx-editable');
  } else {
    const msg =
      `[slides-processor] SOFFICE_PATH not resolvable (${SOFFICE_PATH}) — ` +
      `producing standard (non-editable) PPTX for ${mdPath}`;
    console.warn(msg);
    warnings.push(msg);
  }
  await execFileAsync('npx', pptxArgs, {
    cwd,
    timeout: editable ? RENDER_TIMEOUT_MS * 1.5 : RENDER_TIMEOUT_MS,
  });

  return { ...outputs, pptxEditable: editable, warnings };
}
