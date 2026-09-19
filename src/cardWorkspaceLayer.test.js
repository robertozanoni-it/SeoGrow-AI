import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layer = await readFile(new URL("./CardWorkspaceLayer.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("./CardWorkspaceLayer.css", import.meta.url), "utf8");
const sidebarCss = await readFile(new URL("./SidebarReadabilityFix.css", import.meta.url), "utf8");
const bridge = await readFile(new URL("./ProblemsNavBridge.jsx", import.meta.url), "utf8");
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
  assert.match(layer, /Soluzioni e prossimi passi/);
  assert.match(css, /\.card-record-rail/);
  assert.match(css, /\.card-horizontal-detail/);
  assert.match(css, /grid-auto-flow:\s*column/);
});

test("hub, dettaglio e strumenti sono tre stati distinti", () => {
  assert.match(layer, /seogrowCardMode/);
  assert.match(layer, /"manage"\s*:\s*selectedId\s*\?\s*"detail"\s*:\s*"hub"/);
  assert.match(layer, /Torna alle card/);
  assert.match(layer, /Apri strumenti operativi/);
  assert.match(layer, /data-seogrow-card-original/);
  assert.match(css, /data-seogrow-card-mode="hub"/);
  assert.match(css, /data-seogrow-card-mode="detail"/);
  assert.match(css, /data-seogrow-card-original="true"/);
});

test("Posizionamenti usa lo storico reale e il confronto precedente", () => {
  assert.match(layer, /seogrow-rankings-v1/);
  assert.match(layer, /buildRankingCards/);
  assert.match(layer, /previousMap/);
  assert.match(layer, /Variazione/);
  assert.match(css, /data-seogrow-card-page="Posizionamenti"/);
});

test("il card layer continua a coprire anche le viste legacy durante la migrazione", () => {
  for (const page of ["Clienti", "Audit SEO", "Storico", "Problemi", "Correzioni", "Posizionamenti", "Task", "Opportunità", "Link interni", "Piano editoriale", "SEO Agent", "GEO AI", "Integrazioni", "Impostazioni", "Panoramica", "Centro progetto"]) {
    assert.match(layer, new RegExp(page.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("la sidebar mantiene contrasto e presenta Problemi come sottovista Audit", () => {
  assert.match(main, /SidebarReadabilityFix\.css/);
  assert.match(sidebarCss, /nav\.guided-nav button/);
  assert.match(sidebarCss, /color:\s*#4e6885\s*!important/);
  assert.match(sidebarCss, /button\.active/);
  assert.match(sidebarCss, /background:\s*#1f5489\s*!important/);
  assert.match(main, /<ProblemsNavBridge \/>/);
  assert.match(bridge, /guided-audit-subnav-host/);
  assert.match(bridge, /data-seogrow-subview="Audit SEO:Problemi"/);
  assert.match(sidebarCss, /\.guided-audit-subnav-host/);
});

test("il layer non introduce polling DOM invasivo", () => {
  assert.doesNotMatch(layer, /MutationObserver/);
  assert.doesNotMatch(layer, /setInterval/);
  assert.doesNotMatch(layer, /window\.fetch\s*=/);
});


test("la sottovista Problemi selezionata usa background rosso con testo bianco leggibile", async () => {
  const css = await readFile(new URL('./SidebarReadabilityFix.css', import.meta.url), 'utf8');
  assert.match(css, /problems-nav-bridge-button\.active[\s\S]*background:\s*#d92d20\s*!important/);
  assert.match(css, /problems-nav-bridge-button\.active[\s\S]*color:\s*#ffffff\s*!important/);
});
