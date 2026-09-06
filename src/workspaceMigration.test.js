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
