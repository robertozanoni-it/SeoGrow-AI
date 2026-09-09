import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { pinnedHttpsFetch, resolvePinnedHttpsUrl } from '../server/pinnedHttpsFetch.js';

const localSecurity = await readFile(new URL('../server/localSecurity.js', import.meta.url), 'utf8');
const atomicWrite = await readFile(new URL('../wordpress-plugin/seogrow-connector/atomic-write.php', import.meta.url), 'utf8');

test('local secrets are persisted with restrictive filesystem permissions', () => {
  assert.match(localSecurity, /mkdirSync\(dataDir, \{ recursive: true, mode: 0o700 \}\)/);
  assert.match(localSecurity, /mode: 0o600/);
  assert.match(localSecurity, /flag: "wx"/);
  assert.match(localSecurity, /chmodSync\(file, 0o600\)/);
  assert.match(localSecurity, /crypto\.randomBytes\(32\)/);
});

test('remote fetch rejects non-HTTPS and private or local destinations before transport', async (t) => {
  await assert.rejects(resolvePinnedHttpsUrl('http://example.com/'), /solo endpoint HTTPS/i);
  await assert.rejects(resolvePinnedHttpsUrl('https://localhost/'), /locale non consentito/i);

  t.mock.method(dns, 'lookup', async () => [{ address: '127.0.0.1', family: 4 }]);
  await assert.rejects(resolvePinnedHttpsUrl('https://example.com/'), /non pubblico/i);
});

test('redirect responses are returned but never auto-followed to a second destination', async (t) => {
  let requestCount = 0;
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  t.mock.method(https, 'request', (_options, callback) => {
    requestCount += 1;
    const request = new EventEmitter();
    request.write = () => {};
    request.destroy = (error) => { if (error) request.emit('error', error); request.emit('close'); };
    request.end = () => {
      const incoming = new EventEmitter();
      incoming.statusCode = 302;
      incoming.statusMessage = 'Found';
      incoming.headers = { location: 'http://127.0.0.1/admin' };
      incoming.destroy = (error) => incoming.emit('error', error);
      callback(incoming);
      incoming.emit('end');
    };
    return request;
  });

  const response = await pinnedHttpsFetch('https://example.com/start');
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'http://127.0.0.1/admin');
  assert.equal(requestCount, 1, 'redirect must not trigger a second network request');
});

test('WordPress atomic writes require object-level capabilities and fail closed where atomicity is unavailable', () => {
  assert.match(atomicWrite, /current_user_can\('edit_post', \$id\)/);
  assert.match(atomicWrite, /current_user_can\('edit_term', \$term->term_id\)/);
  assert.match(atomicWrite, /ATOMIC_WRITE_UNAVAILABLE/);
  assert.match(atomicWrite, /if \(\$resource === 'taxonomy'\)[\s\S]*return seogrow_connector_atomic_unavailable\(\)/);
  assert.match(atomicWrite, /array_key_exists\('meta', \$changes\)\)[\s\S]*seogrow_connector_elementor_text_write[\s\S]*seogrow_connector_atomic_unavailable\(\)/);
  assert.match(atomicWrite, /STALE_CONFLICT/);
});
