// Redirect stdout -> stderr so JSON-RPC wire is never polluted
console.log = (...args) => process.stderr.write(args.join(' ') + '\n');

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';
import path from 'path';
import { z } from 'zod';
import { loadProfile } from '../context/loader.mjs';
import { findRelated } from '../graph/relations.mjs';
import { createRequire } from 'module';
import fs from 'fs/promises';
import { indexMarkdown } from '../processors/markdown-processor.mjs';
import { runScan, generateDiagramSnapshot as _generateDiagramSnapshot } from '../orchestrator.mjs';
import { relinkDiagram, propagateRelinkAllRepos } from '../processors/relink-processor.mjs';
import {
  fixCodeBlockLanguages,
  fixBoldItalicToHeadingsOrLists,
  fixLineBreaks,
} from '../scripts/fix-markdown.mjs';
import { writingNow } from './registry-lock.mjs';

const require = createRequire(import.meta.url);
const { sync: markdownlintSync, applyFixes } = require('markdownlint');

import {
  ROOT,
  DB_PATH,
  PROFILE_PATH,
  MCP_MODE,
  MCP_TOKEN,
  MCP_CORS_ORIGINS,
} from '../config/env.mjs';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const ctx = await loadProfile();

const MARKDOWNLINT_CONFIG_PATH = path.join(ROOT, 'config/.markdownlint.json');
const RULES_DIR = path.join(ROOT, 'config/rules');

// Derive registryPath for curate_diagram from profile JSON
const profileFilePath = PROFILE_PATH;
const profileRaw = JSON.parse(await fs.readFile(profileFilePath, 'utf-8'));
const REGISTRY_PATH = path.resolve(
  path.dirname(profileFilePath),
  profileRaw.repositoryRegistryPath
);

const server = new McpServer({ name: 'DocuMind', version: '3.0.0' });

// ─────────────────────────────────────────────────────────────────────────────
// Path validation helpers
// ─────────────────────────────────────────────────────────────────────────────

function validatePath(filePath, ctx) {
  const resolved = path.resolve(filePath);
  for (const root of ctx.repoRoots) {
    if (resolved.startsWith(root.path + '/') || resolved === root.path) {
      return { valid: true, repoName: root.name };
    }
  }
  return { valid: false, repoName: null };
}

function pathError(file, ctx, startMs) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: false,
          summary: 'Path rejected: not under any known repo root',
          details: [`${file} is not within any of ${ctx.repoRoots.length} registered repo roots`],
          suggested_action: 'Ensure the file path is absolute and within a registered repository',
          duration_ms: Date.now() - startMs,
        }),
      },
    ],
    isError: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// curate_diagram / register_diagram helper: generate consolidated snapshot
// Wraps the shared orchestrator function to add writingNow tracking so the
// chokidar watcher does not re-index the file while it is being written.
// ─────────────────────────────────────────────────────────────────────────────

