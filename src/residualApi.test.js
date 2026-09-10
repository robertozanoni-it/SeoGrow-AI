import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch } from './api.js';
import { workspaceStorage } from './workspaceDatabase.js';

function setWindow(t, value) {
 const previous = globalThis.window;
 globalThis.window = value;
 t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
}

test('numeric permalink is inspected instead of assumed to be pagination', async t => {
 let calls = 0;
 workspaceStorage.setItem('seogrow-selected-client-v1', JSON.stringify(1));
 t.after(() => workspaceStorage.removeItem('seogrow-selected-client-v1'));
 setWindow(t, { location: { href: 'http://localhost/' }, setTimeout, clearTimeout, fetch: async () => { calls++; return Response.json({ ok: true }); } });
 const response = await apiFetch('/api/wordpress/inspect', { method: 'POST', body: JSON.stringify({ url: 'https://example.com/products/123' }) });
 assert.equal(response.status, 200); assert.equal(calls, 1);
});

test('explicit cancellation does not trigger an extra GET attempt', async t => {
 let calls = 0; const controller = new AbortController();
 setWindow(t, { location: { href: 'http://localhost/' }, setTimeout, clearTimeout, fetch: async () => { calls++; controller.abort(); throw new DOMException('cancelled', 'AbortError'); } });
 await assert.rejects(apiFetch('/api/health', { signal: controller.signal }), /annullata/);
 assert.equal(calls, 1);
});
