import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { canonicalRuntimePage } from "./PageRouteReconciler.js";

const source = await readFile(new URL("./PageRouteReconciler.js", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("route reconciler riallinea hash e pagina React tramite il canale useStoredState", () => {
  assert.equal(WORKSPACE_KEYS.selectedPage, "seogrow-selected-page-v1");
  assert.match(source, /WORKSPACE_KEYS\.selectedPage/);
  assert.match(source, /workspaceStorage/);
  assert.match(source, /workspaceStorage\.getItem\(SELECTED_PAGE_KEY\)/);
  assert.match(source, /workspaceStorage\.setItem\(SELECTED_PAGE_KEY, serialized\)/);
  assert.match(source, /\.app main/);
  assert.match(source, /dataset\?\.page/);
  assert.match(source, /StorageEvent/);
  assert.match(source, /newValue:\s*serialized/);
  assert.match(source, /dispatchEvent\(event\)/);
});

test("route reconciler risolve la terminologia Suite senza riscrivere le route legacy", () => {
  assert.match(source, /resolvePageAlias/);
  assert.match(source, /decodeURIComponent\(window\.location\.hash\.slice\(1\)\)/);
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

test("le route legacy ritirate convergono sui moduli canonici", () => {
  assert.equal(canonicalRuntimePage("Storico"), "Centro progetto");
  assert.equal(canonicalRuntimePage("SeoGrow AI"), "SEO Agent");
});

test("Problemi resta la sottovista operativa di Audit SEO", () => {
  assert.equal(canonicalRuntimePage("Problemi"), "Problemi");
  assert.equal(canonicalRuntimePage("Audit SEO"), "Audit SEO");
});
