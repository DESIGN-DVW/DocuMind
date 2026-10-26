#!/usr/bin/env node
/**
 * propagate-lint-rules.mjs
 *
 * Propagates the DVW custom markdownlint rules to every DVWDesign repository
 * with markdown files, along with the rule config and the support files the
 * rules need at runtime.
 *
 * Rules are read from config/rules/ rather than listed here, and target repos
 * are pointed at the config/rules/index.cjs registry rather than at individual
 * files — a hand-maintained list silently misses every rule added afterwards,
 * which is how DVW002 came to be missing from the editor config.
 *
 * Also removes the retired MD060A (force-align-table-columns) rule everywhere —
 * column padding is cosmetic churn; markdown is not a design tool.
 *
 * Usage:
 *   node scripts/propagate-lint-rules.mjs              # propagate to all repos
 *   node scripts/propagate-lint-rules.mjs --dry-run    # preview actions only
 *   node scripts/propagate-lint-rules.mjs --repo RootDispatcher  # single repo
 *
 * @version 1.0.0
 * @created 2026-03-22
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { LOCAL_BASE_PATH } from '../config/constants.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Chalk (graceful fallback if not installed) ────────────────────────────
let chalk;
try {
  chalk = (await import('chalk')).default;
} catch {
  // Minimal no-op chalk fallback
  const noop = s => s;
  chalk = new Proxy({}, { get: () => noop });
  chalk.green = noop;
  chalk.red = noop;
  chalk.yellow = noop;
  chalk.cyan = noop;
  chalk.gray = noop;
  chalk.bold = { green: noop, red: noop, yellow: noop };
  chalk.white = { bold: noop };
}

// ─── Constants ─────────────────────────────────────────────────────────────
const BASE_PATH = LOCAL_BASE_PATH;
const DOCUMIND_PATH = path.resolve(__dirname, '..');
const RULES_SRC = path.join(DOCUMIND_PATH, 'config', 'rules');

/** All DVWDesign repos with markdown files (excluding DocuMind itself) */
const ALL_TARGET_REPOS = [
  '@figma-agents',
  '@figma-core',
  'Aprimo',
  'CampaignManager',
  'Contentful',
  'Figma-Plug-ins',
  'FigmaDSController',
  'GlossiaApp',
  'LibraryAssetManager',
  'RandD',
  'RootDispatcher',
  'any2figma',
  'mjml-dev-mode-proposal',
  'mjml-dev-mode',
  'mjml_mcp',
  'shared-packages',
];

/**
 * Every rule module, read from the registry directory rather than listed here.
 * A hardcoded list is how DVW002 came to be missing from the editor config and
 * how the retired MD060A rule outlived its deletion.
 */
const RULE_FILES = fs
  .readdirSync(RULES_SRC)
  .filter(f => f.endsWith('.cjs'))
  .sort();

/**
 * Files outside config/rules/ that the rules need at runtime.
 *
 * DVW009 requires the shared link resolver and DVW006 its duration
 * vocabulary. Both degrade to a no-op when missing rather than breaking the
 * registry, but a repo that receives the rules should receive working rules.
 *
 * @type {{src: string, dest: string}[]}
 */
const SUPPORT_FILES = [
  {
    src: path.join(DOCUMIND_PATH, 'config', '.markdownlint.json'),
    dest: 'config/.markdownlint.json',
  },
  {
    src: path.join(DOCUMIND_PATH, 'config', 'style-vocabulary.json'),
    dest: 'config/style-vocabulary.json',
  },
  {
    src: path.join(DOCUMIND_PATH, 'processors', 'link-resolver.cjs'),
    dest: 'processors/link-resolver.cjs',
  },
];

/** Retired rules to delete from target repos (and drop from their configs) */
const OBSOLETE_RULE_FILES = ['force-align-table-columns.cjs'];

/**
 * Target .markdownlint-cli2.jsonc.
 *
 * Points at the registry and the propagated rule config rather than inlining
 * either, so a repo cannot drift from DocuMind by editing its own copy.
 */
const MARKDOWNLINT_CONFIG = `// markdownlint-cli2 configuration — propagated from DocuMind
// Do not edit: run \`node scripts/propagate-lint-rules.mjs\` in DocuMind instead.
//
//   config/.markdownlint.json  → rule configuration (also propagated)
//   config/rules/index.cjs     → custom rule registry (auto-discovers *.cjs)
{
  "customRules": ["./config/rules/index.cjs"],
  "config": {
    "extends": "./config/.markdownlint.json"
  },
  "ignores": [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".planning",
    ".claude",
    "archive",
    "_archive",
    "archives",
    "index",
    "graphify-out",
    "test/fixtures"
  ]
}
`;

// ─── Argument parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const repoFlag = args.indexOf('--repo');
const targetRepo = repoFlag !== -1 ? args[repoFlag + 1] : null;

const TARGET_REPOS = targetRepo ? [targetRepo] : ALL_TARGET_REPOS;

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Detect package manager for a repo.
 * @param {string} repoPath - Absolute path to repo root
 * @returns {'pnpm' | 'pnpm-workspace' | 'npm'}
 */
