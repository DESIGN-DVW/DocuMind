/**
 * DocuMind v3.0 — Context Profile Loader
 *
 * Loads, validates, and freezes the context profile at daemon startup.
 * A missing, unparseable, or schema-invalid profile throws immediately —
 * never silently degrades.
 *
 * Usage:
 *   import { loadProfile } from '../context/loader.mjs';
 *   const ctx = await loadProfile(); // uses DOCUMIND_PROFILE env var or default
 *
 * @module context/loader
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { profileSchema } from './schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROFILE_PATH = path.resolve(__dirname, '../config/profiles/dvwdesign.json');

/**
 * Load and validate a DocuMind context profile.
 *
 * Resolution order for the profile file path:
 *   1. `profilePath` argument (explicit)
 *   2. `DOCUMIND_PROFILE` environment variable
 *   3. Default: `config/profiles/dvwdesign.json` (relative to this file)
 *
 * @param {string} [profilePath] - Optional explicit path to a profile JSON file
 * @returns {Promise<Readonly<{
 *   profileId: string;
 *   repoRoots: Array<{ name: string; path: string }>;
 *   classificationRules: Array<{ pattern: RegExp; classification: string }>;
 *   keywordTaxonomy: { technology: string[]; action: string[] };
 *   relationshipTypes: string[];
 *   lintRules: { profile: string; customPatternsPath?: string };
 * }>>} Frozen ctx object
 *
 * @throws {Error} If the file cannot be read (ENOENT, EACCES, etc.)
 * @throws {Error} If the file is not valid JSON
 * @throws {import('zod').ZodError} If the JSON fails schema validation
 */
export async function loadProfile(profilePath) {
  // Always work with an absolute path so that relative repositoryRegistryPath
  // values resolve correctly regardless of the caller's working directory.
  const filePath = path.resolve(
    profilePath || process.env.DOCUMIND_PROFILE || DEFAULT_PROFILE_PATH
  );

  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    throw new Error(
      `[DocuMind] Cannot load context profile from "${filePath}": ${err.message}\n` +
        `Set DOCUMIND_PROFILE env var to a valid profile JSON path.`
    );
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`[DocuMind] Profile at "${filePath}" is not valid JSON: ${err.message}`);
  }

  // Throws ZodError with field-level messages if validation fails.
  // Let it propagate — the caller (server.mjs) handles it and calls process.exit(1).
  const validated = profileSchema.parse(json);

  const ctx = await buildCtx(validated, filePath);
  return Object.freeze(ctx);
}

/**
 * Build the ctx object from a validated profile.
 *
 * @param {import('zod').infer<typeof profileSchema>} validated
 * @param {string} profileFilePath - Resolved path to the profile file (used for relative path resolution)
 * @returns {Promise<object>}
 */
async function buildCtx(validated, profileFilePath) {
  let repoRoots;

  if (validated.repositories) {
    // Inline repository list — filter inactive entries
    repoRoots = validated.repositories
      .filter(r => r.active !== false)
      .map(r => ({ name: r.name, path: r.path }));
  } else {
    // External registry file — resolve relative to the profile file's directory
    const registryPath = path.isAbsolute(validated.repositoryRegistryPath)
      ? validated.repositoryRegistryPath
      : path.resolve(path.dirname(profileFilePath), validated.repositoryRegistryPath);

    let registryRaw;
    try {
      registryRaw = await fs.readFile(registryPath, 'utf-8');
    } catch (err) {
      throw new Error(
        `[DocuMind] Cannot read repository registry from "${registryPath}": ${err.message}`
      );
    }

    const registry = JSON.parse(registryRaw);
    repoRoots = registry.repositories
      .filter(r => r.active !== false)
      .map(r => ({ name: r.name, path: path.join(registry.basePath, r.path) }));
  }

  // Compile regex patterns once — not on every document classification call
  const classificationRules = validated.classificationRules.map(r => ({
    pattern: new RegExp(r.pattern),
    classification: r.classification,
  }));

  return {
    profileId: validated.id,
    repoRoots,
    classificationRules,
    keywordTaxonomy: validated.keywordTaxonomy,
    relationshipTypes: validated.relationshipTypes,
    lintRules: validated.lintRules ?? { profile: 'standard' },
  };
}
