import test from "node:test";
import assert from "node:assert/strict";
import { applyJournaledCorrection } from "./correctionJournal.js";

const record = { id: "one", clientId: 1, fields: ["title"], before: { title: "before" }, after: { title: "after" } };

test("storage non disponibile impedisce ogni scrittura remota", async () => {
  let writes = 0;
  await assert.rejects(applyJournaledCorrection(record, async () => { writes++; }, async () => { throw new Error("disk full"); }), /disk full/);
  assert.equal(writes, 0);
});

test("risposta persa mantiene snapshot precedente e stato incerto", async () => {
  let saved;
  await assert.rejects(applyJournaledCorrection(record, async () => {
    assert.equal(saved.status, "Esito incerto");
    assert.deepEqual(saved.before, record.before);
    throw new Error("connection lost after write");
  }, async row => (saved = structuredClone(row))), /Esito/);
  assert.equal(saved.writeConfirmed, false);
  assert.equal(saved.status, "Esito incerto");
});

test("fallimento persistenza dopo risposta non perde snapshot pre-scrittura", async () => {
  let saved;
  await assert.rejects(applyJournaledCorrection(record, async () => ({}), async row => {
    if (saved) throw new Error("quota");
    saved = row;
    return row;
  }), /Esito/);
  assert.deepEqual(saved.before, record.before);
  assert.equal(saved.status, "Esito incerto");
});

test("risposta confermata aggiorna stesso record senza dichiarare SEO verificata", async () => {
  const saved = [];
  const result = await applyJournaledCorrection(record, async () => ({ adapter: "WordPress" }), async row => { saved.push(row); return row; });
  assert.equal(saved.length, 2);
  assert.equal(result.id, saved[0].id);
  assert.equal(result.status, "Da verificare");
  assert.equal(result.writeConfirmed, true);
});

test("snapshot incompleto blocca invio e risposta incompleta conserva il journal", async () => {
  let writes = 0;
  await assert.rejects(applyJournaledCorrection({ ...record, before: {} }, async () => { writes++; }), /incompleto/);
  assert.equal(writes, 0);
  let saved;
  await assert.rejects(applyJournaledCorrection(record, async () => ({ after: {} }), async row => (saved = row)), /Esito/);
  assert.equal(saved.status, "Esito incerto");
  assert.equal(saved.after.title, "after");
});
