import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ARCHITECTURE_FROZEN,
  ARCHITECTURE_VERSION,
  CANONICAL_SUITE_PAGES,
  LEGACY_VIEW_OWNERS,
  PRODUCT_MODULES,
  canonicalPageForLegacyView,
  validateFrozenProductArchitecture,
} from "./suite/productArchitecture.js";
import { SUITE_NAVIGATION } from "./suite/navigationModel.js";
import { WIZARD_DESTINATION_PAGES, wizardActionCoverageComplete } from "./WizardStepNavigation.js";

const EXPECTED_MODULES = [
  "Panoramica",
  "Clienti",
  "Centro progetto",
  "Audit SEO",
  "Posizionamenti",
  "Link interni",
  "Opportunità",
  "Correzioni",
  "Task",
  "Piano editoriale",
  "SEO Agent",
  "GEO AI",
  "Integrazioni",
  "Impostazioni",
];

test("l'architettura prodotto è congelata sui 14 moduli definitivi", () => {
  assert.equal(ARCHITECTURE_FROZEN, true);
  assert.equal(ARCHITECTURE_VERSION, "2026-09-17");
  assert.deepEqual(CANONICAL_SUITE_PAGES, EXPECTED_MODULES);
  assert.equal(PRODUCT_MODULES.length, 14);
  assert.equal(validateFrozenProductArchitecture(), true);
});

test("ogni modulo definisce input output dati CTA e tre stati UX", () => {
  for (const moduleDefinition of PRODUCT_MODULES) {
    for (const field of ["inputs", "outputs", "data", "owns"]) {
      assert.ok(Array.isArray(moduleDefinition[field]) && moduleDefinition[field].length > 0, `${moduleDefinition.page}.${field}`);
    }
    assert.ok(moduleDefinition.primaryCta, `${moduleDefinition.page}.primaryCta`);
    assert.ok(moduleDefinition.states.empty, `${moduleDefinition.page}.states.empty`);
    assert.ok(moduleDefinition.states.error, `${moduleDefinition.page}.states.error`);
    assert.ok(moduleDefinition.states.completed, `${moduleDefinition.page}.states.completed`);
  }
});

test("nessuna funzione di prodotto ha due owner", () => {
  const ownership = PRODUCT_MODULES.flatMap((moduleDefinition) =>
    moduleDefinition.owns.map((capability) => [capability, moduleDefinition.page]),
  );
  assert.equal(new Set(ownership.map(([capability]) => capability)).size, ownership.length);
});

test("la navigazione definitiva coincide esattamente con i moduli canonici", () => {
  const navigationPages = SUITE_NAVIGATION.flatMap((group) => group.items.map((item) => item.page));
  assert.deepEqual(navigationPages, EXPECTED_MODULES);
  assert.equal(new Set(navigationPages).size, navigationPages.length);
  assert.equal(SUITE_NAVIGATION.flatMap((group) => group.items).every((item) => item.advancedOnly === false), true);
});

test("le vecchie pagine duplicate sono viste legacy con un solo owner canonico", () => {
  assert.deepEqual(LEGACY_VIEW_OWNERS, {
    Storico: "Centro progetto",
    Problemi: "Audit SEO",
    "SeoGrow AI": "SEO Agent",
  });
  assert.equal(canonicalPageForLegacyView("Storico"), "Centro progetto");
  assert.equal(canonicalPageForLegacyView("Problemi"), "Audit SEO");
  assert.equal(canonicalPageForLegacyView("SeoGrow AI"), "SEO Agent");
  for (const legacyPage of Object.keys(LEGACY_VIEW_OWNERS)) {
    assert.equal(CANONICAL_SUITE_PAGES.includes(legacyPage), false);
  }
});

test("wizard usa solo moduli canonici e Problemi resta una sottovista di Audit SEO", async () => {
  assert.deepEqual(WIZARD_DESTINATION_PAGES, EXPECTED_MODULES);
  assert.equal(wizardActionCoverageComplete(), true);
  const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");
  const bridge = await readFile(new URL("./ProblemsNavBridge.jsx", import.meta.url), "utf8");
  assert.match(main, /<ProblemsNavBridge \/>/);
  assert.match(bridge, /data-seogrow-page="Audit SEO"/);
  assert.match(bridge, /data-seogrow-subview="Audit SEO:Problemi"/);
});
