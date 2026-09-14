import test from "node:test";
import assert from "node:assert/strict";
import { validateSeoSuggestion } from "./editorialQuality.js";
import { normalizeSiteAnalysis } from "./seoResponseIntegrity.js";
import { metaDescriptionSerpWidthWarning, seoCharacterCount } from "./seoTextPolicy.js";

const rankMathRedExample = "Scopri come lo yoga può favorire il dimagrimento, il benessere mentale e la forma fisica, con benefici, posizioni e stili consigliati per una pratica mirata.";
const compactExample = "Scopri come lo yoga può favorire il dimagrimento e il benessere, con benefici, posizioni e stili consigliati per una pratica mirata.";

test("la meta description Rank Math da 157 caratteri genera un avviso SERP non bloccante", () => {
  assert.equal(seoCharacterCount(rankMathRedExample), 157);
  const warning = metaDescriptionSerpWidthWarning(rankMathRedExample);
  assert.ok(warning);
  assert.equal(warning.maxCharacters, 160);
  assert.equal(warning.maxPixels, 920);
  assert.ok(warning.pixels > warning.maxPixels);

  const quality = validateSeoSuggestion("meta_description", rankMathRedExample);
  assert.equal(quality.publishable, true);
  assert.equal(quality.errors.some((error) => /160 caratteri/.test(error)), false);
  assert.equal(quality.warnings.some((message) => /troppo larga nello snippet/i.test(message)), true);
});

test("una descrizione più compatta non genera l'avviso di larghezza", () => {
  assert.ok(seoCharacterCount(compactExample) < 160);
  assert.equal(metaDescriptionSerpWidthWarning(compactExample), null);
  assert.equal(validateSeoSuggestion("meta_description", compactExample).warnings.some((message) => /troppo larga nello snippet/i.test(message)), false);
});

test("oltre 160 caratteri resta errore e non viene duplicato come avviso pixel", () => {
  const oversized = "x".repeat(161);
  assert.equal(metaDescriptionSerpWidthWarning(oversized), null);
  const quality = validateSeoSuggestion("meta_description", oversized);
  assert.equal(quality.publishable, false);
  assert.equal(quality.errors.some((error) => /supera 160 caratteri/.test(error)), true);
  assert.equal(quality.warnings.some((message) => /troppo larga nello snippet/i.test(message)), false);
});

test("l'audit espone la larghezza SERP tra i segnali da verificare senza penalizzare lo score", () => {
  const url = "https://example.com/yoga-per-dimagrire/";
  const result = normalizeSiteAnalysis({
    url,
    pagesChecked: 1,
    description: rankMathRedExample,
    descriptionLength: 157,
    issues: [],
    reviewItems: [],
    score: 100,
  });
  const warning = result.reviewItems.find((item) => item.type === "description-serp-width");
  assert.ok(warning);
  assert.equal(warning.severity, "bassa");
  assert.equal(warning.diagnosisState, "needs-confirmation");
  assert.equal(warning.sourceUrl, url);
  assert.match(warning.label, /920px/);
  assert.equal(result.issues.length, 0);
  assert.equal(result.score, 100);

  const snapshot = JSON.stringify(result);
  normalizeSiteAnalysis(result);
  assert.equal(JSON.stringify(result), snapshot);
});
