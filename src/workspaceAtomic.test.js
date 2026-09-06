import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openWorkspaceDb, commitWorkspaceRestore, readWorkspace } from "./workspaceDatabase.js";
import { prepareWorkspaceRestore } from "./workspaceRestore.js";

async function snapshots(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("corrections");
    const request = tx.objectStore("corrections").getAll();
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
  });
}
async function fixture() {
  const factory = new IDBFactory();
  const db = await openWorkspaceDb(factory);
  const generation = await commitWorkspaceRestore(db, new Map([["clients", "old"], ["tasks", "old"]]), [{ id: "old" }]);
  return { db, factory, generation };
}

test("restore commits every workspace key and correction together", async () => {
  const { db, generation } = await fixture();
  await commitWorkspaceRestore(db, new Map([["clients", "new"], ["tasks", "new"]]), [{ id: "new" }], generation);
  assert.equal((await readWorkspace(db)).get("clients"), "new");
  assert.equal((await readWorkspace(db)).get("tasks"), "new");
  assert.deepEqual(await snapshots(db), [{ id: "new" }]);
  db.close();
});

for (const kind of ["abort", "quota", "uncloneable"]) {
  test(`restore ${kind} keeps complete old workspace across reopen`, async () => {
    const { db, factory, generation } = await fixture();
    const interrupt = tx => {
      if (kind === "abort") tx.abort();
      if (kind === "quota") throw new DOMException("Storage full", "QuotaExceededError");
    };
    const records = kind === "uncloneable" ? [{ id: "new", invalid: () => {} }] : [{ id: "new" }];
    await assert.rejects(commitWorkspaceRestore(db, new Map([["clients", "new"], ["tasks", "new"]]), records, generation, interrupt));
    db.close();
    const reopened = await openWorkspaceDb(factory);
    assert.equal((await readWorkspace(reopened)).get("clients"), "old");
    assert.equal((await readWorkspace(reopened)).get("tasks"), "old");
    assert.deepEqual(await snapshots(reopened), [{ id: "old" }]);
    reopened.close();
  });
}

test("old generation cannot overwrite a completed restore", async () => {
  const { db, generation } = await fixture();
  await commitWorkspaceRestore(db, new Map([["clients", "new"]]), [{ id: "new" }], generation);
  await assert.rejects(commitWorkspaceRestore(db, new Map([["clients", "stale"]]), [], generation));
  assert.equal((await readWorkspace(db)).get("clients"), "new");
  db.close();
});

test("invalid backup fails before opening a write transaction", async () => {
  await assert.rejects(prepareWorkspaceRestore({ clients: [], tasks: [], gscData: {} }), /valido/);
});

test("validated backup prepares audit history and correction index from the same dataset", async () => {
  const correction = { id: "snapshot", batchId: "batch", clientId: 1, issueLabel: "Title", sourceUrl: "https://example.it/", fields: ["title"], before: { title: "old" }, after: { title: "new" }, status: "Da verificare" };
  const prepared = await prepareWorkspaceRestore({ schemaVersion: 4, clients: [{ id: 1, name: "QA", url: "https://example.it/" }], tasks: [], gscData: {}, pageAuditHistory: { 1: [{ url: "https://example.it/" }] }, corrections: [correction] });
  assert.equal(JSON.parse(prepared.entries.get("seogrow-remediation-history-v1"))[0].id, prepared.corrections[0].id);
  assert.equal(JSON.parse(prepared.entries.get("seogrow-page-audit-history-v2"))[1][0].url, "https://example.it/");
});
