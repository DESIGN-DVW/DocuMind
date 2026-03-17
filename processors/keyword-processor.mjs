#!/usr/bin/env node

/**
 * DocuMind v2.0 — Keyword Extraction & Classification
 * Uses TF-IDF from natural.js for keyword scoring
 */

import natural from 'natural';

const TfIdf = natural.TfIdf;
const tokenizer = new natural.WordTokenizer();

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
 * @param {object} ctx - Context profile object (ctx.keywordTaxonomy used for classification)
 * @param {number} [topN=15] - Number of top keywords to return
 * @returns {Array<{keyword: string, category: string, score: number}>}
 */
export function extractKeywords(content, ctx, topN = 15) {
  const techSet = new Set(ctx.keywordTaxonomy.technology);
  const actionSet = new Set(ctx.keywordTaxonomy.action);

  const tfidf = new TfIdf();
  tfidf.addDocument(content);

  const terms = [];
  tfidf.listTerms(0).forEach(item => {
    const word = item.term.toLowerCase();
    if (word.length < 3) return;
    if (STOP_WORDS.has(word)) return;
    if (/^\d+$/.test(word)) return;

    const category = classifyKeyword(word, techSet, actionSet);
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
 * @param {string} word - The keyword to classify
 * @param {Set<string>} techSet - Set of technology keywords from ctx.keywordTaxonomy.technology
 * @param {Set<string>} actionSet - Set of action keywords from ctx.keywordTaxonomy.action
 * @returns {'technology'|'action'|'topic'}
 */
function classifyKeyword(word, techSet, actionSet) {
  if (techSet.has(word)) return 'technology';
  if (actionSet.has(word)) return 'action';
  return 'topic';
}

/**
 * Extract and store keywords for a document
 * @param {import('better-sqlite3').Database} db
 * @param {number} documentId
 * @param {string} content
 * @param {object} ctx - Context profile object (ctx.keywordTaxonomy used for classification)
 */
export function indexKeywords(db, documentId, content, ctx) {
  // Remove existing keywords for this document
  db.prepare('DELETE FROM keywords WHERE document_id = ?').run(documentId);

  const keywords = extractKeywords(content, ctx);

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

  // Also populate document_tags for per-document tag filtering
  db.prepare('DELETE FROM document_tags WHERE document_id = ? AND source = ?').run(
    documentId,
    'extracted'
  );

  const insertTag = db.prepare(`
    INSERT OR IGNORE INTO document_tags (document_id, tag, source, confidence, created_at)
    VALUES (?, ?, 'extracted', ?, datetime('now'))
  `);

  const tagBatch = db.transaction(kws => {
    for (const kw of kws) {
      // Normalize TF-IDF score to 0-1 confidence range
      // Max TF-IDF score is typically around 10-15 for these documents
      const confidence = Math.min(1.0, Math.round((kw.score / 10) * 1000) / 1000);
      insertTag.run(documentId, kw.keyword, confidence);
    }
  });

  tagBatch(keywords);

  return keywords;
}
