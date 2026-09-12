import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./ProblemResolutionPage.jsx", import.meta.url), "utf8");
const main = readFileSync(new URL("./appMain.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./ProblemResolutionPage.css", import.meta.url), "utf8");

test("il click su un problema apre una pagina dedicata invece del drawer", () => {
  assert.match(page, /const PAGE = PROPOSAL_ROUTE_PAGE/);
  assert.match(page, /document\.addEventListener\("click", interceptProblemRow, true\)/);
  assert.match(page, /event\.stopImmediatePropagation/);
  assert.match(page, /openProblemResolution/);
  assert.match(page, /className="problem-resolution-root"/);
  assert.doesNotMatch(page, /problem-drawer-scrim/);
  assert.doesNotMatch(page, /aria-modal="true"/);
});

test("la pagina di risoluzione conserva dati, prove e azioni reali", () => {
  assert.match(page, /buildUnifiedProblems/);
  assert.match(page, /listCorrections/);
  assert.match(page, /recheckCorrectionById/);
  assert.match(page, /Che cosa è stato rilevato/);
  assert.match(page, /Qual è la prova/);
  assert.match(page, /Che cosa propone SeoGrow/);
  assert.match(page, /Dopo l’approvazione/);
  assert.match(page, /resolutionPath\(problem, latestCorrection\)/);
  assert.match(page, /path\.label/);
  assert.match(page, /Chiedi a SeoGrow/);
});

test("il bootstrap monta la nuova pagina e il CSS nasconde il vecchio contenuto core", () => {
  assert.match(main, /import ProblemResolutionPage from ['"]\.\/ProblemResolutionPage['"]/);
  assert.match(main, /<ProblemResolutionPage \/>/);
  assert.match(css, /data-seogrow-problem-resolution="true"/);
  assert.match(css, /\.workspace > main/);
});
