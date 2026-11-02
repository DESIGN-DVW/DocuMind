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
import { REPOS_DIR, REPOS_LIST, REGISTRY_PATH } from '../config/env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROFILE_PATH = path.resolve(__dirname, '../config/profiles/dvwdesign.json');

/** Never descend into these looking for nested repos. */
const DESCENT_SKIP = new Set(['node_modules', 'worktrees']);

/**
 * Discover repositories by scanning a base directory for .git subdirectories.
 *
 * Looks one level deeper when a directory is not itself a repo: some repos live
 * under a grouping directory that has no `.git` of its own (`FigmaAPI/FigmailAPP`,
 * `FigmaAPI/@figma-core`, `FigmaAPI/@figma-docs`), and a single-level readdir
 * stops at the group and never reaches them — which left every write tool
 * rejecting paths in those repos as "not under any known repo root" while search
 * still returned their documents from an earlier registry-based scan.
 *
 * Descent is exactly one level and never recurses.
 *
 * Exported for tests; `buildCtx` is the only production caller.
 *
 * @param {string} base - Parent directory to scan
 * @returns {Promise<Array<{ name: string; path: string }>>}
 */
export async function discoverRepos(base) {
  let entries;
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }

  const repos = [];
  const seen = new Set();
  const add = (name, repoPath) => {
    // Top-level wins: a nested copy can never shadow a real repo of the same name.
    if (seen.has(name)) return;
    seen.add(name);
    repos.push({ name, path: repoPath });
  };

  const groups = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const repoPath = path.join(base, entry.name);
    try {
      await fs.access(path.join(repoPath, '.git'));
      add(entry.name, repoPath);
    } catch {
      // Not a repo itself — a candidate grouping directory. Deferred to a second
      // pass so the whole top level is registered before any nested entry is.
      if (!entry.name.startsWith('.') && !DESCENT_SKIP.has(entry.name)) {
        groups.push(repoPath);
      }
    }
  }

  for (const groupPath of groups) {
    let children;
    try {
      children = await fs.readdir(groupPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      if (child.name.startsWith('.') || DESCENT_SKIP.has(child.name)) continue;
      const repoPath = path.join(groupPath, child.name);
      try {
        await fs.access(path.join(repoPath, '.git'));
        add(child.name, repoPath);
      } catch {
        // Not a repo — and we do not go deeper than one level.
      }
    }
  }

  return repos;
}

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
  // Base directory that relative `sources` paths resolve against. REPOS_DIR mode
  // is the live configuration, so it comes first; the registry branch overrides
  // with its own basePath below.
  let sourceBaseDir = REPOS_DIR || path.dirname(profileFilePath);

  if (REPOS_DIR) {
    // REPOS_DIR takes priority — auto-discover repos by scanning for .git dirs
    const discovered = await discoverRepos(REPOS_DIR);
    // If REPOS_LIST is also set, filter to only those named repos
    repoRoots =
      REPOS_LIST !== null
        ? discovered.filter(r => /** @type {string[]} */ (REPOS_LIST).includes(r.name))
        : discovered;
  } else if (validated.repositories) {
    // Inline repository list — filter inactive entries
    repoRoots = validated.repositories
      .filter(r => r.active !== false)
      .map(r => ({ name: r.name, path: r.path }));
  } else {
    // External registry file. DOCUMIND_REGISTRY wins when set; otherwise resolve
    // the profile's value relative to the profile file's directory. That relative
    // value is correct from the main checkout but not from the deployment
    // worktree, which sits outside DVWDesign/ — hence the env override.
    const registryPath =
      REGISTRY_PATH ??
      (path.isAbsolute(validated.repositoryRegistryPath)
        ? validated.repositoryRegistryPath
        : path.resolve(path.dirname(profileFilePath), validated.repositoryRegistryPath));

    let registryRaw;
    try {
      registryRaw = await fs.readFile(registryPath, 'utf-8');
    } catch (err) {
      throw new Error(
        `[DocuMind] Cannot read repository registry from "${registryPath}": ${err.message}\n` +
          `Resolved from profile "${profileFilePath}" ` +
          `(repositoryRegistryPath: "${validated.repositoryRegistryPath}").\n` +
          `Set DOCUMIND_REGISTRY to an absolute path if this checkout is not beside the registry.`
      );
    }

    const registry = JSON.parse(registryRaw);
    repoRoots = registry.repositories
      .filter(r => r.active !== false)
      .map(r => ({ name: r.name, path: path.join(registry.basePath, r.path) }));
    sourceBaseDir = registry.basePath;
  }

  // Doc sources are additive roots that are not repositories — no code, no git.
  // They join repoRoots so that path validation, repo-name derivation and the
  // scanner treat them exactly like any other root; only their provenance
  // differs. Later entries never shadow a repository with the same name.
  const existingNames = new Set(repoRoots.map(r => r.name));
  const sourceRoots = (validated.sources ?? [])
    .filter(s => s.active !== false)
    .filter(s => !existingNames.has(s.name))
    .map(s => ({
      name: s.name,
      path: path.isAbsolute(s.path) ? s.path : path.join(sourceBaseDir, s.path),
      source: true,
    }));
  repoRoots = [...repoRoots, ...sourceRoots];

  // Compile regex patterns once — not on every document classification call
  const classificationRules = validated.classificationRules.map(r => ({
    pattern: new RegExp(r.pattern),
    classification: r.classification,
  }));

  return {
    profileId: validated.id,
    repoRoots,
    scanIgnore: validated.scanIgnore ?? [],
    classificationRules,
    keywordTaxonomy: validated.keywordTaxonomy,
    relationshipTypes: validated.relationshipTypes,
    lintRules: validated.lintRules ?? { profile: 'standard' },
  };
}
