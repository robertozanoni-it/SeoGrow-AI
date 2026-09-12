import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import { registerRoutes } from '../server/wordpressLiveApprovalHook.js';
const routes = new Map();
const testTransport = (...args) => globalThis.fetch(...args);
registerRoutes({ post: (path, handler) => routes.set(path, handler) }, {
  readTransport: testTransport,
  atomicTransport: testTransport,
});
async function invoke(path, body) {
  let status = 200, data;
  const res = { status(value) { status = value; return this; }, json(value) { data = value; return this; } };
  await routes.get(`/api/wordpress/${path}`)({ body, ip: 'fixture' }, res);
  return { status, data };
}
test('edit after server preflight is rejected by Connector; consumed approval cannot replay', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(String(url));
    if (init.method !== 'POST') return Response.json({ id: 12, status: 'publish', title: { raw: 'Before' } });
    assert.match(String(url), /\/seogrow\/v1\/atomic-write$/);
    assert.deepEqual(JSON.parse(init.body), { resource: 'pages', id: 12, changes: { title: 'After' }, expectedCurrent: { title: 'Before' }, operation: 'apply' });
    return Response.json({ code: 'STALE_CONFLICT', message: 'External edit' }, { status: 409 });
  });
  const credentials = { username: 'fixture', applicationPassword: 'fixture' };
  const preview = await invoke('live-preview', { ...credentials, siteUrl: 'https://example.com/', resource: 'pages', id: 12, changes: { title: 'After' } });
  assert.equal(preview.status, 200);
  const body = { ...credentials, approvalToken: preview.data.approvalToken };
  const result = await invoke('live-apply', body);
  assert.equal(result.status, 409);
  assert.equal(result.data.code, 'STALE_CONFLICT');
  assert.notEqual(result.data.ok, true);
  const count = calls.length;
  assert.equal((await invoke('live-apply', body)).data.code, 'APPROVAL_EXPIRED');
  assert.equal(calls.length, count);
});

test('batch live-preview rejects changed generation snapshot and status without issuing an approval', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.notEqual(init.method, 'POST');
    return Response.json({ id: 12, status: 'publish', title: { raw: 'Changed externally' } });
  });
  const base = { username: 'fixture', applicationPassword: 'fixture', siteUrl: 'https://example.com/', resource: 'pages', id: 12, changes: { title: 'Approved proposal' } };
  const stale = await invoke('live-preview', { ...base, expectedCurrent: { title: 'Original at generation' }, expectedStatus: 'publish' });
  assert.equal(stale.status, 409); assert.equal(stale.data.code, 'STALE_TARGET'); assert.equal(stale.data.approvalToken, undefined);
  const changedStatus = await invoke('live-preview', { ...base, expectedCurrent: { title: 'Changed externally' }, expectedStatus: 'draft' });
  assert.equal(changedStatus.status, 409); assert.equal(changedStatus.data.code, 'STALE_TARGET');
  const current = await invoke('live-preview', { ...base, expectedCurrent: { title: 'Changed externally' }, expectedStatus: 'publish' });
  assert.equal(current.status, 200); assert.ok(current.data.approvalToken);
});
