import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { pinnedHttpsFetch } from '../server/pinnedHttpsFetch.js';
async function mockTransport(t, status = 200) {
 let incoming;
 t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
 t.mock.method(https, 'request', (_options, callback) => {
  const request = new EventEmitter();
  request.write = () => {};
  request.destroy = error => { request.emit('error', error); request.emit('close'); };
  request.end = () => { incoming = new EventEmitter(); incoming.statusCode = status; incoming.headers = {}; incoming.destroy = error => incoming.emit('error', error); callback(incoming); };
  return request;
 });
 const pending = pinnedHttpsFetch('https://example.com/', { maxBytes: 2 });
 await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
 return { incoming, pending };
}
test('bodyless HTTP 204 is handled without uncaught exception', async t => {
 const { incoming, pending } = await mockTransport(t, 204);
 assert.doesNotThrow(() => incoming.emit('end'));
 assert.equal((await pending).status, 204);
});
test('oversized incoming response rejects instead of unhandled stream error', async t => {
 const { incoming, pending } = await mockTransport(t);
 assert.ok(incoming.listenerCount('error') > 0, 'response needs an error handler');
 incoming.emit('data', Buffer.from('abc'));
 await assert.rejects(pending, /troppo grande/);
});
