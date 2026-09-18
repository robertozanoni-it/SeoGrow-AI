import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("workspace commit notifica il tab corrente con un evento dedicato", async () => {
  const source = await readFile(new URL("./workspaceDatabase.js", import.meta.url), "utf8");
  assert.match(source, /new CustomEvent\("seogrow-workspace-change"/);
  assert.match(source, /channel\?\.postMessage/);
  assert.match(source, /new StorageEvent\("storage", \{ key: data\.key, newValue: data\.value \}\)/);
});

test("useStoredState recepisce anche la rimozione di una chiave", async () => {
  const source = await readFile(new URL("./App.jsx", import.meta.url), "utf8");
  assert.match(source, /if \(event\.newValue == null\) \{/);
  assert.match(source, /setValue\(defaultValue\)/);
  assert.match(source, /addEventListener\("seogrow-workspace-change", syncCurrentTab\)/);
});

test("PageRouteReconciler non duplica piu manualmente lo storage event", async () => {
  const source = await readFile(new URL("./PageRouteReconciler.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /new StorageEvent\("storage"/);
});