async function generateDiagramSnapshot(db) {
  const snapshotPath = path.join(ROOT, 'docs/diagrams/DIAGRAM-REGISTRY.md');
  writingNow.add(snapshotPath);
  try {
    return await _generateDiagramSnapshot(db, ROOT);
  } finally {
    setTimeout(() => writingNow.delete(snapshotPath), 2000);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool 1: search_docs — Full-text search via FTS5
// ─────────────────────────────────────────────────────────────────────────────
server.registerTool(
  'search_docs',
  {
    description:
      'Full-text search across all DocuMind-indexed documentation. Returns ranked results with path, repository, classification, and content snippet. Use this to find existing docs before creating new ones.',
    inputSchema: {
      query: z.string().describe('Search query string'),
      repo: z.string().optional().describe('Filter by repository name'),
      category: z.string().optional().describe('Filter by category (e.g. api, guide, readme)'),
      classification: z
        .string()
        .optional()
        .describe('Filter by classification prefix (e.g. reference, decision, guide)'),
      limit: z.number().int().min(1).max(100).default(20).describe('Maximum results (1-100)'),
    },
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
server.registerTool(
  'get_related',
  {
    description:
      'Get documents related to a given document ID (from search_docs results) via relationship graph traversal. Returns paths, relationship types, and traversal depth up to N hops.',
    inputSchema: {
      doc_id: z.number().int().describe('Document ID to traverse from'),
      hops: z.number().int().min(1).max(3).default(2).describe('Maximum traversal depth (1-3)'),
    },
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
server.registerTool(
  'get_keywords',
  {
    description:
      'Get TF-IDF keyword cloud. Filter by repository and/or keyword category (technology, action, topic). Returns keywords ranked by score.',
    inputSchema: {
      repo: z.string().optional().describe('Filter by repository name'),
      category: z
        .enum(['technology', 'action', 'topic'])
        .optional()
        .describe('Keyword category filter'),
      limit: z.number().int().min(1).max(200).default(50).describe('Maximum results (1-200)'),
    },
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
server.registerTool(
  'get_tree',
  {
    description:
      'Get folder hierarchy for a repository. Returns classified folder structure with document counts and folder types.',
    inputSchema: {
      repo: z.string().describe('Repository name (required)'),
    },
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
server.registerTool(
  'check_existing',
  {
    description:
      'Check whether documentation covering a topic already exists. Returns existence boolean, confidence score, and matching documents. Use before creating new docs to avoid duplication.',
    inputSchema: {
      query: z.string().describe('Topic or subject to check for'),
      repo: z.string().optional().describe('Limit check to a specific repository'),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .default(0.5)
        .describe('Confidence threshold for existence (0-1, default 0.5)'),
    },
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
server.registerTool(
  'get_diagrams',
  {
    description:
      'Get diagram registry. Filter by repository and/or stale status. Returns diagram names, URLs, and staleness information.',
    inputSchema: {
      repo: z.string().optional().describe('Filter by repository name'),
      stale_only: z.boolean().default(false).describe('Return only stale diagrams'),
      limit: z.number().int().min(1).max(100).default(50).describe('Maximum results (1-100)'),
    },
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
// Tool 7: get_similarities — Similar/duplicate document pairs (MCPI-01)
// ─────────────────────────────────────────────────────────────────────────────
server.registerTool(
  'get_similarities',
  {
    description:
      'Get similar or duplicate document pairs with similarity scores. Returns document paths, repositories, similarity scores, and deviation types. Filter by repository and/or minimum score threshold.',
    inputSchema: {
      repo: z
        .string()
        .optional()
        .describe('Filter to pairs where at least one doc is in this repository'),
      min_score: z
        .number()
        .min(0)
        .max(1)
        .default(0.7)
        .describe('Minimum similarity score threshold (0-1)'),
      include_reviewed: z.boolean().default(false).describe('Include already-reviewed pairs'),
      limit: z.number().int().min(1).max(100).default(50).describe('Maximum results (1-100)'),
    },
  },
  async ({ repo, min_score, include_reviewed, limit }) => {
    try {
      const conditions = ['cs.similarity_score >= ?'];
      const params = [min_score];

      if (repo) {
        conditions.push('(d1.repository = ? OR d2.repository = ?)');
        params.push(repo, repo);
      }
      if (!include_reviewed) {
        conditions.push('cs.reviewed = 0');
      }

      params.push(limit);

      const sql = `
        SELECT d1.path as doc1_path, d1.repository as doc1_repo,
               d2.path as doc2_path, d2.repository as doc2_repo,
               cs.similarity_score, cs.deviation_type, cs.reviewed,
               cs.notes, cs.detected_at
        FROM content_similarities cs
        JOIN documents d1 ON cs.doc1_id = d1.id
        JOIN documents d2 ON cs.doc2_id = d2.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY cs.similarity_score DESC
        LIMIT ?
      `;

      const pairs = db.prepare(sql).all(...params);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ total: pairs.length, pairs }, null, 2),
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
// Tool 8: get_deviations — Convention deviations across documentation (MCPI-02)
// ─────────────────────────────────────────────────────────────────────────────
server.registerTool(
  'get_deviations',
  {
    description:
      'Get convention deviations detected across documentation. Returns deviation type, severity, affected document path, and description. Covers all 5 types: content_drift, structure_change, rule_violation, version_mismatch, metadata_inconsistency.',
    inputSchema: {
      repo: z.string().optional().describe('Filter by repository name'),
      deviation_type: z
        .enum([
          'content_drift',
          'structure_change',
          'rule_violation',
          'version_mismatch',
          'metadata_inconsistency',
        ])
        .optional()
        .describe('Filter by deviation type'),
      severity: z
        .enum(['critical', 'major', 'minor', 'info'])
        .optional()
        .describe('Filter by severity level'),
      include_resolved: z.boolean().default(false).describe('Include resolved deviations'),
      limit: z.number().int().min(1).max(200).default(50).describe('Maximum results (1-200)'),
    },
  },
  async ({ repo, deviation_type, severity, include_resolved, limit }) => {
    try {
      const conditions = [];
      const params = [];

      if (repo) {
        conditions.push('d.repository = ?');
        params.push(repo);
      }
      if (deviation_type) {
        conditions.push('dev.deviation_type = ?');
        params.push(deviation_type);
      }
      if (severity) {
        conditions.push('dev.severity = ?');
        params.push(severity);
      }
      if (!include_resolved) {
        conditions.push('dev.resolved_at IS NULL');
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit);

      const sql = `
        SELECT dev.id, dev.deviation_type, dev.severity, dev.description,
               dev.detected_at, dev.resolved_at, dev.resolution_action,
               d.path as file_path, d.repository,
               rd.path as related_doc_path
        FROM deviations dev
        JOIN documents d ON dev.document_id = d.id
        LEFT JOIN documents rd ON dev.related_doc_id = rd.id
        ${whereClause}
        ORDER BY
          CASE dev.severity
            WHEN 'critical' THEN 1
            WHEN 'major' THEN 2
            WHEN 'minor' THEN 3
            ELSE 4
          END,
          dev.detected_at DESC
        LIMIT ?
      `;

      const deviations = db.prepare(sql).all(...params);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ total: deviations.length, deviations }, null, 2),
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
// Tool 9: index_file — Re-index a single markdown file (MCPW-01)
// ─────────────────────────────────────────────────────────────────────────────
server.registerTool(
  'index_file',
  {
    description:
      'Re-index a single markdown file after editing. Updates search index, summary, classification, and tags. Use after modifying a doc to keep DocuMind in sync.',
    inputSchema: {
      file: z.string().describe('Absolute path to the markdown file to index'),
    },
  },
  async ({ file }) => {
    const startMs = Date.now();
    try {
      const { valid, repoName } = validatePath(file, ctx);
      if (!valid) return pathError(file, ctx, startMs);

      await indexMarkdown(db, file, repoName, ctx);
      db.prepare("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')").run();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              summary: `Indexed ${path.basename(file)}`,
              details: [{ file, repository: repoName, action: 'updated' }],
              duration_ms: Date.now() - startMs,
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              summary: err.message,
              suggested_action: 'Check that the file exists and is valid markdown',
              duration_ms: Date.now() - startMs,
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool 10: lint_file — Lint a markdown file (MCPW-02)
// ─────────────────────────────────────────────────────────────────────────────
server.registerTool(
  'lint_file',
  {
    description:
      'Lint a markdown file using DocuMind markdownlint config. Returns issues with line numbers, rule codes, and fixability. Read-only — does not modify the file. Use before fix_file to preview changes.',
    inputSchema: {
      file: z.string().describe('Absolute path to the markdown file to lint'),
    },
  },
  async ({ file }) => {
    const startMs = Date.now();
    try {
      const { valid } = validatePath(file, ctx);
      if (!valid) return pathError(file, ctx, startMs);

      const content = await fs.readFile(file, 'utf-8');
      const config = JSON.parse(await fs.readFile(MARKDOWNLINT_CONFIG_PATH, 'utf-8'));

      const customRules = [];
      try {
        customRules.push(require(path.join(RULES_DIR, 'force-align-table-columns.cjs')));
        customRules.push(require(path.join(RULES_DIR, 'table-separator-spacing.cjs')));
      } catch {
        /* custom rules optional */
      }

      const rawResults = markdownlintSync({
        strings: { [file]: content },
        config,
        customRules,
      });

      const issues = (rawResults[file] || []).map(issue => ({
        line: issue.lineNumber,
        rule: issue.ruleNames[0],
        message: issue.ruleDescription,
        detail: issue.errorDetail,
        fixable: issue.fixInfo !== null,
      }));

      const fixableCount = issues.filter(i => i.fixable).length;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              summary: `${issues.length} issues found (${fixableCount} auto-fixable)`,
              issues,
              total: issues.length,
              fixable_count: fixableCount,
              duration_ms: Date.now() - startMs,
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              summary: err.message,
              suggested_action: 'Check that the file exists and is readable',
              duration_ms: Date.now() - startMs,
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool 11: fix_file — Auto-fix markdown issues (MCPW-03)
// ─────────────────────────────────────────────────────────────────────────────
server.registerTool(
  'fix_file',
  {
    description:
      'Auto-fix markdown issues in a file. Applies markdownlint auto-fixes (trailing spaces, tabs, etc.) plus custom DocuMind fixes (code block languages, bold-italic conversion). Re-indexes the file after fixing.',
    inputSchema: {
      file: z.string().describe('Absolute path to the markdown file to fix'),
    },
  },
  async ({ file }) => {
    const startMs = Date.now();
    try {
      const { valid, repoName } = validatePath(file, ctx);
      if (!valid) return pathError(file, ctx, startMs);

      const content = await fs.readFile(file, 'utf-8');
      const config = JSON.parse(await fs.readFile(MARKDOWNLINT_CONFIG_PATH, 'utf-8'));

      const customRules = [];
      try {
        customRules.push(require(path.join(RULES_DIR, 'force-align-table-columns.cjs')));
        customRules.push(require(path.join(RULES_DIR, 'table-separator-spacing.cjs')));
      } catch {
        /* custom rules optional */
      }

      // Pass 1 — markdownlint auto-fixes
      const issues =
        markdownlintSync({ strings: { [file]: content }, config, customRules })[file] || [];
      const pass1 = applyFixes(content, issues);
      const fixedRules = [
        ...new Set(issues.filter(i => i.fixInfo !== null).map(i => i.ruleNames[0])),
      ];

      // Pass 2 — custom fixes from fix-markdown.mjs
      let lines = pass1.split('\n');
      const beforeCustom = lines.join('\n');
      lines = fixCodeBlockLanguages(lines);
      const afterCodeBlock = lines.join('\n');
      lines = fixBoldItalicToHeadingsOrLists(lines);
      lines = fixLineBreaks(lines);
      const finalContent = lines.join('\n');

      // Track which custom fix passes changed content
      const customFixes = [];
      if (afterCodeBlock !== beforeCustom) customFixes.push('code-block-language-detection');
      if (finalContent !== afterCodeBlock) customFixes.push('custom-formatting-fixes');

      // Count differing lines
      const originalLines = content.split('\n');
      const finalLines = finalContent.split('\n');
      const maxLen = Math.max(originalLines.length, finalLines.length);
      let linesChanged = 0;
      for (let i = 0; i < maxLen; i++) {
        if (originalLines[i] !== finalLines[i]) linesChanged++;
      }

      const changed = finalContent !== content;

      if (changed) {
        await fs.writeFile(file, finalContent, 'utf-8');
        await indexMarkdown(db, file, repoName, ctx);
        db.prepare("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')").run();
      }

      const allFixes = [...fixedRules, ...customFixes];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              changed
                ? {
                    success: true,
                    summary: `Fixed ${path.basename(file)} — ${allFixes.length} fix type(s) applied`,
                    fixes_applied: allFixes,
                    file,
                    lines_changed: linesChanged,
                    duration_ms: Date.now() - startMs,
                  }
                : {
                    success: true,
                    summary: `No fixes needed for ${path.basename(file)}`,
                    fixes_applied: [],
                    file,
                    lines_changed: 0,
                    duration_ms: Date.now() - startMs,
                  }
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              summary: err.message,
              suggested_action: 'Check that the file exists and is writable',
              duration_ms: Date.now() - startMs,
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool 12: trigger_scan — Trigger documentation scan (MCPW-04)
// ─────────────────────────────────────────────────────────────────────────────
server.registerTool(
  'trigger_scan',
  {
    description:
      'Trigger a documentation scan across repositories. Incremental (default) scans only changed files. Full re-indexes everything. Optionally limit to a single repo.',
    inputSchema: {
      mode: z.enum(['incremental', 'full']).default('incremental').describe('Scan mode'),
      repo: z.string().optional().describe('Limit scan to a single repository name'),
    },
  },
  async ({ mode, repo }) => {
    const startMs = Date.now();
    try {
      const result = await runScan(db, ctx, { mode, repo: repo || null });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              summary: `${mode} scan complete: ${result.added} added, ${result.updated} updated`,
              details: [result],
              duration_ms: Date.now() - startMs,
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              summary: err.message,
              suggested_action: 'Check DocuMind daemon logs for details',
              duration_ms: Date.now() - startMs,
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool 13: curate_diagram — Set curated FigJam URL and propagate (MCPW-05)
// ─────────────────────────────────────────────────────────────────────────────
server.registerTool(
  'curate_diagram',
  {
    description:
      'Set a curated FigJam URL for a diagram and propagate the URL change across all repository markdown files. Regenerates the consolidated diagram registry snapshot. Changes are left unstaged for review.',
    inputSchema: {
      name: z.string().describe('Diagram name from the diagrams table (use get_diagrams to find)'),
      curated_url: z.string().url().describe('New curated FigJam URL to set for this diagram'),
    },
  },
  async ({ name, curated_url: curatedUrl }) => {
    const startMs = Date.now();
    try {
      const relinkResult = relinkDiagram(db, name, curatedUrl);

      if (!relinkResult) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                summary: 'Diagram not found',
                suggested_action: 'Use get_diagrams to find valid diagram names',
                duration_ms: Date.now() - startMs,
              }),
            },
          ],
          isError: true,
        };
      }

      const { oldUrl } = relinkResult;

      const propagated = oldUrl
        ? await propagateRelinkAllRepos(db, oldUrl, curatedUrl, REGISTRY_PATH)
        : {};

      const propagatedFileCount = Object.values(propagated).reduce(
        (sum, files) => sum + files.length,
        0
      );

      const snapshotPath = await generateDiagramSnapshot(db);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              summary: `Diagram '${name}' curated — URL propagated to ${propagatedFileCount} file(s)`,
              details: {
                diagram: name,
                old_url: oldUrl,
                new_url: curatedUrl,
                propagated,
              },
              snapshot_written: snapshotPath,
              duration_ms: Date.now() - startMs,
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              summary: err.message,
              suggested_action: 'Check that the diagram exists and the URL is valid',
              duration_ms: Date.now() - startMs,
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool 14: register_diagram — Register a new diagram from .mmd file (DIAG-02)
// ─────────────────────────────────────────────────────────────────────────────
server.registerTool(
  'register_diagram',
  {
    description:
      'Register a new diagram in the DocuMind database from a .mmd (Mermaid) file. Auto-detects diagram type from content. Use this after generating a new diagram to track it in the registry.',
    inputSchema: {
      mermaid_path: z.string().describe('Absolute path to the .mmd file'),
      name: z.string().describe('Human-readable diagram name (e.g. "DocuMind Architecture")'),
      repository: z.string().describe('Repository name the diagram belongs to (e.g. "DocuMind")'),
      figjam_url: z.string().url().optional().describe('FigJam URL if already generated'),
    },
  },
  async ({ mermaid_path: mermaidPath, name, repository, figjam_url: figjamUrl }) => {
    const startMs = Date.now();
    try {
      // Validate file exists
      try {
        await fs.access(mermaidPath);
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `File not found: ${mermaidPath}`,
              }),
            },
          ],
          isError: true,
        };
      }

      // Read .mmd content
      const content = await fs.readFile(mermaidPath, 'utf-8');

      // Auto-detect diagram type from content
      let diagramType = 'flowchart';
      if (/sequenceDiagram/.test(content)) {
        diagramType = 'sequence';
      } else if (/stateDiagram/.test(content)) {
        diagramType = 'state';
      } else if (/\bgantt\b/.test(content)) {
        diagramType = 'gantt';
      } else if (/classDiagram/.test(content)) {
        diagramType = 'relationship_graph';
      } else if (/graph\s+(TD|LR|RL|BT)/.test(content)) {
        // Heuristic: folder/directory nodes suggest folder_tree
        if (/[\\/]|\bdir\b|\bfolder\b|\bnode_modules\b/.test(content)) {
          diagramType = 'folder_tree';
        } else {
          diagramType = 'flowchart';
        }
      }

      // Compute SHA-256 source hash
      const { createHash } = await import('crypto');
      const sourceHash = createHash('sha256').update(content).digest('hex');

      // Check for existing diagram with same name + repository
      const existing = db
        .prepare('SELECT id, source_hash FROM diagrams WHERE name = ? AND repository = ?')
        .get(name, repository);

      let action;
      let diagramId;

      if (existing) {
        if (existing.source_hash === sourceHash) {
          action = 'unchanged';
          diagramId = existing.id;
        } else {
          db.prepare(
            'UPDATE diagrams SET source_hash = ?, mermaid_path = ?, stale = 0, generated_at = ? WHERE id = ?'
          ).run(sourceHash, mermaidPath, new Date().toISOString(), existing.id);
          action = 'updated';
          diagramId = existing.id;
        }
      } else {
        const result = db
          .prepare(
            `INSERT INTO diagrams
              (diagram_type, name, mermaid_path, figjam_url, repository, generated_at, source_hash, stale)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
          )
          .run(
            diagramType,
            name,
            mermaidPath,
            figjamUrl || null,
            repository,
            new Date().toISOString(),
            sourceHash
          );
        action = 'created';
        diagramId = result.lastInsertRowid;
      }

      // Regenerate the snapshot
      const snapshotPath = await generateDiagramSnapshot(db);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              action,
              diagram_id: diagramId,
              name,
              diagram_type: diagramType,
              repository,
              mermaid_path: mermaidPath,
              source_hash: sourceHash,
              snapshot_written: snapshotPath,
              duration_ms: Date.now() - startMs,
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: err.message,
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Start transport — mode determined by DOCUMIND_MCP_MODE env var
// ─────────────────────────────────────────────────────────────────────────────

if (MCP_MODE === 'stdio') {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('[mcp-server] DocuMind MCP ready (stdio)');
} else if (MCP_MODE === 'http') {
  // --- Validate token requirement ---
  if (!MCP_TOKEN) {
    console.error('[MCP] DOCUMIND_MCP_TOKEN is required in HTTP mode. Exiting.');
    process.exit(1);
  }

  const VALID_TOKENS = new Set(
    MCP_TOKEN.split(',')
      .map(t => t.trim())
      .filter(Boolean)
  );

  if (VALID_TOKENS.size === 0) {
    console.error('[MCP] DOCUMIND_MCP_TOKEN is set but contains no valid tokens. Exiting.');
    process.exit(1);
  }

  // --- Bearer auth middleware ---
  function bearerAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const ip = req.ip || req.socket?.remoteAddress;
      console.error(
        `[MCP] Auth failed: missing token | ${new Date().toISOString()} | ${ip} | ${req.headers.origin ?? ''}`
      );
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized' },
        id: null,
      });
    }
    const token = authHeader.slice(7).trim();
    if (!VALID_TOKENS.has(token)) {
      const ip = req.ip || req.socket?.remoteAddress;
      console.error(
        `[MCP] Auth failed: invalid token | ${new Date().toISOString()} | ${ip} | ${req.headers.origin ?? ''}`
      );
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized' },
        id: null,
      });
    }
    next();
  }

  // --- CORS middleware for /mcp (browser-based MCP clients) ---
  const CORS_ORIGINS = MCP_CORS_ORIGINS
    ? MCP_CORS_ORIGINS.split(',')
        .map(o => o.trim())
        .filter(Boolean)
    : [];

  function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;
    if (CORS_ORIGINS.length === 0 || !origin) return next();
    if (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version'
      );
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  }

  // --- Import Express app from server.mjs ---
  // server.mjs already exports { app, db, server } and is running on port 9000.
  // We add /mcp routes to the existing app.
  const { app } = await import('./server.mjs');

  // --- Mount StreamableHTTPServerTransport ---
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no session tracking
  });

  await server.connect(transport);

  // Mount routes: CORS first, then auth, then transport handler
  app.use('/mcp', corsMiddleware);

  app.post('/mcp', bearerAuthMiddleware, async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', bearerAuthMiddleware, async (req, res) => {
    await transport.handleRequest(req, res);
  });

  app.delete('/mcp', bearerAuthMiddleware, async (req, res) => {
    await transport.handleRequest(req, res);
  });

  console.log('[mcp-server] DocuMind MCP ready (http on /mcp)');
} else {
  console.error(
    `[MCP] Invalid DOCUMIND_MCP_MODE "${MCP_MODE}". Must be "stdio" or "http". Exiting.`
  );
  process.exit(1);
}
