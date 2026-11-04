const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-123';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'TestPassword!1';
process.env.SEED_SAMPLE_DATA = 'false';
process.env.MONGODB_URI = '';
process.env.LOGIN_RATE_LIMIT = '100';

const { createApp, init } = require('../server');
let server, base, adminToken;

const call = async (method, path, { body, headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
};
const auth = () => ({ Authorization: `Bearer ${adminToken}` });

before(async () => {
  await init();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('health check responds', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'ok');
});

test('admin routes reject missing / bad tokens', async () => {
  for (const p of ['/api/admin/dashboard/stats', '/api/admin/visitors', '/api/admin/events', '/api/admin/settings']) {
    assert.equal((await call('GET', p)).status, 401, p);
    assert.equal((await call('GET', p, { headers: { Authorization: 'Bearer nope' } })).status, 401, p);
  }
});

test('login: validation, wrong password, success', async () => {
  assert.equal((await call('POST', '/api/auth/login', { body: {} })).status, 400);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'admin@test.local', password: 'wrong' } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'nobody@test.local', password: 'x' } })).status, 401);
  const r = await call('POST', '/api/auth/login', { body: { email: 'admin@test.local', password: 'TestPassword!1' } });
  assert.equal(r.status, 200);
  assert.ok(r.json.token);
  adminToken = r.json.token;
  assert.equal((await call('GET', '/api/auth/me', { headers: auth() })).json.admin.email, 'admin@test.local');
});

let visitor;
test('session creation returns id + secret token, never a token hash', async () => {
  const r = await call('POST', '/api/visitors/session', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' }
  });
  assert.equal(r.status, 201);
  assert.ok(r.json.visitorId && r.json.sessionToken);
  assert.equal(r.json.tokenHash, undefined);
  visitor = r.json;
});

test('consent requires the session token and a valid decision', async () => {
  assert.equal((await call('POST', '/api/visitors/consent', { body: { visitorId: visitor.visitorId, decision: 'accepted' } })).status, 401);
  const h = { 'x-session-token': 'wrong' };
  assert.equal((await call('POST', '/api/visitors/consent', { headers: h, body: { visitorId: visitor.visitorId, decision: 'accepted' } })).status, 401);
  const ok = { 'x-session-token': visitor.sessionToken };
  assert.equal((await call('POST', '/api/visitors/consent', { headers: ok, body: { visitorId: visitor.visitorId, decision: 'maybe' } })).status, 400);
  assert.equal((await call('POST', '/api/visitors/consent', { headers: ok, body: { visitorId: 'missing', decision: 'accepted' } })).status, 404);
});

test('permission cannot be recorded before consent (consent ≠ permission)', async () => {
  const r = await call('PATCH', `/api/visitors/${visitor.visitorId}/status`, {
    headers: { 'x-session-token': visitor.sessionToken }, body: { cameraPermission: 'granted' }
  });
  assert.equal(r.status, 409);
});

test('accept → permission granted → camera active → stop → end', async () => {
  const h = { 'x-session-token': visitor.sessionToken };
  const id = visitor.visitorId;
  assert.equal((await call('POST', '/api/visitors/consent', { headers: h, body: { visitorId: id, decision: 'accepted' } })).status, 200);
  let v = (await call('GET', `/api/admin/visitors/${id}`, { headers: auth() })).json.visitor;
  assert.equal(v.consentDecision, 'accepted');
  assert.equal(v.cameraPermission, 'not_requested'); // consent alone never implies permission

  assert.equal((await call('PATCH', `/api/visitors/${id}/status`, { headers: h, body: { cameraActive: true } })).status, 409);
  assert.equal((await call('PATCH', `/api/visitors/${id}/status`, { headers: h, body: { cameraPermission: 'bogus' } })).status, 400);
  assert.equal((await call('PATCH', `/api/visitors/${id}/status`, { headers: h, body: {} })).status, 400);

  assert.equal((await call('PATCH', `/api/visitors/${id}/status`, { headers: h, body: { cameraPermission: 'granted' } })).status, 200);
  assert.equal((await call('PATCH', `/api/visitors/${id}/status`, { headers: h, body: { cameraActive: true } })).status, 200);
  let stats = (await call('GET', '/api/admin/dashboard/stats', { headers: auth() })).json;
  assert.equal(stats.activeDemoSessions, 1);
  assert.equal(stats.permissionGranted, 1);

  assert.equal((await call('PATCH', `/api/visitors/${id}/status`, { headers: h, body: { cameraActive: false } })).status, 200);
  assert.equal((await call('PATCH', `/api/visitors/${id}/status`, { headers: h, body: { sessionStatus: 'ended' } })).status, 200);
  v = (await call('GET', `/api/admin/visitors/${id}`, { headers: auth() })).json.visitor;
  assert.equal(v.cameraActive, false);
  assert.equal(v.sessionStatus, 'ended');
  assert.ok(v.endedAt);
  assert.equal(v.tokenHash, undefined);
});

