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
