import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./ProblemResolutionPage.jsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("./AutomaticProposalNavigation.js", import.meta.url), "utf8");
const main = readFileSync(new URL("./appMain.jsx", import.meta.url), "utf8");
const auditModule = readFileSync(new URL("./modules/audit/index.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./ProblemResolutionPage.css", import.meta.url), "utf8");

test("un problema non automatico apre la pagina dedicata Correzioni invece del drawer o del SEO Agent diretto", () => {
  assert.match(page, /const PAGE = PROPOSAL_ROUTE_PAGE/);
  assert.match(navigation, /sessionStorage\.setItem\(RESOLUTION_FOCUS_KEY/);
  assert.match(navigation, /seogrow-problem-resolution-open/);
  assert.match(page, /openProblemResolution/);
  assert.match(page, /className="problem-resolution-root"/);
  assert.doesNotMatch(page, /problem-drawer-scrim/);
  assert.doesNotMatch(page, /aria-modal="true"/);
});

test("la pagina di risoluzione segue Problema, Spiegazione, Prima-Dopo, Soluzione", () => {
  assert.match(page, /buildUnifiedProblems/);
  assert.match(page, /listCorrections/);
  assert.match(page, /recheckCorrectionById/);
  assert.match(page, />Problema<\/h2>/);
  assert.match(page, />Spiegazione<\/h2>/);
  assert.match(page, />Prima \/ Dopo<\/h2>/);
  assert.match(page, />Soluzione<\/h2>/);
  assert.match(page, /correctionReceiptFields/);
  assert.match(page, /resolutionPath\(problem, latestCorrection\)/);
  assert.match(page, /problemResolutionPriority\(problem, latestCorrection\)/);
  assert.match(page, /priority\.label/);
  assert.match(page, /excludeProblemPermanently/);
  assert.match(page, /> Non modificare<\/button>/);
});

test("un mismatch frontend espone valori e percorso concreto di nuova correzione", () => {
  assert.match(page, /verificationFailure\?\.nextAction === "PREPARE_AND_REVERIFY"/);
  assert.match(page, /Valore rilevato/);
  assert.match(page, /verificationSnapshot\.expected/);
  assert.match(page, /Prepara correzione/);
  assert.match(page, /if \(verificationMismatch\) return prepareApprovalSolution\(\)/);
});

test("il bootstrap monta la pagina attraverso il boundary Audit e il CSS nasconde il vecchio contenuto core", () => {
  assert.match(main, /from ['"]\.\/modules\/audit\/index\.js['"]/);
  assert.match(auditModule, /ProblemResolutionPage/);
  assert.match(auditModule, /\.\.\/\.\.\/ProblemResolutionPage\.jsx/);
  assert.match(main, /<ProblemResolutionPage \/>/);
  assert.match(css, /data-seogrow-problem-resolution="true"/);
  assert.match(css, /\.workspace > main/);
});
