#!/usr/bin/env node
/**
 * propagate-lint-rules.mjs
 *
 * Propagates DVW001 (table-separator-spacing) and MD060A (force-align-table-columns)
 * custom markdownlint rules to all DVWDesign repositories with markdown files.
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
const BASE_PATH = '/Users/Shared/htdocs/github/DVWDesign';
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

const RULE_FILES = ['table-separator-spacing.cjs', 'force-align-table-columns.cjs'];

/** Target .markdownlint-cli2.jsonc content (custom rules only, no extends) */
const MARKDOWNLINT_CONFIG = `// markdownlint-cli2 configuration
// Custom rules propagated from DocuMind
{
  "customRules": [
    "./config/rules/table-separator-spacing.cjs",
    "./config/rules/force-align-table-columns.cjs"
  ],
  "ignores": [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".planning"
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
 * @returns {'pnpm' | 'npm'}
 */
function detectPackageManager(repoPath) {
  if (fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
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

/**
 * Merge customRules into an existing .markdownlint-cli2.jsonc file.
 * Adds our two rules if they're not already present.
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

  if (!parsed.customRules) {
    parsed.customRules = [];
  }

  const rulesNeeded = [
    './config/rules/table-separator-spacing.cjs',
    './config/rules/force-align-table-columns.cjs',
  ];

  let changed = false;
  for (const rule of rulesNeeded) {
    if (!parsed.customRules.includes(rule)) {
      parsed.customRules.push(rule);
      changed = true;
    }
  }

  if (!changed) return existingContent;

  // Re-serialize with leading comment preserved
  const header = `// markdownlint-cli2 configuration\n// Custom rules propagated from DocuMind\n`;
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
  const depsToCheck = [
    { pkg: 'markdownlint-cli2', installPkg: 'markdownlint-cli2' },
    {
      pkg: 'markdownlint-rule-force-align-table-columns',
      installPkg: 'markdownlint-rule-force-align-table-columns',
    },
  ];

  for (const { pkg, installPkg } of depsToCheck) {
    if (!hasDevDep(repoPath, pkg)) {
      const installCmd =
        pm === 'pnpm' ? `pnpm add -D ${installPkg}` : `npm install --save-dev ${installPkg}`;
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
