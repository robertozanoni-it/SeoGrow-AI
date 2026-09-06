import test from "node:test";
import assert from "node:assert/strict";
import { classifyTaxonomyFailure } from "../scripts/wordpress-taxonomy-e2e-cache-aware.mjs";

test("classifica PUBLIC_CACHE_STALE solo quando backend/API/DB sono coerenti e il marker resta solo nel frontend", () => {
  const result = classifyTaxonomyFailure(
    'Error: Valore backend mutato durante la riverifica: atteso "SeoGrow E2E categoria ..."',
    '[categoria] DIAGNOSTICA NON COERENTE: backend e frontend divergono; marker SeoGrow ancora presente in almeno un livello.\n' +
      '[categoria] Confronti · api=inspection:true · api=db:true · api=frontend:false · duplicateRows:false\n' +
      '[categoria] Marker SeoGrow · {"api":false,"inspection":false,"database":false,"cache":false,"frontend":true}',
  );
  assert.equal(result.code, "PUBLIC_CACHE_STALE");
});

test("non classifica come cache pubblica stale se il marker è ancora nel database", () => {
  const result = classifyTaxonomyFailure(
    'Error: Valore backend mutato durante la riverifica',
    '[categoria] Confronti · api=inspection:true · api=db:false · api=frontend:false · duplicateRows:false\n' +
      '[categoria] Marker SeoGrow · {"api":false,"inspection":false,"database":true,"cache":false,"frontend":true}',
  );
  assert.equal(result.code, "UNCLASSIFIED_TAXONOMY_FAILURE");
});

test("classifica RANK_MATH_CROSS_REQUEST_REVERT solo dopo due diagnostiche indipendenti coerenti sul baseline originale", () => {
  const e2e = '[categoria] Piano E2E · originale="Descrizione originale" · marker="SeoGrow E2E categoria 2026-09-06T08:00:00.000Z"\n' +
    'Error: Valore backend mutato durante la riverifica: atteso "SeoGrow E2E categoria 2026-09-06T08:00:00.000Z", rilevato "Descrizione originale".';
  const diagnostic = '[categoria] get_term_meta = "Descrizione originale"\n' +
    '[categoria] Confronti · api=inspection:true · api=db:true · api=frontend:true · duplicateRows:false\n' +
    '[categoria] Marker SeoGrow · {"api":false,"inspection":false,"database":false,"cache":false,"frontend":false}\n' +
    '[categoria] DIAGNOSTICA COERENTE: database, API, SeoGrow e frontend concordano; nessun marker E2E rilevato.';

  const result = classifyTaxonomyFailure(e2e, diagnostic, diagnostic);
  assert.equal(result.code, "RANK_MATH_CROSS_REQUEST_REVERT");
});

test("non classifica cross-request revert se una sola delle due letture coincide con il baseline", () => {
  const e2e = '[categoria] Piano E2E · originale="Descrizione originale" · marker="SeoGrow E2E categoria 2026-09-06T08:00:00.000Z"\n' +
    'Error: Valore backend mutato durante la riverifica';
  const clean = '[categoria] get_term_meta = "Descrizione originale"\n' +
    '[categoria] Confronti · api=inspection:true · api=db:true · api=frontend:true · duplicateRows:false\n' +
    '[categoria] Marker SeoGrow · {"api":false,"inspection":false,"database":false,"cache":false,"frontend":false}\n' +
    '[categoria] DIAGNOSTICA COERENTE: database, API, SeoGrow e frontend concordano; nessun marker E2E rilevato.';
  const different = '[categoria] get_term_meta = "Valore concorrente"\n' +
    '[categoria] Confronti · api=inspection:true · api=db:true · api=frontend:true · duplicateRows:false\n' +
    '[categoria] Marker SeoGrow · {"api":false,"inspection":false,"database":false,"cache":false,"frontend":false}\n' +
    '[categoria] DIAGNOSTICA COERENTE: database, API, SeoGrow e frontend concordano; nessun marker E2E rilevato.';

  const result = classifyTaxonomyFailure(e2e, clean, different);
  assert.equal(result.code, "UNCLASSIFIED_TAXONOMY_FAILURE");
});
