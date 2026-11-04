/**
 * Style processor — Tier 2, opt-in prose restyling.
 *
 * This module does NOT rewrite prose itself. It assembles a brief (style
 * instruction, constraints, and the source text) for the calling agent to
 * execute, and it handles the safe parts: reading the source, refusing
 * inappropriate combinations, writing to a `.draft.md` sibling, and linting
 * the result before it is accepted.
 *
 * Keeping the model call in the caller means the MCP tool works with whichever
 * agent invoked it, and there is no second API key to provision.
 *
 * Hard rule: this never touches the source file, and it never runs from cron,
 * the watcher, or pre-commit. See docs/MARKDOWN-STYLE-BRIEF.md §2 for why the
 * deterministic and AI tiers are kept apart.
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import matter from 'gray-matter';
import { ROOT } from '../config/env.mjs';
import { lintContent } from './lint-processor.mjs';

const require = createRequire(import.meta.url);
const STYLES_PATH = path.join(ROOT, 'config/writing-styles.json');

let stylesCache;

/** Load config/writing-styles.json once. */
export function loadStyles() {
  if (stylesCache === undefined) {
    try {
      stylesCache = require(STYLES_PATH);
    } catch {
      stylesCache = null;
    }
  }
  return stylesCache;
}

/** Style keys available to the caller. */
export function availableStyles() {
  const cfg = loadStyles();
  return cfg ? Object.keys(cfg.styles) : [];
}

/**
 * Derive the draft path: `guide.md` → `guide.draft.md`.
 *
 * @param {string} file
 * @returns {string}
 */
export function draftPath(file) {
  const ext = path.extname(file);
  return path.join(path.dirname(file), `${path.basename(file, ext)}.draft${ext}`);
}

/**
 * Build the restyle brief for a document.
 *
 * @param {string} file Absolute path to the source
 * @param {{style: string, humour?: 'none'|'light'}} options
 * @returns {Promise<{ok: false, reason: string} |
 *   {ok: true, style: string, instruction: string, constraints: string[],
 *    humour: string, source: string, draft: string, content: string}>}
 */
export async function buildRestyleBrief(file, { style, humour = 'none' }) {
  const cfg = loadStyles();
  if (!cfg) return { ok: false, reason: 'config/writing-styles.json is missing or malformed' };

  const chosen = cfg.styles[style];
  if (!chosen) {
    return {
      ok: false,
      reason: `Unknown style "${style}". Available: ${Object.keys(cfg.styles).join(', ')}`,
    };
  }

  const raw = await fs.readFile(file, 'utf-8');
  const { data } = matter(raw);

  const humourCfg = cfg.humour?.[humour] ?? cfg.humour?.none;
  const category = String(data.category ?? '').toLowerCase();
  const excluded = humourCfg?.excludedCategories ?? [];

  let humourInstruction = humourCfg?.instruction ?? '';
  if (humour !== 'none' && excluded.includes(category)) {
    humourInstruction = `Humour was requested but this document is category "${category}", where it is excluded. ${cfg.humour.none.instruction}`;
  }

  return {
    ok: true,
    style,
    instruction: chosen.instruction,
    constraints: cfg.constraints ?? [],
    humour: humourInstruction,
    source: file,
    draft: draftPath(file),
    content: raw,
  };
}

/**
 * Write restyled prose to the draft sibling and lint it.
 *
 * Refuses to write over the source, and refuses output that fails the
 * deterministic rules — a restyle that introduces lint errors is not finished.
 *
 * @param {string} file Absolute path to the SOURCE (the draft path is derived)
 * @param {string} restyled
 * @returns {Promise<{draft: string, bytes: number, issues: object[], clean: boolean}>}
 */
export async function writeDraft(file, restyled) {
  const draft = draftPath(file);
  if (path.resolve(draft) === path.resolve(file)) {
    throw new Error('Refusing to write the draft over its own source');
  }

  const issues = await lintContent(draft, restyled);
  await fs.writeFile(draft, restyled, 'utf-8');

  return {
    draft,
    bytes: Buffer.byteLength(restyled, 'utf-8'),
    issues,
    clean: issues.length === 0,
  };
}
