#!/usr/bin/env node
/**
 * Export a FigJam node as a high-quality PNG via the Figma REST API.
 *
 * Usage:
 *   node scripts/export-figma-png.mjs \
 *     --fileKey L8gOzoOCb90ur2g9fDI9hm \
 *     --nodeId 184-410 \
 *     --output /absolute/path/to/diagram.png
 *
 * Requires FIGMA_PAT env var (Figma Personal Access Token).
 * Exit codes: 0 = success, 1 = missing token, 2 = API error, 3 = download error.
 */

import { writeFileSync } from 'fs';

const { FIGMA_PAT } = process.env;

if (!FIGMA_PAT) {
  console.error('[export-figma-png] FIGMA_PAT env var not set — skipping export');
  process.exit(1);
}

const args = process.argv.slice(2);
const get = key => {
  const i = args.indexOf(`--${key}`);
  return i !== -1 ? args[i + 1] : null;
};

const fileKey = get('fileKey');
const nodeId = get('nodeId');
const outputPath = get('output');

if (!fileKey || !nodeId || !outputPath) {
  console.error('[export-figma-png] Usage: --fileKey <key> --nodeId <id> --output <path>');
  process.exit(2);
}

// Figma API expects ':' separator (URL uses '-')
const apiNodeId = nodeId.replace(/-/, ':');

// Step 1: Request export URL from Figma
let exportUrl;
try {
  const res = await fetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${apiNodeId}&scale=2&format=png`,
    { headers: { 'X-Figma-Token': FIGMA_PAT } }
  );
  const json = await res.json();
  if (json.err || !json.images?.[apiNodeId]) {
    console.error(`[export-figma-png] Figma API error: ${json.err ?? 'no image URL returned'}`);
    process.exit(2);
  }
  exportUrl = json.images[apiNodeId];
} catch (err) {
  console.error(`[export-figma-png] Figma API request failed: ${err.message}`);
  process.exit(2);
}

// Step 2: Download the PNG
try {
  const imgRes = await fetch(exportUrl);
  if (!imgRes.ok) {
    console.error(`[export-figma-png] Download failed: HTTP ${imgRes.status}`);
    process.exit(3);
  }
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  writeFileSync(outputPath, buffer);
  console.log(
    `[export-figma-png] PNG exported: ${outputPath} (${(buffer.length / 1024).toFixed(1)}kb)`
  );
} catch (err) {
  console.error(`[export-figma-png] Download error: ${err.message}`);
  process.exit(3);
}