test('declined visitor: no permission ever recorded; denial recorded separately', async () => {
  const s = (await call('POST', '/api/visitors/session')).json;
  const h = { 'x-session-token': s.sessionToken };
  await call('POST', '/api/visitors/consent', { headers: h, body: { visitorId: s.visitorId, decision: 'declined' } });
  assert.equal((await call('PATCH', `/api/visitors/${s.visitorId}/status`, { headers: h, body: { cameraPermission: 'granted' } })).status, 409);

  const s2 = (await call('POST', '/api/visitors/session')).json;
  const h2 = { 'x-session-token': s2.sessionToken };
  await call('POST', '/api/visitors/consent', { headers: h2, body: { visitorId: s2.visitorId, decision: 'accepted' } });
  await call('PATCH', `/api/visitors/${s2.visitorId}/status`, { headers: h2, body: { cameraPermission: 'denied' } });

  const stats = (await call('GET', '/api/admin/dashboard/stats', { headers: auth() })).json;
  assert.equal(stats.consentDeclined, 1);
  assert.equal(stats.permissionDenied, 1);
  assert.equal(stats.totalSessions, 3);
});

test('admin list, filters, events, settings, 404', async () => {
  const list = (await call('GET', '/api/admin/visitors', { headers: auth() })).json;
  assert.equal(list.total, 3);
  assert.equal(list.visitors[0].tokenHash, undefined);
  assert.equal((await call('GET', '/api/admin/visitors?consent=declined', { headers: auth() })).json.total, 1);
  const ev = (await call('GET', '/api/admin/events', { headers: auth() })).json;
  assert.ok(ev.events.some((e) => e.severity === 'warning'));
  assert.equal((await call('GET', '/api/admin/settings', { headers: auth() })).json.storage, 'memory');
  assert.equal((await call('GET', '/api/admin/visitors/nope', { headers: auth() })).status, 404);
  assert.equal((await call('GET', '/api/nope')).status, 404);
});

test('simulated IP is used for local requests and labelled', async () => {
  const list = (await call('GET', '/api/admin/visitors', { headers: auth() })).json;
  assert.ok(list.visitors.every((v) => v.ipSource === 'simulated' && v.ip.startsWith('203.0.113.')));
  assert.equal(list.visitors.find((v) => v.browser === 'Chrome').os, 'Windows');
});

test('retention: validation, purge by age, delete one', async () => {
  assert.equal((await call('POST', '/api/admin/retention/purge', { headers: auth(), body: {} })).status, 400);
  assert.equal((await call('POST', '/api/admin/retention/purge', { headers: auth(), body: { olderThanDays: -1 } })).status, 400);
  assert.equal((await call('POST', '/api/admin/retention/purge', { headers: auth(), body: { olderThanDays: 30 } })).json.deleted, 0);
  const list = (await call('GET', '/api/admin/visitors', { headers: auth() })).json;
  assert.equal((await call('DELETE', `/api/admin/visitors/${list.visitors[0].visitorId}`, { headers: auth() })).status, 200);
  assert.equal((await call('POST', '/api/admin/retention/purge', { headers: auth(), body: { olderThanDays: 0 } })).json.deleted, 2);
});

test('bad JSON returns 400', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
});
