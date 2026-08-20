// Tests for the daemon REST API bearer gate (DISPATCH-118).
// Run: node --test test/daemon-auth.test.mjs
//
// The daemon shipped with 24 unauthenticated routes on port 9000 — 13 of them
// writes, including DELETE /obsolete/:id — while the sibling /mcp endpoint was
// correctly gated. These tests pin the two properties that divergence broke:
// writes must be refused without a valid token, and /health must stay open so
// uptime probes keep working.

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBearerAuth, parseTokens } from '../daemon/bearer-auth.mjs';

const TOKEN = 'test-token-aaa';
const OTHER = 'test-token-bbb';

function makeApp() {
  const app = express();
  app.use(express.json());
  const isPublicPath = req => req.path === '/health' || req.path.startsWith('/dashboard');
  app.use(
    createBearerAuth({
      tokens: parseTokens(`${TOKEN},${OTHER}`, 'TEST', 'TEST_TOKEN'),
      label: 'TEST',
      skip: isPublicPath,
    })
  );
  app.get('/health', (_q, r) => r.json({ status: 'ok' }));
  app.get('/dashboard/app.js', (_q, r) => r.send('//js'));
  app.get('/search', (_q, r) => r.json({ results: [] }));
  app.post('/scan', (_q, r) => r.json({ scanned: true }));
  app.delete('/obsolete/:id', (_q, r) => r.json({ deleted: true }));
  return app;
}

function listen(app) {
  return new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
}

const call = (srv, path, opts = {}) => fetch(`http://127.0.0.1:${srv.address().port}${path}`, opts);

test('daemon bearer gate', async t => {
  const srv = await listen(makeApp());
  t.after(() => srv.close());

  await t.test('/health is public — uptime probes must not need a token', async () => {
    assert.equal((await call(srv, '/health')).status, 200);
  });

  await t.test('/dashboard static assets stay public', async () => {
    assert.equal((await call(srv, '/dashboard/app.js')).status, 200);
  });

  await t.test('reads are refused without a token', async () => {
    assert.equal((await call(srv, '/search')).status, 401);
  });

  await t.test('writes are refused without a token', async () => {
    assert.equal((await call(srv, '/scan', { method: 'POST' })).status, 401);
    assert.equal((await call(srv, '/obsolete/12', { method: 'DELETE' })).status, 401);
  });

  await t.test('an invalid token is refused', async () => {
    const res = await call(srv, '/scan', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-token' },
    });
    assert.equal(res.status, 401);
  });

  await t.test('a malformed header is refused', async () => {
    for (const authorization of ['', 'Basic abc', 'Bearer', TOKEN]) {
      const res = await call(srv, '/scan', { method: 'POST', headers: { authorization } });
      assert.equal(res.status, 401, `expected 401 for header "${authorization}"`);
    }
  });

  await t.test('a valid token is accepted on reads and writes', async () => {
    const h = { authorization: `Bearer ${TOKEN}` };
    assert.equal((await call(srv, '/search', { headers: h })).status, 200);
    assert.equal((await call(srv, '/scan', { method: 'POST', headers: h })).status, 200);
    assert.equal((await call(srv, '/obsolete/12', { method: 'DELETE', headers: h })).status, 200);
  });

  await t.test('a second comma-separated token works, so rotation needs no downtime', async () => {
    const res = await call(srv, '/search', { headers: { authorization: `Bearer ${OTHER}` } });
    assert.equal(res.status, 200);
  });

  await t.test('tokens are compared exactly — no prefix or whitespace slack', async () => {
    for (const bad of [`${TOKEN}x`, TOKEN.slice(0, -1), ` ${TOKEN} x`]) {
      const res = await call(srv, '/search', { headers: { authorization: `Bearer ${bad}` } });
      assert.equal(res.status, 401, `expected 401 for token "${bad}"`);
    }
  });
});

test('parseTokens splits, trims and drops empties', () => {
  const t = parseTokens(' a , b ,, c ', 'TEST', 'TEST_TOKEN');
  assert.deepEqual([...t].sort(), ['a', 'b', 'c']);
});
