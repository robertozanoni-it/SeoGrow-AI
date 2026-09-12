import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';

// Node integration harness: ignore CSS only, and resolve the app's legacy extensionless JS imports.
// The runtime, engine, API client, journal, verification and IndexedDB transactions remain real.
registerHooks({ resolve(specifier, context, next) {
  if (specifier.endsWith('.css')) return { url: 'data:text/javascript,export default {};', shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !/\.[a-z]+$/i.test(specifier)) {
    const candidate = new URL(specifier + '.js', context.parentURL);
    if (existsSync(candidate)) return next(candidate.href, context);
  }
  return next(specifier, context);
}});
const window = Object.assign(new EventTarget(), { indexedDB: new IDBFactory(), setTimeout, clearTimeout, location: { href: 'http://localhost:5176/', reload() {} } });
globalThis.window = window;
globalThis.StorageEvent = class extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } };
const native = new Map();
globalThis.localStorage = { get length() { return native.size; }, key: i => [...native.keys()][i], getItem: k => native.get(k) ?? null, setItem: (k,v) => native.set(k,String(v)), removeItem: k => native.delete(k) };
const locks = new Set();
Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: { async request(name, options, callback) {
  if (locks.has(name)) return callback(null);
  locks.add(name); try { return await callback({ name }); } finally { locks.delete(name); }
} } });
const { initializeWorkspace, workspaceStorage, flushWorkspace, openWorkspaceDb, WORKSPACE_STORE } = await import('./workspaceDatabase.js');
const { createBatchRun, batchSummary, retryableProblemKeys, recoverBatchRun } = await import('./batchRemediationModel.js');
const { prepareBatch, executeBatch } = await import('./batchRemediationQueue.js');
const { createBatchWordPressPorts } = await import('./batchRemediationRuntime.js');
const { saveBatchRun, listBatchRuns, withBatchLock } = await import('./batchRemediationStore.js');
const { listCorrections, readCorrection } = await import('./remediationStore.js');
const { buildUnifiedProblems } = await import('./problemsModel.js');
await initializeWorkspace(globalThis.localStorage);
let nextClient = 20000;
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
async function fixture(mode = 'success', count = 1) {
  const client = { id: ++nextClient, name: 'Batch integration fixture', url: 'https://example.com/' };
  const issues = Array.from({ length: count }, (_, i) => ({ type: 'meta_description', label: 'Meta description mancante', sourceUrl: `https://example.com/page-${i + 1}/`, severity: 'alta' }));
  const audit = { analyzedAt: new Date(Date.now() - 60000).toISOString(), issues };
  workspaceStorage.setItem('seogrow-clients', JSON.stringify([client]));
  workspaceStorage.setItem('seogrow-selected-client-v1', JSON.stringify(client.id));
  workspaceStorage.setItem('seogrow-analyses-v2', JSON.stringify({ [client.id]: [audit] }));
  workspaceStorage.setItem('seogrow-page-audit-history-v2', '{}');
  workspaceStorage.setItem('seogrow-tasks-v2', '[]');
  await flushWorkspace();
  const problems = buildUnifiedProblems({ clientId: client.id, client, siteHistory: [audit], pageHistory: [], tasks: [], corrections: [] }).rows;
  assert.equal(problems.length, count);
  const run = createBatchRun({ clientId: client.id, clientName: client.name, siteUrl: client.url, problems });
  const entities = new Map(issues.map((issue, i) => [issue.sourceUrl, { id: i + 1, link: issue.sourceUrl, status: 'publish', title: { raw: 'Titolo pagina' }, content: { raw: '<p>Contenuto leggibile.</p>' }, meta: { rank_math_description: '' } }]));
  const requests = [], writes = [], previews = new Map();
  let token = 0;
  const observed = entity => ({ ok: true, status: 200, isHtml: true, url: entity.link, wordpressDocumentId: entity.id, title: 'Titolo pagina', titleCount: 1, metaDescription: mode === 'bad-frontend' ? '' : entity.meta.rank_math_description, metaDescriptionCount: 1, verificationSafe: true, requiresBrowserVerification: false, h1: 1 });
  window.fetch = async (input, options) => {
    const path = new URL(input, window.location.href).pathname, body = JSON.parse(options?.body || '{}');
    requests.push({ path, body });
    if (path === '/api/wordpress/connection-check') return response({ ok: true, user: { id: 1 } });
    if (path === '/api/wordpress/inspect-fast') return response({ ok: true, resource: 'pages', entity: structuredClone(entities.get(body.url)) });
    if (path === '/api/frontend/inspect' || path === '/api/wordpress/verify-frontend') return response(observed(entities.get(body.url)));
    if (path === '/api/wordpress/generate-seo-value-v2') return response({ value: `Descrizione della pagina ${body.page.url}: informazioni, servizi e approfondimenti utili ai visitatori.`, publishable: true, quality: { publishable: true } });
    if (path === '/api/wordpress/live-preview') {
      const entity = entities.get(body.targetUrl);
      if (mode === 'stale-preparation') entity.meta.rank_math_description = 'Modifica esterna';
      assert.equal(body.expectedStatus, 'publish');
      if (JSON.stringify(body.expectedCurrent) !== JSON.stringify({ meta: entity.meta })) return response({ code: 'STALE_TARGET', error: 'Target cambiato durante preparazione' }, 409);
      const data = { ok: true, approvalToken: `test-token-${++token}`, expiresInSeconds: 600, resource: 'pages', id: entity.id, adapter: 'Rank Math', changed: ['meta.rank_math_description'], previewBefore: { meta: structuredClone(entity.meta) }, previewAfter: structuredClone(body.changes) };
      previews.set(data.approvalToken, { data, entity }); return response(data);
    }
    if (path === '/api/wordpress/live-apply') {
      const match = previews.get(body.approvalToken); assert.ok(match); previews.delete(body.approvalToken);
      const journal = await readCorrection(run.entries.find(e => e.preview?.data.approvalToken === body.approvalToken).correctionId);
      assert.equal(journal.status, 'Esito incerto'); assert.equal(journal.writeConfirmed, false);
      const persisted = (await listBatchRuns(client.id)).find(r => r.id === run.id);
      assert.ok(persisted.approval); assert.ok(persisted.entries.some(e => e.state === 'IN_EXECUTION'));
      writes.push(match.entity.id); match.entity.meta = structuredClone(match.data.previewAfter.meta);
      if (mode === 'lost-response') throw new TypeError('Risposta persa dopo scrittura');
      return response({ ok: true, before: match.data.previewBefore, after: match.data.previewAfter, changed: match.data.changed, adapter: 'Rank Math' });
    }
    if (path === '/api/audit') {
      const entity = entities.get(body.url);
      return response({ url: entity.link, fetchedAt: new Date().toISOString(), title: 'Titolo pagina', titleCount: 1, description: entity.meta.rank_math_description, metaDescriptionCount: 1, h1: 1, issues: mode === 'bad-frontend' ? [issues[0]] : [] });
    }
    throw new Error('Unexpected API call: ' + path);
  };
  const credentials = { url: client.url, username: 'fixture-user', applicationPassword: 'fixture-not-a-secret' };
  const ports = createBatchWordPressPorts({ run, credentials, save: saveBatchRun });
  await ports.connection();
  return { run, ports, client, audit, entities, requests, writes };
}

