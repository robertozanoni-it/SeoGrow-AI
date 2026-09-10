import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layer = await readFile(new URL("./GuidedUxLayer.jsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("./navigationUx.js", import.meta.url), "utf8");
const css = await readFile(new URL("./GuidedUxLayer.css", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("la UX guidata espone priorità e modalità semplice/avanzata", () => {
  assert.match(layer, /Cosa fare adesso/);
  assert.match(layer, /Modalità semplice/);
  assert.match(layer, /Modalità avanzata/);
  assert.match(layer, /\["Problemi", ListChecks\]/);
  assert.match(layer, /\["Correzioni", CheckCircle2\]/);
});

test("ogni pagina usa card numerate progressive e spiegazioni finali", () => {
  assert.match(layer, /const PAGE_GUIDES =/);
  assert.match(layer, /function PageWizard/);
  assert.match(layer, /guided-step-card/);
  assert.match(layer, /guided-step-number/);
  assert.match(layer, /Passo \{step \+ 1\} di \{guide\.steps\.length\}/);
  assert.match(layer, /Successivo/);
  assert.match(layer, /function PageHelp/);
  assert.match(layer, /Spiegazioni in fondo alla pagina/);
  assert.match(layer, /<details/);
  assert.match(css, /\.guided-wizard-cards/);
  assert.match(css, /\.guided-step-card\.tone-blue/);
  assert.match(css, /\.guided-step-card\.tone-mint/);
  assert.match(css, /\.guided-page-help-host/);
});

test("la modalità semplice applica il design system globale senza rimuovere la logica", () => {
  assert.match(css, /--sg-blue:/);
  assert.match(css, /--sg-mint:/);
  assert.match(css, /body\[data-seogrow-ui-mode="simple"\] \.workspace main/);
  assert.match(css, /body\[data-seogrow-ui-mode="simple"\] \.panel/);
  assert.match(css, /body\[data-seogrow-ui-mode\] \.sidebar/);
  assert.doesNotMatch(layer, /innerHTML\s*=/);
});

test("la navigazione Correzioni entra nell'overlay prima del fallback dell'App core", () => {
  assert.match(navigation, /if \(page === "Correzioni"\)/);
  assert.match(navigation, /window\.__seogrowCorrectionsMode = true/);
  assert.match(navigation, /window\.history\.pushState\(null, "", next\)/);
  assert.match(navigation, /seogrow-locationchange/);
});

test("la nuova UX non introduce altri MutationObserver o monkey patch fetch", () => {
  assert.doesNotMatch(layer, /MutationObserver/);
  assert.doesNotMatch(layer, /window\.fetch\s*=/);
  assert.doesNotMatch(layer, /globalThis\.fetch\s*=/);
});

test("la sidebar originale resta come fallback se il layer non monta", () => {
  assert.match(css, /body\[data-seogrow-ui-mode\] \.sidebar > nav:not\(\.guided-nav\)/);
  assert.doesNotMatch(css, /^\.sidebar > nav:not\(\.guided-nav\)\s*\{[^}]*display:\s*none/m);
});

test("il bootstrap monta esplicitamente il layer guidato", () => {
  assert.match(main, /import GuidedUxLayer from ['"]\.\/GuidedUxLayer['"]/);
  assert.match(main, /<GuidedUxLayer \/>/);
});
