import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import { prepareWorkspaceRestore } from './workspaceRestore.js';
import { openWorkspaceDb, commitWorkspaceRestore } from './workspaceDatabase.js';
const read = async name => JSON.parse(await readFile(new URL(`../qa/workspace/${name}.json`, import.meta.url), 'utf8'));
async function snapshot(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['workspace', 'corrections']);
    const keys = tx.objectStore('workspace').getAllKeys();
    const values = tx.objectStore('workspace').getAll();
    const records = tx.objectStore('corrections').getAll();
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => resolve({ workspace: Object.fromEntries(keys.result.map((key, i) => [key, values.result[i]]).filter(([key]) => key !== '__generation')), corrections: records.result.toSorted((a, b) => a.id.localeCompare(b.id)) });
  });
}
for (const failure of ['abort', 'quota', 'none']) {
  test(`complete fixture A/B comparison across reopen: ${failure}`, async () => {
    const factory = new IDBFactory();
    const db = await openWorkspaceDb(factory);
    const a = await prepareWorkspaceRestore(await read('backup-A'));
    const b = await prepareWorkspaceRestore(await read('backup-B'));
    const generation = await commitWorkspaceRestore(db, a.entries, a.corrections);
    const attempt = commitWorkspaceRestore(db, b.entries, b.corrections, generation, tx => {
      if (failure === 'abort') tx.abort();
      if (failure === 'quota') throw new DOMException('Simulated quota', 'QuotaExceededError');
    });
    if (failure === 'none') await attempt; else await assert.rejects(attempt);
    db.close();
    const reopened = await openWorkspaceDb(factory);
    assert.deepEqual(await snapshot(reopened), await read(`expected-${failure === 'none' ? 'B' : 'A'}`));
    reopened.close();
  });
}
test('negative fixtures are refused by the actual import validator', async () => {
  for (const file of ['invalid-duplicate-client', 'invalid-schema']) await assert.rejects(prepareWorkspaceRestore(await read(file)));
});
