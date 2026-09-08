import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openWorkspaceDb, workspaceTransaction, readWorkspace, commitWorkspaceRestore } from "./workspaceDatabase.js";
import { normalizeStoredTasks } from "./platform.js";
import { taskChange, undoTaskChange } from "./productivity.js";
import { prepareWorkspaceRestore } from "./workspaceRestore.js";

const makeTasks = count => Array.from({ length: count }, (_, i) => ({ id: "qa-" + i, title: "Task " + i, status: "Da fare", sourceClientId: 1, sourceUrl: "https://example.com/" + i, notes: "Keep " + i }));
test("QA-STORAGE-001 populated 500-task write, abort and reopen preserve entire records", async () => {
  const factory = new IDBFactory();
  let db = await openWorkspaceDb(factory);
  const before = makeTasks(500);
  await workspaceTransaction(db, tx => tx.objectStore("workspace").put(JSON.stringify(before), "tasks"));
  const after = before.map(task => ({ ...task, status: "In corso" }));
  await assert.rejects(workspaceTransaction(db, tx => {
    tx.objectStore("workspace").put(JSON.stringify(after), "tasks");
    throw new DOMException("Injected quota", "QuotaExceededError");
  }), /quota/i);
  db.close(); db = await openWorkspaceDb(factory);
  assert.deepEqual(JSON.parse((await readWorkspace(db)).get("tasks")), before);
  await workspaceTransaction(db, tx => tx.objectStore("workspace").put(JSON.stringify(after), "tasks"));
  db.close(); db = await openWorkspaceDb(factory);
  assert.deepEqual(JSON.parse((await readWorkspace(db)).get("tasks")), after);
  db.close();
});
test("QA-STORAGE-002 future IndexedDB schema rejects old writer without altering records", async () => {
  const factory = new IDBFactory();
  const db = await new Promise((resolve, reject) => {
    const request = factory.open("seogrow-remediation", 99);
    request.onupgradeneeded = () => request.result.createObjectStore("future");
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  db.close();
  await assert.rejects(openWorkspaceDb(factory), { name: "VersionError" });
});
test("QA-TASK-005 consecutive undo restores only last transition and all unrelated fields", () => {
  const before = makeTasks(100);
  const first = before.map(t => t.id === "qa-0" ? { ...t, status: "In corso" } : t);
  const second = first.map(t => t.id === "qa-0" ? { ...t, status: "Completato" } : t);
  assert.deepEqual(undoTaskChange(second, taskChange(first, second)), first);
  assert.equal(new Set(second.map(t => t.id)).size, 100);
});
test("QA-IMPORT-001 serialized backup restores tasks and rejects duplicate IDs before writes", async () => {
  const backup = { schemaVersion: 4, clients: [{ id: 1, name: "QA", url: "https://example.com/" }], tasks: makeTasks(100), gscData: {} };
  const prepared = await prepareWorkspaceRestore(JSON.parse(JSON.stringify(backup)));
  const db = await openWorkspaceDb(new IDBFactory());
  await commitWorkspaceRestore(db, prepared.entries, prepared.corrections);
  assert.deepEqual(JSON.parse((await readWorkspace(db)).get("seogrow-tasks-v2")).map(t => t.id), backup.tasks.map(t => t.id));
  await assert.rejects(prepareWorkspaceRestore({ ...backup, schemaVersion: 999 }));
  assert.deepEqual(normalizeStoredTasks([...backup.tasks, backup.tasks[0]], ["invalid"]), ["invalid"]);
  assert.deepEqual(normalizeStoredTasks([{ id: "partial" }], ["invalid"]), ["invalid"]);
  db.close();
});
