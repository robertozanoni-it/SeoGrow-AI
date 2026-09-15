import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./GeoPage.jsx", import.meta.url), "utf8");
const panel = await readFile(new URL("./GeoInsightsPanel.jsx", import.meta.url), "utf8");
const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");

test("GEO tabs are functional surfaces rather than decorative labels", () => {
  assert.match(page, /setActiveTab/);
  assert.match(page, /GeoInsightsPanel/);
  for (const label of ["Ricerche AI", "Brand Mentions", "Competitor", "Strategie", "Report"]) assert.match(page, new RegExp(label));
  assert.match(panel, /Query Monitor GEO/);
  assert.match(panel, /Brand & Entity Intelligence/);
  assert.match(panel, /Competitor osservati/);
  assert.match(panel, /Strategie GEO prioritarie/);
  assert.match(panel, /Report GEO verificabile/);
});

test("GEO competitor observation stays on DataForSEO with explicit non-AI disclaimer", () => {
  assert.match(server, /\/api\/dataforseo\/geo-observe/);
  assert.match(server, /slice\(0, 10\)/);
  assert.match(server, /Non misura citazioni o ranking nei motori generativi/);
  assert.match(server, /reserveDataForSeoBudget/);
});
