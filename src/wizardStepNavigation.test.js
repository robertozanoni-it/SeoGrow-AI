import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const navigation = await readFile(new URL("./WizardStepNavigation.js", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("il navigatore del wizard è caricato dall'app", () => {
  assert.match(main, /import ['"]\.\/WizardStepNavigation['"]/);
  assert.match(navigation, /document\.addEventListener\("click", handleWizardClick\)/);
});

test("Panoramica apre le destinazioni operative reali", () => {
  assert.match(navigation, /Panoramica:[\s\S]*page: "Centro progetto"/);
  assert.match(navigation, /Panoramica:[\s\S]*page: "Problemi"/);
  assert.match(navigation, /Panoramica:[\s\S]*page: "Opportunità"/);
  assert.match(navigation, /Panoramica:[\s\S]*page: "Correzioni"/);
  assert.match(navigation, /Panoramica:[\s\S]*selector: "\.guided-next-actions"/);
});

test("i wizard delle pagine operative aprono dettagli, strumenti o pagine collegate", () => {
  for (const page of [
    "Clienti",
    "Centro progetto",
    "Problemi",
    "Audit SEO",
    "Posizionamenti",
    "Link interni",
    "Opportunità",
    "Correzioni",
    "Task",
    "Piano editoriale",
    "SEO Agent",
    "GEO AI",
    "Integrazioni",
    "Impostazioni",
    "Storico",
  ]) {
    assert.match(navigation, new RegExp(page.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(navigation, /openFirstCardDetail/);
  assert.match(navigation, /openProjectCard/);
  assert.match(navigation, /runWizardStepAction/);
});

test("anche Indietro e Successivo eseguono l'azione dello step raggiunto", () => {
  assert.match(navigation, /guided-wizard-footer button/);
  assert.match(navigation, /Successivo/);
  assert.match(navigation, /runWizardStepAction\(currentPage\(\), next\)/);
});
