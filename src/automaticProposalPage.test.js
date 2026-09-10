import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const navigation = await readFile(new URL("./AutomaticProposalNavigation.js", import.meta.url), "utf8");
const page = await readFile(new URL("./AutomaticProposalPage.jsx", import.meta.url), "utf8");
const runtime = await readFile(new URL("./RemediationRuntime.jsx", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");
const wizardSurface = await readFile(new URL("./GuidedWizardSurface.css", import.meta.url), "utf8");

test("Automatica apre una pagina proposta dedicata prima del drawer legacy", () => {
  assert.match(navigation, /PROPOSAL_PAGE = "Proposta correzione"/);
  assert.match(navigation, /\.problem-correctability\.automatic/);
  assert.match(navigation, /document\.addEventListener\("click", interceptAutomaticClick, true\)/);
  assert.match(navigation, /stopImmediatePropagation/);
  assert.match(navigation, /navigatePage\(PROPOSAL_PAGE\)/);
  assert.match(main, /import ['"]\.\/AutomaticProposalNavigation['"]/);
  assert.match(main, /<AutomaticProposalPage \/>/);
});

test("la pagina proposta ospita il motore reale di anteprima e approvazione", () => {
  assert.match(page, /<h1>Proposta correzione<\/h1>/);
  assert.match(page, /proposal-remediation-slot/);
  assert.match(page, /Adesso sul sito/);
  assert.match(page, /Dopo la modifica/);
  assert.match(runtime, /state\.page === PROPOSAL_PAGE/);
  assert.match(runtime, /slotSelector=\{proposalMode \? "\.proposal-remediation-slot" : ""\}/);
  assert.match(runtime, /WordPressLiveRemediationControlV2/);
});

test("il percorso guidato usa il grigio più marcato richiesto", () => {
  assert.match(wizardSurface, /background:\s*#d7dde3\s*!important/);
  assert.match(wizardSurface, /border-color:\s*#b4bec8\s*!important/);
});
