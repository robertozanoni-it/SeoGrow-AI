import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { initializeWorkspace, workspaceStorage, flushWorkspace, openWorkspaceDb, readWorkspace, commitWorkspaceRestore } from "./workspaceDatabase.js";

test("migration preserves native data; stale tab writes cannot corrupt the restored generation", async () => {
  const factory = new IDBFactory();
  globalThis.window = { indexedDB: factory, dispatchEvent: () => true };
  const native = new Map([["seogrow-clients", '[{"id":1}]']]);
  const storage = { get length() { return native.size; }, key: index => [...native.keys()][index], getItem: key => native.get(key) ?? null };
  await initializeWorkspace(storage);
  assert.equal(workspaceStorage.getItem("seogrow-clients"), '[{"id":1}]');
  workspaceStorage.setItem("seogrow-clients", '[{"id":2}]');
  await flushWorkspace();
  assert.equal(native.get("seogrow-clients"), '[{"id":1}]');
  await initializeWorkspace(storage);
  assert.equal(workspaceStorage.getItem("seogrow-clients"), '[{"id":2}]');
  const db = await openWorkspaceDb(factory);
  const before = await readWorkspace(db);
  await commitWorkspaceRestore(db, new Map([["seogrow-clients", '[{"id":3}]']]), [], before.get("__generation"));
  workspaceStorage.setItem("seogrow-clients", '[{"id":999}]');
  await assert.rejects(flushWorkspace());
  assert.equal((await readWorkspace(db)).get("seogrow-clients"), '[{"id":3}]');
  db.close();
  delete globalThis.window;
});


test("re-initialization waits for queued workspace writes instead of aborting them", async () => {
  const factory = new IDBFactory();
  const previousWindow = globalThis.window;
  globalThis.window = { indexedDB: factory, dispatchEvent: () => true };
  const native = new Map([["seogrow-clients", '[{"id":1}]']]);
  const storage = { get length() { return native.size; }, key: index => [...native.keys()][index], getItem: key => native.get(key) ?? null };
  try {
    await initializeWorkspace(storage);
    workspaceStorage.setItem("seogrow-clients", '[{"id":2}]');
    workspaceStorage.setItem("seogrow-selected-client-v1", "2");
    const reloadA = initializeWorkspace(storage);
    const reloadB = initializeWorkspace(storage);
    await Promise.all([reloadA, reloadB, flushWorkspace()]);
    assert.equal(workspaceStorage.getItem("seogrow-clients"), '[{"id":2}]');
    assert.equal(workspaceStorage.getItem("seogrow-selected-client-v1"), "2");
    const db = await openWorkspaceDb(factory);
    const durable = await readWorkspace(db);
    assert.equal(durable.get("seogrow-clients"), '[{"id":2}]');
    assert.equal(durable.get("seogrow-selected-client-v1"), "2");
    db.close();
  } finally {
    globalThis.window = previousWindow;
  }
});
