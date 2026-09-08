import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";

test("P0 queued storage failure rolls back every uncommitted cache key and rejects further writes", async () => {
  const factory = new IDBFactory();
  const events = [];
  globalThis.window = { indexedDB: factory, dispatchEvent: event => events.push(event) };
  const m = await import("./workspaceDatabase.js?queued-failure");
  const native = new Map([["seogrow-tasks-v2", "old-tasks"], ["seogrow-clients", "old-clients"]]);
  const storage = { get length() { return native.size; }, key: i => [...native.keys()][i], getItem: key => native.get(key) };
  const originalPut = IDBObjectStore.prototype.put;
  let injected = false;
  try {
    await m.initializeWorkspace(storage);
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === "seogrow-tasks-v2") { injected = true; throw new DOMException("Injected quota", "QuotaExceededError"); }
      return originalPut.call(this, value, key);
    };
    m.workspaceStorage.setItem("seogrow-tasks-v2", "new-tasks");
    m.workspaceStorage.setItem("seogrow-clients", "new-clients");
    m.workspaceStorage.setItem("seogrow-unsaved", "new-key");
    await assert.rejects(m.flushWorkspace());
    assert.equal(injected, true, "write failure precondition must execute");
    assert.equal(m.workspaceStorage.getItem("seogrow-tasks-v2"), "old-tasks");
    assert.equal(m.workspaceStorage.getItem("seogrow-clients"), "old-clients");
    assert.equal(m.workspaceStorage.getItem("seogrow-unsaved"), null);
    assert.throws(() => m.workspaceStorage.setItem("seogrow-clients", "retry"));
    assert.equal(events.filter(e => e.type === "seogrow-storage-error").length, 1);
    const db = await m.openWorkspaceDb(factory);
    const durable = await m.readWorkspace(db);
    assert.equal(durable.get("seogrow-tasks-v2"), "old-tasks");
    assert.equal(durable.get("seogrow-clients"), "old-clients");
    assert.equal(durable.has("seogrow-unsaved"), false);
    db.close();
  } finally {
    IDBObjectStore.prototype.put = originalPut;
    delete globalThis.window;
  }
});
