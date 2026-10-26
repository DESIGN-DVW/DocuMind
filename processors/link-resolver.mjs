/**
 * ESM facade over processors/link-resolver.cjs.
 *
 * The implementation lives in CommonJS because markdownlint custom rules are
 * loaded with a synchronous `require` and cannot await an ESM import. Keeping
 * one implementation behind two entry points is what stops the link checkers
 * from drifting apart again.
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const impl = require('./link-resolver.cjs');

export const { resolveLink, headingSlugs, slugify, extractLinks, INLINE_LINK } = impl;
export default impl;
