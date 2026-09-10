import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, apiTimeoutMs } from './api.js';
import { workspaceStorage } from './workspaceDatabase.js';

function setWindow(t, value) {
 const previous = globalThis.window;
 globalThis.window = value;
 t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
}

function setLocalStorage(t) {
 const previous = globalThis.localStorage;
 const values = new Map();
 globalThis.localStorage = {
   getItem: key => values.get(String(key)) ?? null,
   setItem: (key, value) => values.set(String(key), String(value)),
   removeItem: key => values.delete(String(key)),
 };
 t.after(() => { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; });
}

test('numeric permalink is inspected instead of assumed to be pagination', async t => {
 let calls = 0;
 setLocalStorage(t);
 workspaceStorage.setItem('seogrow-selected-client-v1', JSON.stringify(1));
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

test('Elementor coverage has a dedicated long timeout without changing normal requests', () => {
 assert.equal(apiTimeoutMs('/api/wordpress/elementor-coverage-attest'), 420_000);
 assert.equal(apiTimeoutMs('/api/site-analysis'), 210_000);
 assert.equal(apiTimeoutMs('/api/health'), 120_000);
});
