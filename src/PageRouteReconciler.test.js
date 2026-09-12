import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./PageRouteReconciler.js", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("route reconciler riallinea hash e pagina React tramite il canale useStoredState", () => {
  assert.match(source, /seogrow-selected-page-v1/);
  assert.match(source, /\.app main/);
  assert.match(source, /dataset\?\.page/);
  assert.match(source, /StorageEvent/);
  assert.match(source, /newValue:\s*JSON\.stringify\(page\)/);
  assert.match(source, /dispatchEvent\(event\)/);
});

test("route reconciler è bounded e reagisce ai tre eventi di navigazione", () => {
  assert.match(source, /MAX_FRAMES = 120/);
  assert.match(source, /attempts < MAX_FRAMES/);
  assert.match(source, /"hashchange", "popstate", "seogrow-locationchange"/);
  assert.match(source, /requestAnimationFrame\(run\)/);
});

test("entrypoint installa il reconciler prima dei layer React", () => {
  const reconciler = main.indexOf("import './PageRouteReconciler';");
  const react = main.indexOf("import React from 'react';");
  assert.ok(reconciler >= 0 && reconciler < react);
});
