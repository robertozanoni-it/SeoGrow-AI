import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  REGISTERED_PAGES,
  SUITE_MODULES,
  isRegisteredPage,
  moduleById,
  moduleForPage,
  resolvePageAlias,
} from "./core/modules/moduleRegistry.js";
import { WORKSPACE_KEYS, workspaceKey } from "./core/workspace/storageKeys.js";

const LEGACY_PAGES = [
  "Panoramica",
  "Clienti",
  "Centro progetto",
  "Storico",
  "Problemi",
  "Audit SEO",
  "Correzioni",
  "Posizionamenti",
  "Opportunità",
  "Link interni",
  "Piano editoriale",
  "Task",
  "SeoGrow AI",
  "SEO Agent",
  "GEO AI",
  "Integrazioni",
  "Impostazioni",
];

test("il registry assegna ogni pagina legacy a un solo dominio della Suite", () => {
  assert.equal(new Set(REGISTERED_PAGES).size, REGISTERED_PAGES.length);
  for (const page of LEGACY_PAGES) {
    assert.equal(isRegisteredPage(page), true, `${page} deve restare compatibile`);
    assert.ok(moduleForPage(page)?.id, `${page} deve avere un owner di dominio`);
  }
});

test("i confini principali separano analisi, crescita, contenuti, link, GEO e pubblicazione", () => {
  assert.equal(moduleForPage("Problemi").id, "audit");
  assert.equal(moduleForPage("Correzioni").id, "publish");
  assert.equal(moduleForPage("Opportunità").id, "rank");
  assert.equal(moduleForPage("Piano editoriale").id, "content");
  assert.equal(moduleForPage("Link interni").id, "links");
  assert.equal(moduleForPage("GEO AI").id, "geo");
  assert.equal(moduleForPage("SEO Agent").id, "agent");
});

test("Publish è un modulo attivo sopra la route legacy Correzioni ma non Agent-enabled", () => {
  const publish = moduleById("publish");
  assert.equal(publish.status, "active");
  assert.equal(publish.agentEnabled, false);
  assert.equal(publish.homePage, "Correzioni");
  assert.deepEqual(publish.pages, ["Correzioni"]);
  assert.equal(moduleForPage("Correzioni").id, "publish");
});

test("la nuova terminologia risolve sulle route legacy senza riscrivere i dati", () => {
  assert.equal(resolvePageAlias("Hub"), "Panoramica");
  assert.equal(resolvePageAlias("Audit & Fix"), "Audit SEO");
  assert.equal(resolvePageAlias("Rankings"), "Posizionamenti");
  assert.equal(resolvePageAlias("Content"), "Piano editoriale");
  assert.equal(resolvePageAlias("Publish"), "Correzioni");
  assert.equal(resolvePageAlias("Agent"), "SEO Agent");
  assert.equal(resolvePageAlias("Correzioni"), "Correzioni");
});

test("le chiavi persistite restano identiche durante la migrazione", () => {
  assert.equal(WORKSPACE_KEYS.clients, "seogrow-clients");
  assert.equal(WORKSPACE_KEYS.selectedPage, "seogrow-selected-page-v1");
  assert.equal(WORKSPACE_KEYS.tasks, "seogrow-tasks-v2");
  assert.equal(WORKSPACE_KEYS.analyses, "seogrow-analyses-v2");
  assert.equal(WORKSPACE_KEYS.remediationHistory, "seogrow-remediation-history-v1");
  assert.equal(workspaceKey("selectedPage"), "seogrow-selected-page-v1");
  assert.throws(() => workspaceKey("missing"), /sconosciuta/);
});

test("navigazione e route reconciler usano il nuovo Core senza cambiare il contratto storage", async () => {
  const navigation = await readFile(new URL("./navigationUx.js", import.meta.url), "utf8");
  const reconciler = await readFile(new URL("./PageRouteReconciler.js", import.meta.url), "utf8");
  assert.match(navigation, /core\/modules\/moduleRegistry\.js/);
  assert.match(navigation, /core\/workspace\/storageKeys\.js/);
  assert.match(reconciler, /core\/modules\/moduleRegistry\.js/);
  assert.match(reconciler, /WORKSPACE_KEYS\.selectedPage/);
});

test("il wizard usa la lista canonica congelata invece di mantenere una seconda navigazione", async () => {
  const wizard = await readFile(new URL("./WizardStepNavigation.js", import.meta.url), "utf8");
  assert.match(wizard, /import \{ CANONICAL_SUITE_PAGES \} from "\.\/suite\/productArchitecture\.js"/);
  assert.match(wizard, /WIZARD_DESTINATION_PAGES = CANONICAL_SUITE_PAGES/);
  assert.doesNotMatch(wizard, /REGISTERED_PAGES\.filter/);
  assert.doesNotMatch(wizard, /WIZARD_DESTINATION_PAGES = Object\.freeze\(\[/);
});

test("gli id modulo sono stabili e univoci", () => {
  const ids = SUITE_MODULES.map((moduleDefinition) => moduleDefinition.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("hub"));
  assert.ok(ids.includes("publish"));
  assert.ok(ids.includes("agent"));
});
