/**
 * Translation processor — EN↔FR markdown via DeepL.
 *
 * Opt-in per file. A document is translated only when its frontmatter carries
 * `translate: fr`; there is no blanket translation of the corpus.
 *
 * The hard part is not the API call, it is not corrupting the markdown. Code
 * fences, inline code, URLs, file paths, wikilinks, and frontmatter keys are
 * masked out before the request and spliced back afterwards, so a translated
 * document diffs against its source only in prose.
 *
 * Staleness is tracked with the source content hash, stored in the translated
 * file's own frontmatter — re-running is a no-op until the source changes.
 *
 * @version 1.0.0
 * @created 2026-07-28
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import matter from 'gray-matter';
import { DEEPL_API_KEY } from '../config/env.mjs';

/** DeepL free-tier keys carry a `:fx` suffix and use a different host. */
const API_HOST = key =>
  key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';

/** Spans that must reach the output byte-identical. Order matters: fences first. */
const PROTECTED = [
  /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, // fenced code blocks
  /`+[^`\n]*`+/g, // inline code
  /!?\[\[[^\]]+\]\]/g, // wikilinks
  /\]\([^)]*\)/g, // link targets (the text before stays translatable)
  /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, // URLs
  /(?:^|\s)[./~]?[\w.-]*\/[\w./-]+/g, // file paths
  /<(?!dnt\b)[^>\n]+>/g, // HTML tags and autolinks — never the placeholders above
];

const PLACEHOLDER = /<dnt id="(\d+)"\s*\/>/g;

const xmlEscape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xmlUnescape = s =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

/**
 * Replace protected spans with numbered placeholders.
 *
 * @param {string} text
 * @returns {{masked: string, spans: string[]}}
 */
export function maskProtected(text) {
  const spans = [];
  let masked = text;

  for (const pattern of PROTECTED) {
    masked = masked.replace(pattern, match => {
      // Path and HTML patterns can capture a leading space — keep it outside
      const lead = /^\s/.test(match) ? match[0] : '';
      const body = lead ? match.slice(1) : match;
      spans.push(body);
      return `${lead}<dnt id="${spans.length - 1}"/>`;
    });
  }

  return { masked, spans };
}

/**
 * Put the protected spans back.
 *
 * Loops because a span can legitimately contain a placeholder — a fenced block
 * masked after its inner code spans, for instance. Bounded so a malformed span
 * cannot spin forever.
 *
 * @param {string} text
 * @param {string[]} spans
 * @returns {string}
 */
export function unmaskProtected(text, spans) {
  let out = text;
  for (let pass = 0; pass < 10 && PLACEHOLDER.test(out); pass++) {
    PLACEHOLDER.lastIndex = 0;
    out = out.replace(PLACEHOLDER, (_, id) => spans[Number(id)] ?? '');
  }
  PLACEHOLDER.lastIndex = 0;
  return out;
}

/** sha256 of the source body, used for staleness. */
const hash = s => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Call the DeepL API.
 *
 * @param {string[]} texts
 * @param {{target: string, source?: string, key: string}} opts
 * @returns {Promise<string[]>}
 */
async function deepl(texts, { target, source, key }) {
  const body = new URLSearchParams();
  for (const t of texts) body.append('text', t);
  body.set('target_lang', target.toUpperCase());
  if (source) body.set('source_lang', source.toUpperCase());
  body.set('tag_handling', 'xml');
  body.set('ignore_tags', 'dnt');
  body.set('preserve_formatting', '1');

  const res = await fetch(`${API_HOST(key)}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `DeepL responded ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`
    );
  }

  const json = await res.json();
  return (json.translations || []).map(t => t.text);
}

/**
 * Derive the translated file path: `guide.md` → `guide.fr.md`.
 *
 * @param {string} file
 * @param {string} lang
 * @returns {string}
 */
export function translatedPath(file, lang) {
  const dir = path.dirname(file);
  const ext = path.extname(file);
  const stem = path.basename(file, ext).replace(/\.[a-z]{2}$/i, '');
  return path.join(dir, `${stem}.${lang}${ext}`);
}

/**
 * Translate one markdown file into a sibling `<name>.<lang>.md`.
 *
 * @param {string} file Absolute path to the source document
 * @param {{lang?: string, force?: boolean, dryRun?: boolean}} [options]
 * @returns {Promise<{status: 'translated'|'skipped'|'unchanged'|'unavailable',
 *   reason?: string, source: string, target?: string, chars?: number}>}
 */
export async function translateFile(file, options = {}) {
  const { force = false, dryRun = false } = options;

  if (!DEEPL_API_KEY) {
    return {
      status: 'unavailable',
      reason: 'DEEPL_API_KEY is not set — translation stage skipped',
      source: file,
    };
  }

  const raw = await fs.readFile(file, 'utf-8');
  const parsed = matter(raw);
  const lang = options.lang ?? parsed.data.translate;

  if (!lang && !force) {
    return {
      status: 'skipped',
      reason: 'No `translate:` key in frontmatter — translation is opt-in per file',
      source: file,
    };
  }

  const target = translatedPath(file, lang || 'fr');
  const sourceHash = hash(parsed.content);

  // Already translated from this exact source
  if (!force) {
    const existing = await fs.readFile(target, 'utf-8').catch(() => null);
    if (existing && matter(existing).data.source_hash === sourceHash) {
      return {
        status: 'unchanged',
        reason: 'Source unchanged since last translation',
        source: file,
        target,
      };
    }
  }

  const { masked, spans } = maskProtected(parsed.content);
  const [translated] = await deepl([xmlEscape(masked)], {
    target: lang || 'fr',
    source: parsed.data.lang || 'en',
    key: DEEPL_API_KEY,
  });

  const body = unmaskProtected(xmlUnescape(translated), spans);

  const frontmatter = {
    ...parsed.data,
    lang: lang || 'fr',
    translated_from: path.basename(file),
    source_hash: sourceHash,
    translated_at: new Date().toISOString().slice(0, 10),
  };
  // The translation is an output, not another translation source
  delete frontmatter.translate;

  const output = matter.stringify(body, frontmatter);

  if (!dryRun) await fs.writeFile(target, output, 'utf-8');

  return {
    status: 'translated',
    source: file,
    target,
    chars: parsed.content.length,
  };
}

/**
 * Find every document opted in to translation.
 *
 * @param {string[]} files Absolute paths
 * @returns {Promise<{file: string, lang: string}[]>}
 */
export async function findTranslatable(files) {
  const out = [];
  for (const file of files) {
    // Never treat an existing translation as a source
    if (/\.[a-z]{2}\.mdx?$/i.test(file)) continue;
    try {
      const { data } = matter(await fs.readFile(file, 'utf-8'));
      if (data.translate) out.push({ file, lang: String(data.translate) });
    } catch {
      /* unreadable or malformed frontmatter: not translatable */
    }
  }
  return out;
}
