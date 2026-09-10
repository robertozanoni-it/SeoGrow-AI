import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layer = await readFile(new URL("./CardWorkspaceLayer.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("./CardWorkspaceLayer.css", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("il layer card-first è montato globalmente", () => {
  assert.match(main, /import CardWorkspaceLayer from ['"]\.\/CardWorkspaceLayer['"]/);
  assert.match(main, /<CardWorkspaceLayer \/>/);
});

test("le card hanno data e dettaglio orizzontale", () => {
  assert.match(layer, /card-record-date/);
  assert.match(layer, /formatDate\(item\.date\)/);
  assert.match(layer, /function HorizontalDetail/);
  assert.match(layer, /card-horizontal-fields/);
  assert.match(css, /\.card-record-rail/);
  assert.match(css, /\.card-horizontal-detail/);
  assert.match(css, /grid-auto-flow:column/);
});

test("Posizionamenti usa lo storico reale e il confronto precedente", () => {
  assert.match(layer, /seogrow-rankings-v1/);
  assert.match(layer, /buildRankingCards/);
  assert.match(layer, /previousMap/);
  assert.match(layer, /Variazione/);
  assert.match(css, /data-seogrow-card-page="Posizionamenti"/);
});

test("il card layer copre le principali pagine operative", () => {
  for (const page of ["Clienti", "Audit SEO", "Storico", "Problemi", "Correzioni", "Posizionamenti", "Task", "Opportunità", "Link interni", "Piano editoriale", "SEO Agent", "GEO AI", "Integrazioni", "Impostazioni", "Panoramica", "Centro progetto"]) {
    assert.match(layer, new RegExp(page.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("il layer non introduce polling DOM invasivo", () => {
  assert.doesNotMatch(layer, /MutationObserver/);
  assert.doesNotMatch(layer, /setInterval/);
  assert.doesNotMatch(layer, /window\.fetch\s*=/);
});
