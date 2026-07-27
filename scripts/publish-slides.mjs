#!/usr/bin/env node

/**
 * Publish Slides CLI — Render Stage (Phase 24, v3.4 Presentation Pipeline)
 *
 * Thin CLI wrapper around processors/slides-processor.mjs's renderDeck().
 * Mirrors the "CLI wrapper around a processor" convention used by
 * scripts/fix-markdown.mjs. No DB handle in this phase — the run ledger
 * (slide_pipeline_runs) is wired in Phase 26.
 *
 * Usage:
 *   npm run slides:build                              # render every EN deck
 *   npm run slides:build -- <deck.md>                  # render only one deck
 *   npm run slides:build -- --render-only <deck.md>    # same, explicit flag
 *
 * Deck discovery excludes `*.fr.md` (French translations don't exist yet in
 * Phase 24, but writing the glob this way now avoids a rename in Phase 25).
 *
 * `--render-only` is currently a no-op (render is the only pipeline stage
 * that exists this phase); the flag is accepted and kept so Phase 25/28's
 * `--translate`/`--deploy` additions don't require renaming this entry point.
 *
 * @module scripts/publish-slides
 */

import path from 'path';
import fg from 'fast-glob';
import { renderDeck } from '../processors/slides-processor.mjs';
import { ROOT } from '../config/env.mjs';

/**
 * Parses argv into an explicit deck path (if any) and recognized flags.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ deckArg: string|null, renderOnly: boolean }}
 */
function parseArgs(argv) {
  let deckArg = null;
  let renderOnly = false;

  for (const arg of argv) {
    if (arg === '--render-only') {
      renderOnly = true;
    } else if (!arg.startsWith('--')) {
      deckArg = arg;
    }
  }

  return { deckArg, renderOnly };
}

/**
 * Discovers all EN Marp decks under docs/slides/, excluding *.fr.md.
 * @returns {Promise<string[]>} Absolute paths to discovered decks.
 */
async function discoverDecks() {
  const matches = await fg('docs/slides/**/*.md', {
    cwd: ROOT,
    ignore: ['docs/slides/**/*.fr.md'],
    absolute: true,
  });
  return matches;
}

async function main() {
  const { deckArg } = parseArgs(process.argv.slice(2));

  const decks = deckArg ? [path.resolve(ROOT, deckArg)] : await discoverDecks();

  if (decks.length === 0) {
    console.warn('[publish-slides] No EN decks found under docs/slides/ — nothing to render.');
    return;
  }

  for (const deck of decks) {
    console.log(`[publish-slides] Rendering ${deck}...`);
    try {
      const result = await renderDeck(deck, { cwd: ROOT });
      console.log(`[publish-slides] Rendered ${deck}:`, JSON.stringify(result));
      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          console.warn(`[publish-slides] ${warning}`);
        }
      }
    } catch (err) {
      console.error('[publish-slides] FAILED:', err.message);
      process.exitCode = 1;
    }
  }
}

main();
