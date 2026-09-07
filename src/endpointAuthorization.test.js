import test from 'node:test';
import assert from 'node:assert/strict';
process.env.APP_API_TOKEN = 'fixture-endpoint-token';
process.env.CREDENTIAL_ENCRYPTION_KEY = 'fixture-encryption-key-32-characters';
const { app } = await import('../server/index.js');
test('every mounted non-public API endpoint rejects unauthenticated calls before execution', async () => {
 const routes = app.router.stack.filter(layer => layer.route).map(layer => layer.route);
 const endpoints = routes.flatMap(route => Object.keys(route.methods).map(method => ({ method, path: route.path }))).filter(route => typeof route.path === 'string' && route.path.startsWith('/api/') && !['/api/health', '/api/google/callback'].includes(route.path));
 assert.ok(endpoints.length >= 25);
 const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
 try {
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of endpoints) {
   const response = await fetch(`${base}${route.path}`, { method: route.method.toUpperCase(), headers: { 'content-type': 'application/json' }, ...(['post','put','patch'].includes(route.method) ? { body: '{}' } : {}) });
   assert.equal(response.status, 401, `${route.method} ${route.path}`);
   assert.deepEqual(await response.json(), { error: 'Richiesta locale non autorizzata' });
  }
 } finally { await new Promise(resolve => server.close(resolve)); }
});
