import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("normalizzazione dati avviene prima del mount React", async () => {
  const main = await read("./main.jsx");
  const normalizeAt = main.indexOf("await normalizeWorkspacePersistence()");
  const mountAt = main.indexOf('import("./appMain.jsx")');
  assert.ok(normalizeAt >= 0);
  assert.ok(mountAt > normalizeAt);
});

test("chiusura modello dati non richiede una migration di schema IndexedDB", async () => {
  const database = await read("./workspaceDatabase.js");
  assert.match(database, /factory\.open\(DB_NAME, 2\)/);
  assert.doesNotMatch(database, /factory\.open\(DB_NAME, 3\)/);
});

test("riepilogo progetto usa lo stato canonico incluse le chiusure persistenti", async () => {
  const summary = await read("./projectProblemSummary.js");
  assert.match(summary, /loadProjectWorkspaceState/);
  assert.match(summary, /closures:\s*state\.problemClosures/);
});

test("restore passa dalla stessa canonicalizzazione del bootstrap", async () => {
  const restore = await read("./workspaceRestore.js");
  assert.match(restore, /canonicalCorrections/);
  assert.match(restore, /canonicalizeWorkspaceEntries/);
  assert.match(restore, /entries:\s*canonicalizeWorkspaceEntries\(entries\)/);
});

test("le chiavi storiche sono esplicitamente eliminate dal normalizzatore", async () => {
  const model = await read("./core/workspace/projectState.js");
  assert.match(model, /tasks:\s*"seogrow-tasks"/);
  assert.match(model, /analyses:\s*"seogrow-analyses-v1"/);
  assert.match(model, /entries\.delete\(LEGACY_WORKSPACE_KEYS\.tasks\)/);
  assert.match(model, /entries\.delete\(LEGACY_WORKSPACE_KEYS\.analyses\)/);
});
