import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./GeoPage.jsx", import.meta.url), "utf8");
const panel = await readFile(new URL("./GeoInsightsPanel.jsx", import.meta.url), "utf8");
const geoModel = await readFile(new URL("./modules/geo/geoOperationalModel.js", import.meta.url), "utf8");
const opportunities = await readFile(new URL("./OpportunitiesWorkspaceLayer.jsx", import.meta.url), "utf8");
const rankModel = await readFile(new URL("./modules/rank/seoOpportunities.js", import.meta.url), "utf8");

test("GEO active surface has a precise measurement boundary", () => {
  assert.match(page, /Scope GEO verificabile/);
  assert.match(page, /Cosa misura/);
  assert.match(page, /Cosa NON misura/);
  assert.match(geoModel, /citazioni reali o ranking in ChatGPT/);
  assert.match(geoModel, /share of voice AI/);
  assert.match(geoModel, /probabilità futura di essere citati/);
});

test("GEO covers entities, schema, citability, authority signals and content", () => {
  for (const key of ["accessibility", "entity-schema", "citability-authority", "content", "presence"]) {
    assert.match(geoModel, new RegExp(key));
  }
  assert.match(panel, /Entità e schema osservati/);
  assert.match(panel, /Citabilità e autorevolezza documentabile/);
  assert.match(panel, /Contenuto e answerability/);
  assert.match(panel, /Presenza osservabile/);
});

test("active GEO UI does not render legacy synthetic score widgets", () => {
  assert.doesNotMatch(page, /geoPageScores|geoEntityProfile|geoStrategies|ReadinessScore/);
  assert.doesNotMatch(panel, /<span>Entity score<\/span>|<small>GEO score<\/small>|<th>Answerability<\/th>/i);
  assert.match(page, /Nessun punteggio sintetico/);
  assert.match(panel, /non vengono trasformati in un punteggio di autorevolezza/);
});

test("OpenAI and DataForSEO evidence are labelled by what they actually measure", () => {
  assert.match(page, /diagnostica di answerability sul contesto fornito/i);
  assert.match(page, /non misura citazioni o presenza reale nelle AI/i);
  assert.match(panel, /Solo Google SERP via DataForSEO/i);
  assert.match(panel, /non è una misurazione di citazioni o ranking nei motori generativi/i);
});

test("GEO output feeds canonical Opportunities and Task instead of ending in a dashboard", () => {
  assert.match(page, /onNavigate\("Opportunità"\)/);
  assert.match(page, /onCreateTask/);
  assert.match(opportunities, /geoOpportunityInputs/);
  assert.match(opportunities, /WORKSPACE_KEYS\.geoData/);
  assert.match(opportunities, /geoItems/);
  assert.match(rankModel, /geoCandidates/);
  assert.match(rankModel, /source\("geo", "GEO AI"/);
  assert.match(panel, /onOpenOpportunities/);
  assert.match(panel, /Crea task/);
});