function detectPackageManager(repoPath) {
  if (fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml'))) {
    // Workspace root requires -w flag to add to root package
    if (fs.existsSync(path.join(repoPath, 'pnpm-workspace.yaml'))) {
      return 'pnpm-workspace';
    }
    return 'pnpm';
  }
  return 'npm';
}

/**
 * Check if a package is in devDependencies of the repo's package.json.
 * @param {string} repoPath
 * @param {string} pkgName
 * @returns {boolean}
 */
function hasDevDep(repoPath, pkgName) {
  const pkgJsonPath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    return !!(pkg.devDependencies && pkg.devDependencies[pkgName]);
  } catch {
    return false;
  }
}

/** The one entry every repo should list — the registry, not individual rules. */
const REGISTRY_ENTRY = './config/rules/index.cjs';

/**
 * Migrate an existing .markdownlint-cli2.jsonc onto the registry.
 *
 * Repos provisioned before the registry existed list each rule file by hand,
 * which is precisely the drift this replaces — a per-file list silently misses
 * every rule added afterwards. Any `./config/rules/*.cjs` entry is collapsed
 * into the single registry entry, and `extends` is pointed at the propagated
 * rule config. Entries pointing outside config/rules/ are left alone: those
 * are the repo's own rules, not ours to remove.
 *
 * @param {string} existingContent - Current file content
 * @returns {string} Updated content
 */
function mergeCustomRules(existingContent) {
  // Strip JSONC comments for parsing
  const stripped = existingContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // Cannot parse — return a fresh config to avoid corruption
    return MARKDOWNLINT_CONFIG;
  }

  const before = JSON.stringify(parsed);

  const foreign = (parsed.customRules ?? []).filter(
    rule => !String(rule).startsWith('./config/rules/')
  );
  parsed.customRules = [REGISTRY_ENTRY, ...foreign];

  // Point at the propagated rule config so enable flags travel with the rules
  parsed.config = { ...(parsed.config ?? {}), extends: './config/.markdownlint.json' };

  if (JSON.stringify(parsed) === before) return existingContent;

  const header =
    '// markdownlint-cli2 configuration — propagated from DocuMind\n' +
    '// Do not edit: run `node scripts/propagate-lint-rules.mjs` in DocuMind instead.\n';
  return header + JSON.stringify(parsed, null, 2) + '\n';
}

// ─── Per-repo propagation ──────────────────────────────────────────────────

/**
 * @typedef {Object} RepoResult
 * @property {string} repo
 * @property {'ok' | 'error' | 'skipped'} status
 * @property {string[]} actions
 * @property {string[]} errors
 */

/**
 * Propagate rules to a single repo.
 * @param {string} repoName
 * @param {boolean} dryRun
 * @returns {RepoResult}
 */
function propagateToRepo(repoName, dryRun) {
  const repoPath = path.join(BASE_PATH, repoName);
  /** @type {RepoResult} */
  const result = { repo: repoName, status: 'ok', actions: [], errors: [] };

  // Validate repo exists
  if (!fs.existsSync(repoPath)) {
    result.status = 'error';
    result.errors.push(`Directory not found: ${repoPath}`);
    return result;
  }

  const rulesDir = path.join(repoPath, 'config', 'rules');
  const configDest = path.join(repoPath, '.markdownlint-cli2.jsonc');
  const pm = detectPackageManager(repoPath);

  // 1. Create config/rules/ directory
  if (!fs.existsSync(rulesDir)) {
    result.actions.push(`Create ${path.join('config', 'rules')} directory`);
    if (!dryRun) {
      fs.mkdirSync(rulesDir, { recursive: true });
    }
  }

  // 2. Copy rule files
  for (const ruleFile of RULE_FILES) {
    const src = path.join(RULES_SRC, ruleFile);
    const dest = path.join(rulesDir, ruleFile);

    if (!fs.existsSync(src)) {
      result.errors.push(`Source rule not found: ${src}`);
      continue;
    }

    result.actions.push(`Copy ${ruleFile} → config/rules/`);
    if (!dryRun) {
      fs.copyFileSync(src, dest);
    }
  }

  // 2a. Copy the rule config and the rules' runtime dependencies. Without the
  // config the target repo loads the DVW rules but not their enable flags, so
  // the opt-in prose rewriters would switch themselves on wherever
  // `default: true` applies.
  for (const { src, dest: relDest } of SUPPORT_FILES) {
    if (!fs.existsSync(src)) {
      result.errors.push(`Support file not found: ${src}`);
      continue;
    }
    const dest = path.join(repoPath, relDest);
    result.actions.push(`Copy ${path.basename(src)} → ${relDest}`);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }

  // 2b. Delete retired rule files
  for (const ruleFile of OBSOLETE_RULE_FILES) {
    const dest = path.join(rulesDir, ruleFile);
    if (fs.existsSync(dest)) {
      result.actions.push(`Remove retired rule ${ruleFile}`);
      if (!dryRun) {
        fs.unlinkSync(dest);
      }
    }
  }

  // 3. Create or merge .markdownlint-cli2.jsonc
  if (fs.existsSync(configDest)) {
    const existing = fs.readFileSync(configDest, 'utf8');
    const merged = mergeCustomRules(existing);
    if (merged !== existing) {
      result.actions.push('Merge customRules into existing .markdownlint-cli2.jsonc');
      if (!dryRun) {
        fs.writeFileSync(configDest, merged, 'utf8');
      }
    } else {
      result.actions.push('.markdownlint-cli2.jsonc already has customRules (no change)');
    }
  } else {
    result.actions.push('Create .markdownlint-cli2.jsonc');
    if (!dryRun) {
      fs.writeFileSync(configDest, MARKDOWNLINT_CONFIG, 'utf8');
    }
  }

  // 4. Install markdownlint-cli2 devDependency if missing
  const depsToCheck = [{ pkg: 'markdownlint-cli2', installPkg: 'markdownlint-cli2' }];

  for (const { pkg, installPkg } of depsToCheck) {
    if (!hasDevDep(repoPath, pkg)) {
      const installCmd =
        pm === 'pnpm'
          ? `pnpm add -D ${installPkg}`
          : pm === 'pnpm-workspace'
            ? `pnpm add -D -w ${installPkg}`
            : `npm install --save-dev ${installPkg}`;
      result.actions.push(`Install ${pkg} (${pm}): ${installCmd}`);
      if (!dryRun) {
        try {
          execSync(installCmd, { cwd: repoPath, stdio: 'pipe', timeout: 120_000 });
        } catch (err) {
          result.errors.push(`Failed to install ${pkg}: ${err.message.slice(0, 120)}`);
        }
      }
    } else {
      result.actions.push(`${pkg} already in devDeps (skip install)`);
    }
  }

  if (result.errors.length > 0) result.status = 'error';
  return result;
}

