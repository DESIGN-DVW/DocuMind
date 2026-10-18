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
import { isPublicPath } from '../daemon/public-paths.mjs';

const TOKEN = 'test-token-aaa';
const OTHER = 'test-token-bbb';

function makeApp() {
  const app = express();
  app.use(express.json());
  // The real predicate, not a copy — a copy here would let the test keep
  // passing while production drifts.
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
  // The two dashboard reads, plus the mutations the dashboards also call.
  app.get('/diagrams', (_q, r) => r.json({ count: 0 }));
  app.get('/obsolete', (_q, r) => r.json({ total: 0 }));
  app.post('/diagrams/relink', (_q, r) => r.json({ relinked: true }));
  app.post('/obsolete/batch-archive', (_q, r) => r.json({ archived: true }));
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

// The gate above left the browser dashboards unable to populate: they are
// static HTML with nowhere to hold a token, so every data fetch 401'd and both
// pages rendered as empty shells for ~2 months. GET /diagrams and GET /obsolete
// are now exempt from loopback only. These tests pin the exemption so it cannot
// widen to the mutations the same pages call.
test('dashboard read exemption', async t => {
  const srv = await listen(makeApp());
  t.after(() => srv.close());

  await t.test('the two dashboard reads work untokened over loopback', async () => {
    assert.equal((await call(srv, '/diagrams')).status, 200);
    assert.equal((await call(srv, '/obsolete?limit=500')).status, 200);
  });

  await t.test('dashboard mutations stay gated', async () => {
    assert.equal((await call(srv, '/diagrams/relink', { method: 'POST' })).status, 401);
    assert.equal((await call(srv, '/obsolete/batch-archive', { method: 'POST' })).status, 401);
    assert.equal((await call(srv, '/obsolete/4', { method: 'DELETE' })).status, 401);
  });

  await t.test('the exemption did not widen to other reads', async () => {
    assert.equal((await call(srv, '/search')).status, 401);
    assert.equal((await call(srv, '/scan', { method: 'POST' })).status, 401);
  });
});

// Socket-level tests above can only originate from loopback, so the
// non-loopback and path-shape rules are asserted on the predicate directly.
test('dashboard read exemption is loopback- and path-exact', () => {
  const get = (path, ip) => isPublicPath({ method: 'GET', path, ip });

  for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(get('/diagrams', ip), true, `loopback form ${ip} should pass`);
  }

  // A LAN or forwarded client must never reach them.
  for (const ip of ['192.168.1.50', '10.0.0.4', '203.0.113.9', undefined]) {
    assert.equal(get('/diagrams', ip), false, `non-loopback ${ip} must be gated`);
    assert.equal(get('/obsolete', ip), false, `non-loopback ${ip} must be gated`);
  }

  // Exact paths only — no prefix escape onto siblings.
  for (const path of ['/diagrams/registry', '/obsolete/4', '/obsolete-secret', '/diagramsx']) {
    assert.equal(get(path, '127.0.0.1'), false, `${path} must not be exempt`);
  }

  // Method-exact: a write to the same path is not a read.
  for (const method of ['POST', 'DELETE', 'PUT', 'PATCH']) {
    assert.equal(
      isPublicPath({ method, path: '/obsolete', ip: '127.0.0.1' }),
      false,
      `${method} /obsolete must be gated`
    );
  }
});

test('parseTokens splits, trims and drops empties', () => {
  const t = parseTokens(' a , b ,, c ', 'TEST', 'TEST_TOKEN');
  assert.deepEqual([...t].sort(), ['a', 'b', 'c']);
});
