import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { applyJournaledCorrection } from "./correctionJournal.js";
import { saveCorrection, readCorrection, updateCorrection, replaceCorrections, listCorrections, purgeOrphanCorrections } from "./remediationStore.js";

function setup(t) {
  const storage = new Map([["seogrow-clients", '[{"id":1}]']]);
  const install = (key, value) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; });
  };
  install("window", { indexedDB: new IDBFactory(), dispatchEvent: () => true });
  install("localStorage", { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) });
  install("StorageEvent", class { constructor(type, options) { this.type = type; Object.assign(this, options); } });
  return storage;
}

test("aggiornamenti concorrenti dello stesso snapshot preservano entrambi i campi", async t => {
  setup(t);
  await saveCorrection({ id: "one", clientId: 1, status: "Da verificare" });
  await Promise.all([updateCorrection("one", { verificationNote: "evidence" }), updateCorrection("one", { rollbackNote: "snapshot" })]);
  const record = await readCorrection("one");
  assert.equal(record.verificationNote, "evidence");
  assert.equal(record.rollbackNote, "snapshot");
});

test("restore con record non clonabile non cancella o sostituisce parzialmente l'archivio", async t => {
  setup(t);
  await saveCorrection({ id: "original", clientId: 1 });
  await assert.rejects(replaceCorrections([{ id: "new", clientId: 1 }, { id: "bad", invalid: () => {} }]));
  assert.deepEqual((await listCorrections()).map(row => row.id), ["original"]);
});

test("eliminazione ultimo cliente nasconde e rimuove tutti gli snapshot orfani", async t => {
  const storage = setup(t);
  await saveCorrection({ id: "orphan", clientId: 1 });
  storage.set("seogrow-clients", "[]");
  assert.deepEqual(await listCorrections(), []);
  assert.equal(await purgeOrphanCorrections(), 1);
  assert.deepEqual(await listCorrections({ includeOrphans: true }), []);
});

test("journal resta leggibile da una nuova connessione IndexedDB dopo una risposta persa", async t => {
  setup(t);
  await assert.rejects(applyJournaledCorrection({ id: "journal", clientId: 1, fields: ["title"], before: { title: "old" }, after: { title: "new" } }, async () => { throw new Error("lost response"); }));
  const recovered = await readCorrection("journal");
  assert.equal(recovered.status, "Esito incerto");
  assert.equal(recovered.before.title, "old");
  assert.equal(recovered.after.title, "new");
});

test("patch non clonabile annulla l'aggiornamento senza eccezioni non gestite", async t => {
  setup(t);
  await saveCorrection({ id: "original", clientId: 1, status: "Da verificare" });
  await assert.rejects(updateCorrection("original", { invalid: () => {} }));
  assert.equal((await readCorrection("original")).status, "Da verificare");
});
