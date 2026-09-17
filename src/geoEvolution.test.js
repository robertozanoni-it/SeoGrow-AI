import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./GeoPage.jsx", import.meta.url), "utf8");
const panel = await readFile(new URL("./GeoInsightsPanel.jsx", import.meta.url), "utf8");
const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");

test("GEO tabs are functional evidence surfaces rather than decorative labels", () => {
  assert.match(page, /setActiveTab/);
  assert.match(page, /GeoInsightsPanel/);
  for (const label of ["Scope", "Entità & Schema", "Citabilità", "Contenuto", "Presenza", "Azioni & Report"]) assert.match(page, new RegExp(label));
  assert.match(panel, /Entità e schema osservati/);
  assert.match(panel, /Citabilità e autorevolezza documentabile/);
  assert.match(panel, /Contenuto e answerability/);
  assert.match(panel, /Presenza osservabile/);
  assert.match(panel, /Azioni GEO verificabili/);
});

test("GEO active UI declares measurement boundaries and no synthetic score widgets", () => {
  assert.match(page, /Cosa misura/);
  assert.match(page, /Cosa NON misura/);
  assert.match(page, /Nessun punteggio sintetico/);
  assert.match(panel, /Nessun entity score/);
  assert.doesNotMatch(page, /geoPageScores|geoEntityProfile|geoStrategies|ReadinessScore/);
  assert.doesNotMatch(panel, /<span>Entity score<\/span>|<small>GEO score<\/small>|<th>Answerability<\/th>/i);
});

test("GEO competitor observation stays on DataForSEO with explicit non-AI disclaimer", () => {
  assert.match(server, /\/api\/dataforseo\/geo-observe/);
  assert.match(server, /slice\(0, 10\)/);
  assert.match(server, /Non misura citazioni o ranking nei motori generativi/);
  assert.match(server, /reserveDataForSeoBudget/);
  assert.match(panel, /Solo Google SERP via DataForSEO/i);
});

test("GEO outputs have explicit Opportunity and Task paths", () => {
  assert.match(page, /onNavigate\("Opportunità"\)/);
  assert.match(page, /createGeoTask/);
  assert.match(panel, /onOpenOpportunities/);
  assert.match(panel, /onCreateTask/);
});
