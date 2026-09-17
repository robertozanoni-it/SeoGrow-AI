import test from "node:test";
import assert from "node:assert/strict";
import { canonicalRuntimePage } from "./PageRouteReconciler.js";

test("le route legacy ritirate convergono sui moduli canonici", () => {
  assert.equal(canonicalRuntimePage("Storico"), "Centro progetto");
  assert.equal(canonicalRuntimePage("SeoGrow AI"), "SEO Agent");
});

test("Problemi resta la sottovista operativa di Audit SEO", () => {
  assert.equal(canonicalRuntimePage("Problemi"), "Problemi");
  assert.equal(canonicalRuntimePage("Audit SEO"), "Audit SEO");
});
