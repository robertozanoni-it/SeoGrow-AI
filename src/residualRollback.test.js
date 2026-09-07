import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import { registerRoutes } from '../server/wordpressLiveRollbackHook.js';
const routes = new Map();
registerRoutes({ post: (path, handler) => routes.set(path, handler) }, {
 atomicTransport: (...args) => globalThis.fetch(...args),
});
const rollback = routes.get('/api/wordpress/live-rollback');
const body = { siteUrl: 'https://example.com/blog/', targetUrl: 'https://example.com/blog/page/', username: 'fixture', applicationPassword: 'fixture', resource: 'pages', id: 42, changes: { title: 'before' }, expectedCurrent: { title: 'after' } };
async function invoke(input) { let status = 200, data; const res = { status(value) { status = value; return this; }, json(value) { data = value; return this; } }; await rollback({ body: input }, res); return { status, data }; }
function mockWp(t, update = { id: 42, title: { raw: 'before' } }) {
 const calls = [];
 t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
 t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url: String(url), init }); return Response.json(init.method === 'POST' ? { ok: true, atomicGuaranteed: true, staleChecked: true, entity: update } : { id: 42, title: { raw: 'after' }, content: { raw: 'someone else changed this' } }); });
 return calls;
}
test('rollback preserves explicit WordPress installation subdirectory', async t => {
 const calls = mockWp(t); const result = await invoke(body);
 assert.equal(result.status, 200); assert.match(calls[0].url, /\/blog\/wp-json\//); assert.match(calls[1].url, /\/blog\/wp-json\//);
});
test('rollback rejects a changed field missing from expectedCurrent', async t => {
 const calls = mockWp(t);
 const result = await invoke({ ...body, changes: { title: 'before', content: 'overwrite without snapshot' } });
 assert.equal(result.status, 409); assert.equal(calls.filter(call => call.init.method === 'POST').length, 0);
});
test('rollback cannot report success when WordPress ignores the requested value', async t => {
 mockWp(t, { id: 42, title: { raw: 'after' } });
 const result = await invoke(body); assert.notEqual(result.data.ok, true); assert.equal(result.data.code, 'ATOMIC_RESULT_UNVERIFIED');
});

test('external edit between preflight and Connector rollback cannot be overwritten', async t => {
 t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
 const calls = [];
 t.mock.method(globalThis, 'fetch', async (url, init) => {
  calls.push(String(url));
  if (init.method !== 'POST') return Response.json({ id: 42, title: { raw: 'after' } });
  assert.match(String(url), /\/seogrow\/v1\/atomic-write$/);
  const request = JSON.parse(init.body);
  assert.equal(request.operation, 'rollback');
  assert.deepEqual(request.expectedCurrent, { title: 'after' });
  return Response.json({ code: 'STALE_CONFLICT', message: 'External edit' }, { status: 409 });
 });
 const result = await invoke(body);
 assert.equal(result.status, 409);
 assert.equal(result.data.code, 'STALE_CONFLICT');
 assert.equal(calls.length, 2);
 assert.notEqual(result.data.ok, true);
});
