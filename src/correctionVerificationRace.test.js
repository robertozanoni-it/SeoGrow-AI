import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { initializeWorkspace, flushWorkspace } from "./workspaceDatabase.js";
import { saveCorrection, readCorrection, updateCorrection } from "./remediationStore.js";

test("late verification cannot overwrite rollback or a newer verification in IndexedDB", async t => {
  const oldWindow = globalThis.window, oldStorageEvent = globalThis.StorageEvent;
  globalThis.window = {indexedDB: new IDBFactory(), dispatchEvent: () => true};
  globalThis.StorageEvent = class extends Event { constructor(type, data) {super(type);Object.assign(this,data);} };
  t.after(() => {globalThis.window=oldWindow;globalThis.StorageEvent=oldStorageEvent;});
  const data = new Map([["seogrow-clients", '[{"id":1,"name":"QA","url":"https://example.com"}]']]);
  await initializeWorkspace({get length(){return data.size;},key:i=>[...data.keys()][i],getItem:key=>data.get(key) ?? null});
  const base = {id:"race", clientId:1, sourceUrl:"https://example.com/a/", issueType:"duplicate-description", status:"Da verificare", writeConfirmed:true, fields:["meta.rank_math_description"], before:{"meta.rank_math_description":"Prima"},after:{"meta.rank_math_description":"Dopo"}};
  await saveCorrection(base);
  const snapshot = await readCorrection(base.id);
  await updateCorrection(base.id, {status:"Ripristinato",rollbackAt:"2026-09-11T00:00:00Z"});
  await assert.rejects(updateCorrection(base.id,{status:"Verificato",frontendConfirmed:true},{expectedRecord:snapshot}), error => error.code === "CORRECTION_CHANGED_DURING_VERIFICATION");
  assert.equal((await readCorrection(base.id)).status,"Ripristinato");
  const current = await readCorrection(base.id);
  await updateCorrection(base.id,{verificationNote:"Controllo più recente"},{expectedRecord:current});
  await assert.rejects(updateCorrection(base.id,{verificationNote:"Risposta vecchia"},{expectedRecord:current}), /cambiata/);
  const final = await readCorrection(base.id);
  assert.equal(final.verificationNote,"Controllo più recente");
  assert.deepEqual(final.before,base.before);
  assert.deepEqual(final.after,base.after);
  await flushWorkspace();
});
