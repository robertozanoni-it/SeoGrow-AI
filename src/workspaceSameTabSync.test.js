import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("workspace commit notifica anche il tab corrente tramite storage event", async () => {
  const source = await readFile(new URL("./workspaceDatabase.js", import.meta.url), "utf8");
  assert.match(source, /new StorageEvent\("storage", detail\)/);
  assert.match(source, /window\.dispatchEvent\(storageEvent\)/);
});

test("useStoredState recepisce anche la rimozione di una chiave", async () => {
  const source = await readFile(new URL("./App.jsx", import.meta.url), "utf8");
  assert.match(source, /if \(event\.newValue == null\) \{/);
  assert.match(source, /setValue\(defaultValue\)/);
});

test("PageRouteReconciler non duplica piu manualmente lo storage event", async () => {
  const source = await readFile(new URL("./PageRouteReconciler.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /new StorageEvent\("storage"/);
});
