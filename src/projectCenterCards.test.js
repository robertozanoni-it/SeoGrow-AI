import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const center = await readFile(new URL("./ProjectCenter.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("./ProjectCenterCards.css", import.meta.url), "utf8");

test("Centro progetto mostra sezioni come card datate", () => {
  assert.match(center, /project-center-section-grid/);
  assert.match(center, /project-center-section-card/);
  assert.match(center, /project-center-card-date/);
  assert.match(center, /formatDate\(area\.date\)/);
  assert.match(center, /Preparazione del progetto/);
  assert.match(center, /Analizza e correggi/);
  assert.match(center, /Controlli nel tempo/);
  assert.match(center, /Condivisione dei risultati/);
});

test("clic sulla card apre una sola pagina operativa orizzontale", () => {
  assert.match(center, /setActiveArea\(id\)/);
  assert.match(center, /project-center-detail-shell/);
  assert.match(center, /project-center-horizontal-layout/);
  assert.match(center, /Soluzioni e prossimi passi/);
  assert.match(center, /Torna alle card/);
  assert.match(css, /grid-template-columns: 250px minmax\(0, 1fr\)/);
});

test("i controlli esistenti restano montati e isolati per area", () => {
  assert.match(center, /className="wizard-steps"/);
  assert.match(center, /<AutoFixPanel client=\{client\}/);
  assert.match(center, /<IsolatedElementorQaPanel/);
  assert.match(center, /\{children\}/);
  assert.match(center, /Nome studio o agenzia/);
  assert.match(center, /Scarica report personalizzato/);
  assert.match(center, /hidden=\{activeArea !== "setup"\}/);
  assert.match(center, /hidden=\{activeArea !== "report"\}/);
});

test("il Centro progetto non duplica il card archive globale", () => {
  assert.match(css, /data-seogrow-page="centro-progetto"[^\n]*\.card-workspace-host/);
});
