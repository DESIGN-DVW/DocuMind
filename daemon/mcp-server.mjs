// Redirect stdout -> stderr so JSON-RPC wire is never polluted
console.log = (...args) => process.stderr.write(args.join(' ') + '\n');

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { loadProfile } from '../context/loader.mjs';
import { findRelated } from '../graph/relations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.env.DOCUMIND_DB || path.join(ROOT, 'data/documind.db');
const db = new Database(DB_PATH, { readonly: true });
db.pragma('foreign_keys = ON');

const ctx = await loadProfile();

const server = new McpServer({ name: 'DocuMind', version: '3.0.0' });

// ─────────────────────────────────────────────────────────────────────────────
// Tool 1: search_docs — Full-text search via FTS5
// ─────────────────────────────────────────────────────────────────────────────
server.tool(
  'search_docs',
  'Full-text search across all DocuMind-indexed documentation. Returns ranked results with path, repository, classification, and content snippet. Use this to find existing docs before creating new ones.',
  {
    query: z.string().describe('Search query string'),
    repo: z.string().optional().describe('Filter by repository name'),
    category: z.string().optional().describe('Filter by category (e.g. api, guide, readme)'),
    classification: z
      .string()
      .optional()
      .describe('Filter by classification prefix (e.g. reference, decision, guide)'),
    limit: z.number().int().min(1).max(100).default(20).describe('Maximum results (1-100)'),
  },
  async ({ query, repo, category, classification, limit }) => {
    try {
      const conditions = ['documents_fts MATCH ?'];
      const params = [query];

      if (repo) {
        conditions.push('d.repository = ?');
        params.push(repo);
      }
      if (category) {
        conditions.push('d.category = ?');
        params.push(category);
      }
      if (classification) {
        conditions.push("d.classification LIKE ? || '%'");
        params.push(classification);
      }

      params.push(limit);

      const sql = `
        SELECT d.id, d.path, d.repository, d.filename, d.category, d.classification,
               snippet(documents_fts, 3, '[', ']', '...', 32) as snippet
        FROM documents_fts
        JOIN documents d ON documents_fts.rowid = d.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY rank LIMIT ?
      `;

      const results = db.prepare(sql).all(...params);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ total: results.length, results }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool 2: get_related — Document relationship graph traversal
// ─────────────────────────────────────────────────────────────────────────────
server.tool(
  'get_related',
  'Get documents related to a given document ID (from search_docs results) via relationship graph traversal. Returns paths, relationship types, and traversal depth up to N hops.',
  {
    doc_id: z.number().int().describe('Document ID to traverse from'),
    hops: z.number().int().min(1).max(3).default(2).describe('Maximum traversal depth (1-3)'),
  },
  async ({ doc_id, hops }) => {
    try {
      const results = findRelated(db, doc_id, hops).slice(0, 200);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { doc_id, hops, total: results.length, related: results },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool 3: get_keywords — TF-IDF keyword cloud
// ─────────────────────────────────────────────────────────────────────────────
server.tool(
  'get_keywords',
  'Get TF-IDF keyword cloud. Filter by repository and/or keyword category (technology, action, topic). Returns keywords ranked by score.',
  {
    repo: z.string().optional().describe('Filter by repository name'),
    category: z
      .enum(['technology', 'action', 'topic'])
      .optional()
      .describe('Keyword category filter'),
    limit: z.number().int().min(1).max(200).default(50).describe('Maximum results (1-200)'),
  },
  async ({ repo, category, limit }) => {
    try {
      const conditions = [];
      const params = [];

      if (repo) {
        conditions.push('d.repository = ?');
        params.push(repo);
      }
      if (category) {
        conditions.push('k.category = ?');
        params.push(category);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit);

      const sql = `
        SELECT k.keyword, k.category, k.score, d.repository, d.path
        FROM keywords k JOIN documents d ON k.document_id = d.id
        ${whereClause}
        ORDER BY k.score DESC LIMIT ?
      `;

      const results = db.prepare(sql).all(...params);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ total: results.length, keywords: results }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool 4: get_tree — Folder hierarchy for a repository
// ─────────────────────────────────────────────────────────────────────────────
server.tool(
  'get_tree',
  'Get folder hierarchy for a repository. Returns classified folder structure with document counts and folder types.',
  {
    repo: z.string().describe('Repository name (required)'),
  },
  async ({ repo }) => {
    try {
      const nodes = db
        .prepare('SELECT * FROM folder_nodes WHERE repository = ? ORDER BY depth, path')
        .all(repo);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ repository: repo, total: nodes.length, tree: nodes }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool 5: check_existing — Check if docs covering a topic already exist
// ─────────────────────────────────────────────────────────────────────────────
server.tool(
  'check_existing',
  'Check whether documentation covering a topic already exists. Returns existence boolean, confidence score, and matching documents. Use before creating new docs to avoid duplication.',
  {
    query: z.string().describe('Topic or subject to check for'),
    repo: z.string().optional().describe('Limit check to a specific repository'),
    threshold: z
      .number()
      .min(0)
      .max(1)
      .default(0.5)
      .describe('Confidence threshold for existence (0-1, default 0.5)'),
  },
  async ({ query, repo, threshold }) => {
    try {
      const conditions = ['documents_fts MATCH ?'];
      const params = [query];

      if (repo) {
        conditions.push('d.repository = ?');
        params.push(repo);
      }

      params.push(10);

      const sql = `
        SELECT d.id, d.path, d.repository, d.filename, d.category,
               rank,
               snippet(documents_fts, 3, '[', ']', '...', 32) as snippet
        FROM documents_fts
        JOIN documents d ON documents_fts.rowid = d.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY rank LIMIT ?
      `;

      const rows = db.prepare(sql).all(...params);

      const matches = rows.map(row => {
        // FTS5 rank is negative float; closer to 0 = more relevant
        const score = Math.max(0, Math.min(1, 1 - Math.abs(row.rank) / 20));
        return { ...row, confidence: score };
      });

      const topScore = matches.length > 0 ? matches[0].confidence : 0;
      const exists = topScore >= threshold;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                exists,
                confidence: topScore,
                threshold,
                matches: matches.map(({ rank: _rank, ...m }) => m),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool 6: get_diagrams — Diagram registry
// ─────────────────────────────────────────────────────────────────────────────
server.tool(
  'get_diagrams',
  'Get diagram registry. Filter by repository and/or stale status. Returns diagram names, URLs, and staleness information.',
  {
    repo: z.string().optional().describe('Filter by repository name'),
    stale_only: z.boolean().default(false).describe('Return only stale diagrams'),
    limit: z.number().int().min(1).max(100).default(50).describe('Maximum results (1-100)'),
  },
  async ({ repo, stale_only, limit }) => {
    try {
      const conditions = [];
      const params = [];

      if (repo) {
        conditions.push('repository = ?');
        params.push(repo);
      }
      if (stale_only) {
        conditions.push('stale = 1');
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit);

      const sql = `
        SELECT *,
               COALESCE(curated_url, figjam_url, NULL) as active_url,
               CASE WHEN stale = 1 THEN 1 ELSE 0 END as is_stale
        FROM diagrams
        ${whereClause}
        ORDER BY generated_at DESC
        LIMIT ?
      `;

      const results = db.prepare(sql).all(...params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ total: results.length, diagrams: results }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Start transport
// ─────────────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.log('[mcp-server] DocuMind MCP ready');
