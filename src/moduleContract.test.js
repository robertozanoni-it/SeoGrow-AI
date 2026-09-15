import test from "node:test";
import assert from "node:assert/strict";
import { defineSuiteModule, validateSuiteModuleSet } from "./core/modules/moduleContract.js";

test("un nuovo modulo può essere registrato senza dipendere da React o dal router legacy", () => {
  const local = defineSuiteModule({
    id: "local-seo",
    label: "Local SEO",
    layer: "module",
    status: "planned",
    homePage: null,
    futurePath: "/local-seo",
    pages: [],
    capabilities: ["local-rankings", "citations"],
  });
  assert.equal(local.id, "local-seo");
  assert.equal(local.futurePath, "/local-seo");
  assert.deepEqual(local.capabilities, ["local-rankings", "citations"]);
  assert.equal(Object.isFrozen(local), true);
  assert.equal(Object.isFrozen(local.capabilities), true);
});

test("il contratto rifiuta definizioni ambigue o non estendibili in sicurezza", () => {
  assert.throws(() => defineSuiteModule({
    id: "Audit Invalid",
    label: "Bad",
    layer: "module",
    status: "planned",
    futurePath: "/bad",
    pages: [],
    capabilities: [],
  }), /ID modulo/);

  assert.throws(() => defineSuiteModule({
    id: "bad-home",
    label: "Bad home",
    layer: "module",
    status: "active",
    homePage: "Pagina B",
    futurePath: "/bad-home",
    pages: ["Pagina A"],
    capabilities: [],
  }), /non appartiene/);
});

test("il set di moduli rifiuta id, path e pagine attive duplicate", () => {
  const base = defineSuiteModule({
    id: "one",
    label: "One",
    layer: "module",
    status: "active",
    homePage: "One",
    futurePath: "/one",
    pages: ["One"],
    capabilities: ["detect"],
  });
  const duplicatePage = defineSuiteModule({
    id: "two",
    label: "Two",
    layer: "module",
    status: "active",
    homePage: "One",
    futurePath: "/two",
    pages: ["One"],
    capabilities: ["verify"],
  });
  assert.throws(() => validateSuiteModuleSet([base, duplicatePage]), /registrata due volte/);

  const duplicatePath = defineSuiteModule({
    id: "three",
    label: "Three",
    layer: "module",
    status: "planned",
    homePage: null,
    futurePath: "/one",
    pages: [],
    capabilities: [],
  });
  assert.throws(() => validateSuiteModuleSet([base, duplicatePath]), /Percorso.*duplicato/);
});
