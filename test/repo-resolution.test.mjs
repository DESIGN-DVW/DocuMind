// Tests for MCP repository-name resolution (case-insensitive + did-you-mean).
// Run: node --test test/repo-resolution.test.mjs
//
// The `repository` column has no COLLATE clause, so `repository = ?` was exact
// and case-sensitive: "FigmailApp" silently returned zero rows for the real
// "FigmailAPP". These tests pin the forgiving-resolution behaviour.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { resolveRepository, listRepositories } from '../daemon/repo-resolver.mjs';

/** In-memory documents table mirroring the real repos. */
function makeDb() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE documents (id INTEGER PRIMARY KEY, repository TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO documents (repository) VALUES (?)');
  const seed = { FigmailAPP: 5, RootDispatcher: 3, 'Figma-Plug-ins': 2, any2figma: 1 };
  for (const [repo, n] of Object.entries(seed)) {
    for (let i = 0; i < n; i++) insert.run(repo);
  }
  return db;
}

test('listRepositories returns repos with counts, busiest first', () => {
  const db = makeDb();
  const repos = listRepositories(db);
  assert.equal(repos[0].repository, 'FigmailAPP');
  assert.equal(repos[0].documents, 5);
  assert.equal(repos.length, 4);
  db.close();
});

test('exact name resolves unchanged', () => {
  const db = makeDb();
  const r = resolveRepository(db, 'FigmailAPP');
  assert.equal(r.ok, true);
  assert.equal(r.repository, 'FigmailAPP');
  assert.equal(r.corrected, undefined);
  db.close();
});

test('wrong case resolves to canonical spelling (the reported bug)', () => {
  const db = makeDb();
  const r = resolveRepository(db, 'FigmailApp');
  assert.equal(r.ok, true);
  assert.equal(r.repository, 'FigmailAPP');
  assert.equal(r.corrected, 'FigmailAPP');
  db.close();
});

test('punctuation differences resolve (root-dispatcher -> RootDispatcher)', () => {
  const db = makeDb();
  const r = resolveRepository(db, 'root-dispatcher');
  assert.equal(r.ok, true);
  assert.equal(r.repository, 'RootDispatcher');
  db.close();
});

test('empty/omitted repo means "all repositories"', () => {
  const db = makeDb();
  for (const input of [undefined, null, '']) {
    const r = resolveRepository(db, input);
    assert.equal(r.ok, true);
    assert.equal(r.repository, null);
  }
  db.close();
});

test('unknown name fails with a did-you-mean suggestion instead of empty results', () => {
  const db = makeDb();
  const r = resolveRepository(db, 'FigmailAPPP');
  assert.equal(r.ok, false);
  assert.match(r.error, /Did you mean/);
  assert.ok(r.suggestions.includes('FigmailAPP'));
  db.close();
});

test('wholly unknown name lists available repositories', () => {
  const db = makeDb();
  const r = resolveRepository(db, 'zzzz-not-a-repo');
  assert.equal(r.ok, false);
  assert.match(r.error, /list_repos/);
  assert.ok(r.available.includes('RootDispatcher'));
  db.close();
});
