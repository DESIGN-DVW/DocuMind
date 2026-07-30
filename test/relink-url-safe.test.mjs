// Regression test for the diagram-registry URL-doubling corruption.
// Run: node --test test/relink-url-safe.test.mjs
//
// Root cause: propagateRelink used content.replaceAll(oldUrl, newUrl). Curated
// Figma URLs contain the generated URL's board stem as a substring, so repeat
// propagation re-expanded the embedded oldUrl and produced the doubled
// `…-4/DVW-Design-Dev-Strategy?node-id=…` corruption seen in DIAGRAM-REGISTRY.md
// and several docs. replaceUrlSafe must be correct on first pass and idempotent.

import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceUrlSafe } from '../processors/relink-processor.mjs';

const board = 'https://www.figma.com/board/L8gOzoOCb90ur2g9fDI9hm/';
const oldUrl = board; // generated (figjam) URL — the bare board stem
const newUrl = `${board}DVW-Design-Dev-Strategy?node-id=379-1233&t=nGrP3yFxML6BMviB-4/`;

test('first pass replaces old → new', () => {
  const doc = `Open central board: \`${oldUrl}\` for details.`;
  assert.equal(
    replaceUrlSafe(doc, oldUrl, newUrl),
    `Open central board: \`${newUrl}\` for details.`
  );
});

test('second pass is a no-op (no doubling)', () => {
  const doc = `Board: ${oldUrl}`;
  const once = replaceUrlSafe(doc, oldUrl, newUrl);
  const twice = replaceUrlSafe(once, oldUrl, newUrl);
  assert.equal(twice, once);
  assert.ok(!twice.includes('-4/DVW-Design-Dev-Strategy?node-id=379-1233&t'));
});

test('loose old URL is converted while an existing new URL is preserved', () => {
  const mixed = `A ${oldUrl} B ${newUrl} C`;
  assert.equal(replaceUrlSafe(mixed, oldUrl, newUrl), `A ${newUrl} B ${newUrl} C`);
});

test('guards: empty, equal, and absent URLs are no-ops', () => {
  assert.equal(replaceUrlSafe('x', '', newUrl), 'x');
  assert.equal(replaceUrlSafe('x', newUrl, newUrl), 'x');
  assert.equal(replaceUrlSafe('no urls here', oldUrl, newUrl), 'no urls here');
});
