import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { wizardStepAction } from "./WizardStepNavigation.js";

const layer = await readFile(new URL("./WizardCongruenceLayer.jsx", import.meta.url), "utf8");
const layerCss = await readFile(new URL("./WizardCongruenceLayer.css", import.meta.url), "utf8");
const wizardCss = await readFile(new URL("./GuidedWizardSurface.css", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("ogni card rende esplicita la pagina di destinazione", () => {
  assert.match(layer, /Apri \$\{destination\}/);
  assert.match(layer, /Pagina: \$\{destination\}/);
  assert.match(layerCss, /Pagina: .*attr\(data-destination-page\)/);
  assert.match(layer, /Pagina aperta/);
  assert.match(layer, /Stai eseguendo/);
});

test("la pagina aperta riceve il contesto dello step selezionato", () => {
  assert.match(layer, /context\.label/);
  assert.match(layer, /context\.detail/);
  assert.match(layer, /context\.destinationPage/);
  assert.match(layerCss, /project-center-card-hub-head/);
  assert.match(layerCss, /card-workspace-title/);
  assert.match(main, /WizardCongruenceLayer/);
  assert.match(main, /<WizardCongruenceLayer \/>/);
});

test("le destinazioni più ambigue sono allineate al modulo che esegue l'azione", () => {
  assert.equal(wizardStepAction("Centro progetto", 3).page, "Audit SEO");
  assert.equal(wizardStepAction("Centro progetto", 5).page, "Centro progetto");
  assert.equal(wizardStepAction("Link interni", 3).page, "Link interni");
  assert.equal(wizardStepAction("Opportunità", 2).page, "Opportunità");
  assert.equal(wizardStepAction("Task", 2).page, "Task");
  assert.equal(wizardStepAction("GEO AI", 3).page, "GEO AI");
  assert.equal(wizardStepAction("Integrazioni", 3).page, "Integrazioni");
  assert.equal(wizardStepAction("Impostazioni", 3).page, "Impostazioni");
});

test("il fondo del percorso guidato usa un grigio sensibilmente più marcato", () => {
  assert.match(wizardCss, /background:\s*#e7ebef\s*!important/);
  assert.match(wizardCss, /border-color:\s*#c4ced8\s*!important/);
});