test('real runtime pipeline: no writes before approval; journal commits before API and delta verifies metadata', async () => {
  const f = await fixture();
  await prepareBatch(f.run, f.ports);
  assert.equal(f.run.entries[0].state, 'PREPARED', JSON.stringify(f.run.entries[0]));
  assert.equal(f.writes.length, 0);
  const saved = (await listBatchRuns(f.client.id))[0];
  assert.ok(!JSON.stringify(saved).includes('fixture-not-a-secret'));
  assert.ok(!JSON.stringify(saved).includes('test-token'));
  await executeBatch(f.run, { fingerprint: f.run.planFingerprint, highRiskIds: [] }, f.ports);
  assert.deepEqual(f.writes, [1]);
  assert.equal(f.run.entries[0].state, 'RESOLVED_VERIFIED', JSON.stringify(f.run.entries[0].verification));
  assert.equal(batchSummary(f.run).resolvedProblems, 1);
  const corrections = await listCorrections({ clientId: f.client.id });
  const rows = buildUnifiedProblems({ clientId: f.client.id, siteHistory: [f.audit], corrections }).rows;
  assert.equal(rows[0].problemState, 'resolved');
  assert.deepEqual(retryableProblemKeys(f.run), []);
});
test('real API200 with mismatching HTML remains unverified and cannot repeat write', async () => {
  const f = await fixture('bad-frontend'); await prepareBatch(f.run, f.ports);
  await executeBatch(f.run, { fingerprint: f.run.planFingerprint }, f.ports);
  assert.deepEqual(f.writes, [1]); assert.equal(f.run.entries[0].state, 'APPLIED_UNVERIFIED'); assert.deepEqual(retryableProblemKeys(f.run), []);
});
test('real preflight refuses a stale resource before persisting any approval token or writing', async () => {
  const f = await fixture('stale-preparation'); await prepareBatch(f.run, f.ports);
  assert.equal(f.run.entries[0].state, 'STALE_TARGET'); assert.deepEqual(f.writes, []);
  assert.equal((await listCorrections({ clientId: f.client.id })).length, 0);
});
test('real journal retains unknown outcome after lost response and stops independent remaining writes', async () => {
  const f = await fixture('lost-response', 2); await prepareBatch(f.run, f.ports);
  await executeBatch(f.run, { fingerprint: f.run.planFingerprint }, f.ports);
  assert.equal(f.writes.length, 1); assert.equal(f.run.entries[0].state, 'UNCERTAIN'); assert.equal(f.run.entries[1].state, 'BLOCKED');
  assert.equal((await readCorrection(f.run.entries[0].correctionId)).status, 'Esito incerto');
  assert.ok(!retryableProblemKeys(f.run).includes(f.run.entries[0].problem.key));
  const recovered = recoverBatchRun({ ...f.run, status: 'RUNNING' }, await listCorrections({ clientId: f.client.id }));
  assert.equal(recovered.status, 'INTERRUPTED'); assert.equal(recovered.entries[0].state, 'UNCERTAIN');
});
test('IndexedDB revision CAS rejects stale run writers and history stays scoped to client', async () => {
  const f = await fixture(); await saveBatchRun(f.run); const copy = structuredClone(f.run);
  await saveBatchRun(f.run); await assert.rejects(saveBatchRun(copy), { code: 'BATCH_REVISION_CONFLICT' });
  const history = await listBatchRuns(f.client.id); assert.equal(history.length, 1); assert.equal(history[0].revision, 2);
  assert.deepEqual(await listBatchRuns(9999999), []);
});
test('site lock denies another caller while first holds ownership', async () => {
  await withBatchLock('https://example.com/', async () => {
    await assert.rejects(withBatchLock('https://example.com', async () => assert.fail('Concurrent run')), { code: 'BATCH_ALREADY_RUNNING' });
  });
});
test('corrupt saved run aborts the transaction without an unhandled parser exception', async () => {
  const f = await fixture(); await saveBatchRun(f.run);
  const db = await openWorkspaceDb();
  await new Promise((resolve,reject) => { const tx = db.transaction(WORKSPACE_STORE,'readwrite'); tx.objectStore(WORKSPACE_STORE).put('{', `seogrow-batch-run-v1:${f.client.id}:${f.run.id}`); tx.oncomplete=resolve; tx.onabort=reject; });
  db.close(); await assert.rejects(saveBatchRun(f.run), { code: 'BATCH_STORAGE_FAILED' });
});
