#!/usr/bin/env node

/**
 * DocuMind v2.0 — Mermaid Processor
 * Generates .mmd files and manages FigJam link insertion into markdown
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/**
 * Generate a Mermaid diagram file and register it in the database
 * @param {import('better-sqlite3').Database} db
 * @param {object} options
 * @param {string} options.name - Diagram name
 * @param {string} options.type - Diagram type (folder_tree, relationship_graph, etc.)
 * @param {string} options.mermaidSyntax - Mermaid syntax content
 * @param {string} options.outputDir - Directory to write .mmd file
 * @param {number} [options.documentId] - Associated document ID
 * @param {number} [options.folderNodeId] - Associated folder node ID
 * @param {string} [options.figjamUrl] - FigJam URL (if already generated)
 * @param {string} [options.figjamFileKey] - Figma file key
 * @param {string} [options.repository] - Originating repository name
 */
export async function generateDiagram(db, options) {
  const {
    name,
    type,
    mermaidSyntax,
    outputDir,
    documentId,
    folderNodeId,
    figjamUrl,
    figjamFileKey,
    repository,
  } = options;

  const now = new Date().toISOString();
  const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  const mermaidPath = path.join(outputDir, `${safeName}.mmd`);
  const sourceHash = crypto.createHash('sha256').update(mermaidSyntax).digest('hex');

  // Write .mmd file
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(mermaidPath, mermaidSyntax, 'utf-8');

  // Check if diagram exists and if it's stale
  const existing = db
    .prepare('SELECT id, source_hash FROM diagrams WHERE mermaid_path = ?')
    .get(mermaidPath);

  if (existing) {
    const stale = existing.source_hash !== sourceHash;
    db.prepare(
      `
      UPDATE diagrams
      SET source_hash = ?, stale = ?, generated_at = ?,
          figjam_url = COALESCE(?, figjam_url),
          figjam_file_key = COALESCE(?, figjam_file_key)
      WHERE id = ?
    `
    ).run(sourceHash, stale ? 1 : 0, now, figjamUrl || null, figjamFileKey || null, existing.id);

    return { id: existing.id, mermaidPath, stale, updated: true };
  }

  // Insert new diagram
  const result = db
    .prepare(
      `
    INSERT INTO diagrams (document_id, folder_node_id, diagram_type, name,
                         mermaid_path, figjam_url, figjam_file_key,
                         repository, generated_at, source_hash, stale)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `
    )
    .run(
      documentId || null,
      folderNodeId || null,
      type,
      name,
      mermaidPath,
      figjamUrl || null,
      figjamFileKey || null,
      repository || null,
      now,
      sourceHash
    );

  return { id: result.lastInsertRowid, mermaidPath, stale: false, updated: false };
}

/**
 * Insert a FigJam link into a markdown file after a specific code block or table
 * @param {string} markdownPath - Path to markdown file
 * @param {string} figjamUrl - FigJam URL to insert
 * @param {string} [afterPattern] - Pattern to insert after (regex string)
 */
export async function insertFigjamLink(markdownPath, figjamUrl, afterPattern) {
  let content = await fs.readFile(markdownPath, 'utf-8');

  const linkLine = `\n> [View in FigJam](${figjamUrl})\n`;

  // Check if link already exists
  if (content.includes(figjamUrl)) return false;

  if (afterPattern) {
    const regex = new RegExp(afterPattern, 'm');
    const match = content.match(regex);
    if (match) {
      const insertPos = match.index + match[0].length;
      content = content.slice(0, insertPos) + linkLine + content.slice(insertPos);
    } else {
      // Append at end if pattern not found
      content = content.trimEnd() + '\n' + linkLine;
    }
  } else {
    // Append at end
    content = content.trimEnd() + '\n' + linkLine;
  }

  await fs.writeFile(markdownPath, content, 'utf-8');
  return true;
}

/**
 * Get all stale diagrams that need regeneration
 * @param {import('better-sqlite3').Database} db
 */
export function getStaleDiagrams(db) {
  return db.prepare('SELECT * FROM stale_diagrams').all();
}
