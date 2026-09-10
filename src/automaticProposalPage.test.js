import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const navigation = await readFile(new URL("./AutomaticProposalNavigation.js", import.meta.url), "utf8");
const page = await readFile(new URL("./AutomaticProposalPage.jsx", import.meta.url), "utf8");
const runtime = await readFile(new URL("./RemediationRuntime.jsx", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");
const wizardSurface = await readFile(new URL("./GuidedWizardSurface.css", import.meta.url), "utf8");

test("Automatica apre la pagina proposta tramite una route supportata prima del drawer legacy", () => {
  assert.match(navigation, /PROPOSAL_PAGE = "Proposta correzione"/);
  assert.match(navigation, /PROPOSAL_ROUTE_PAGE = "Correzioni"/);
  assert.match(navigation, /\.problem-correctability\.automatic/);
  assert.match(navigation, /document\.addEventListener\("click", interceptAutomaticClick, true\)/);
  assert.match(navigation, /stopImmediatePropagation/);
  assert.match(navigation, /navigatePage\(PROPOSAL_ROUTE_PAGE\)/);
  assert.match(page, /currentPage\(\) === PROPOSAL_ROUTE_PAGE/);
  assert.match(page, /readAutomaticProposalFocus/);
  assert.match(main, /import ['"]\.\/AutomaticProposalNavigation['"]/);
  assert.match(main, /<AutomaticProposalPage \/>/);
});

test("la pagina proposta ospita il motore reale di anteprima e approvazione", () => {
  assert.match(page, /<h1>\{PROPOSAL_PAGE\}<\/h1>/);
  assert.match(page, /proposal-remediation-slot/);
  assert.match(page, /Adesso sul sito/);
  assert.match(page, /Dopo la modifica/);
  assert.match(runtime, /state\.page === PROPOSAL_ROUTE_PAGE/);
  assert.match(runtime, /readAutomaticProposalFocus/);
  assert.match(runtime, /slotSelector=\{proposalMode \? "\.proposal-remediation-slot" : ""\}/);
  assert.match(runtime, /WordPressLiveRemediationControlV2/);
});

test("la pagina proposta resta visibile anche quando Correzioni usa il card workspace", () => {
  assert.match(page, /seogrowAutomaticProposal/);
  assert.match(wizardSurface, /data-seogrow-automatic-proposal="true"/);
  assert.match(wizardSurface, /automatic-proposal-page\[data-seogrow-card-original="true"\]/);
  assert.match(wizardSurface, /display:\s*block\s*!important/);
  assert.match(wizardSurface, /visibility:\s*visible\s*!important/);
  assert.match(wizardSurface, /pointer-events:\s*auto\s*!important/);
});

test("il percorso guidato mantiene il grigio marcato approvato", () => {
  assert.match(wizardSurface, /background:\s*#d7dde3\s*!important/);
  assert.match(wizardSurface, /border-color:\s*#b4bec8\s*!important/);
});
