// Tests for one-level-deep repository discovery.
// Run: node --test test/repo-discovery.test.mjs
//
// discoverRepos checked only <base>/<entry>/.git and never descended, so repos
// living under a grouping directory with no .git of its own — FigmaAPI/FigmailAPP,
// FigmaAPI/@figma-core, FigmaAPI/@figma-docs — were never registered. Every write
// tool then rejected their paths as "not under any known repo root" while search
// still returned their documents from an earlier registry-based scan.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { discoverRepos } from '../context/loader.mjs';

/** Build a throwaway directory tree; `repos` get a .git dir, `dirs` do not. */
async function makeTree({ repos = [], dirs = [] } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'documind-discovery-'));
  for (const d of dirs) await fs.mkdir(path.join(base, d), { recursive: true });
  for (const r of repos) await fs.mkdir(path.join(base, r, '.git'), { recursive: true });
  return base;
}

const names = repos => repos.map(r => r.name).sort();

test('top-level repos are discovered', async () => {
  const base = await makeTree({ repos: ['DocuMind', 'RootDispatcher'] });
  assert.deepEqual(names(await discoverRepos(base)), ['DocuMind', 'RootDispatcher']);
  await fs.rm(base, { recursive: true, force: true });
});

test('repos nested under a non-repo grouping directory are discovered', async () => {
  const base = await makeTree({
    repos: ['DocuMind', 'FigmaAPI/FigmailAPP', 'FigmaAPI/@figma-core', 'FigmaAPI/@figma-docs'],
  });
  const repos = await discoverRepos(base);
  assert.deepEqual(names(repos), ['@figma-core', '@figma-docs', 'DocuMind', 'FigmailAPP']);

  // The path must point at the nested location, not the grouping directory.
  const figmail = repos.find(r => r.name === 'FigmailAPP');
  assert.equal(figmail.path, path.join(base, 'FigmaAPI', 'FigmailAPP'));
  await fs.rm(base, { recursive: true, force: true });
});

test('descent stops at one level — no recursion', async () => {
  const base = await makeTree({ repos: ['group/sub/TooDeep'] });
  assert.deepEqual(names(await discoverRepos(base)), []);
  await fs.rm(base, { recursive: true, force: true });
});

test('node_modules, worktrees and dot-directories are not descended into', async () => {
  const base = await makeTree({
    repos: ['node_modules/pkg', 'worktrees/live', '.cache/thing'],
    dirs: ['empty'],
  });
  assert.deepEqual(names(await discoverRepos(base)), []);
  await fs.rm(base, { recursive: true, force: true });
});

test('a nested repo never shadows a top-level repo of the same name', async () => {
  const base = await makeTree({ repos: ['FigmailAPP', 'FigmaAPI/FigmailAPP'] });
  const repos = await discoverRepos(base);
  assert.equal(repos.length, 1);
  assert.equal(repos[0].path, path.join(base, 'FigmailAPP'));
  await fs.rm(base, { recursive: true, force: true });
});

test('a missing base directory yields no repos rather than throwing', async () => {
  assert.deepEqual(await discoverRepos('/nonexistent-documind-base'), []);
});
