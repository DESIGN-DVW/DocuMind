#!/usr/bin/env node

/**
 * DocuMind v2.0 — Keyword Extraction & Classification
 * Uses TF-IDF from natural.js for keyword scoring
 */

import natural from 'natural';

const TfIdf = natural.TfIdf;
const tokenizer = new natural.WordTokenizer();

// Technology keywords to classify
const TECH_KEYWORDS = new Set([
  'react',
  'vue',
  'angular',
  'svelte',
  'next',
  'nuxt',
  'vite',
  'webpack',
  'typescript',
  'javascript',
  'node',
  'express',
  'fastify',
  'koa',
  'mongodb',
  'mongoose',
  'postgresql',
  'supabase',
  'redis',
  'sqlite',
  'tailwind',
  'shadcn',
  'radix',
  'mui',
  'storybook',
  'figma',
  'docker',
  'pm2',
  'nginx',
  'vercel',
  'cloudflare',
  'pnpm',
  'npm',
  'yarn',
  'changesets',
  'tsup',
  'esbuild',
  'jest',
  'vitest',
  'cypress',
  'playwright',
  'api',
  'rest',
  'graphql',
  'websocket',
  'mcp',
  'auth',
  'oauth',
  'jwt',
  'supabase',
  'pdf',
  'markdown',
  'mermaid',
  'figjam',
]);

// Action keywords
const ACTION_KEYWORDS = new Set([
  'deploy',
  'build',
  'test',
  'install',
  'configure',
  'setup',
  'migrate',
  'upgrade',
  'fix',
  'debug',
  'monitor',
  'scan',
  'create',
  'delete',
  'update',
  'publish',
  'release',
]);

// Stop words to exclude
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'was',
  'are',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'not',
  'no',
  'nor',
  'if',
  'then',
  'else',
  'when',
  'up',
  'out',
  'so',
  'than',
  'too',
  'very',
  'just',
  'about',
  'above',
  'after',
  'again',
  'all',
  'also',
  'any',
  'because',
  'before',
  'between',
  'both',
  'each',
  'few',
  'more',
  'most',
  'other',
  'over',
  'such',
  'through',
  'under',
  'until',
  'while',
  'use',
  'used',
  'using',
  'file',
  'files',
]);

/**
 * Extract keywords from a document's content
 * @param {string} content - Document text
 * @param {number} [topN=15] - Number of top keywords to return
 * @returns {Array<{keyword: string, category: string, score: number}>}
 */
export function extractKeywords(content, topN = 15) {
  const tfidf = new TfIdf();
  tfidf.addDocument(content);

  const terms = [];
  tfidf.listTerms(0).forEach(item => {
    const word = item.term.toLowerCase();
    if (word.length < 3) return;
    if (STOP_WORDS.has(word)) return;
    if (/^\d+$/.test(word)) return;

    const category = classifyKeyword(word);
    terms.push({
      keyword: word,
      category,
      score: Math.round(item.tfidf * 1000) / 1000,
    });
  });

  return terms.slice(0, topN);
}

/**
 * Classify a keyword into a category
 */
function classifyKeyword(word) {
  if (TECH_KEYWORDS.has(word)) return 'technology';
  if (ACTION_KEYWORDS.has(word)) return 'action';
  return 'topic';
}

/**
 * Extract and store keywords for a document
 * @param {import('better-sqlite3').Database} db
 * @param {number} documentId
 * @param {string} content
 */
export function indexKeywords(db, documentId, content) {
  // Remove existing keywords for this document
  db.prepare('DELETE FROM keywords WHERE document_id = ?').run(documentId);

  const keywords = extractKeywords(content);

  const insert = db.prepare(`
    INSERT INTO keywords (document_id, keyword, category, score, source)
    VALUES (?, ?, ?, ?, 'extracted')
  `);

  const batch = db.transaction(kws => {
    for (const kw of kws) {
      insert.run(documentId, kw.keyword, kw.category, kw.score);
    }
  });

  batch(keywords);

  return keywords;
}