// ─── Main ──────────────────────────────────────────────────────────────────

console.log('');
console.log(chalk.cyan('DocuMind — Lint Rule Propagation'));
console.log(chalk.gray(`Base: ${BASE_PATH}`));
console.log(chalk.gray(`Rules src: ${RULES_SRC}`));
if (isDryRun) console.log(chalk.yellow('DRY RUN — no changes will be made'));
if (targetRepo) console.log(chalk.yellow(`Single repo mode: ${targetRepo}`));
console.log(chalk.gray(`Targets: ${TARGET_REPOS.length} repos`));
console.log('');

// Validate target repo if specified
if (targetRepo && !ALL_TARGET_REPOS.includes(targetRepo)) {
  console.log(chalk.red(`Unknown repo: ${targetRepo}`));
  console.log(chalk.gray(`Known repos: ${ALL_TARGET_REPOS.join(', ')}`));
  process.exit(1);
}

/** @type {RepoResult[]} */
const results = [];

for (const repo of TARGET_REPOS) {
  process.stdout.write(chalk.cyan(`  ${repo.padEnd(30)} `));
  const result = propagateToRepo(repo, isDryRun);
  results.push(result);

  if (result.status === 'error') {
    console.log(chalk.red('ERROR'));
  } else {
    console.log(chalk.green('OK'));
  }

  for (const action of result.actions) {
    console.log(chalk.gray(`    → ${action}`));
  }
  for (const err of result.errors) {
    console.log(chalk.red(`    ✗ ${err}`));
  }
}

// ─── Summary table ─────────────────────────────────────────────────────────
console.log('');
console.log(chalk.cyan('─'.repeat(72)));
console.log(chalk.cyan('Summary'));
console.log(chalk.cyan('─'.repeat(72)));

const header = ['Repo'.padEnd(30), 'Status'.padEnd(8), 'Actions'].join(' | ');
console.log(chalk.white(header));
console.log(chalk.gray('─'.repeat(72)));

let okCount = 0;
let errorCount = 0;

for (const r of results) {
  const statusLabel = r.status === 'ok' ? chalk.green('OK') : chalk.red('ERROR');
  const actionCount = `${r.actions.length} action${r.actions.length === 1 ? '' : 's'}`;
  const errLabel =
    r.errors.length > 0
      ? chalk.red(` (${r.errors.length} error${r.errors.length > 1 ? 's' : ''})`)
      : '';
  console.log(`  ${r.repo.padEnd(30)} ${statusLabel.padEnd(8)}  ${actionCount}${errLabel}`);
  if (r.status === 'ok') okCount++;
  else errorCount++;
}

console.log(chalk.gray('─'.repeat(72)));
console.log(
  `  Total: ${chalk.green(okCount + ' ok')}${errorCount > 0 ? ', ' + chalk.red(errorCount + ' error(s)') : ''}`
);
if (isDryRun) {
  console.log(chalk.yellow('  (dry run — no files written)'));
}
console.log('');

process.exit(errorCount > 0 ? 1 : 0);
