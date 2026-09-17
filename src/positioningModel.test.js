import test from "node:test";
import assert from "node:assert/strict";
import {
  RANKING_SOURCE,
  validRankingRuns,
  comparableRankingRuns,
  buildPositioningRows,
  opportunityEvidenceForKeyword,
  positioningFilter,
} from "./modules/rank/index.js";

const run = (checkedAt, rankings, extra = {}) => ({
  checkedAt,
  device: "desktop",
  depth: 20,
  locationCode: 2380,
  languageCode: "it",
  rankings,
  ...extra,
});

test("Posizionamenti usa DataForSEO come provenienza esplicita e scarta run senza data verificabile", () => {
  const history = [
    run("2026-09-17T10:00:00.000Z", [{ keyword: "seo bergamo", position: 7, url: "https://example.com/seo" }]),
    run("", [{ keyword: "seo bergamo", position: 5 }]),
  ];
  const valid = validRankingRuns(history);
  assert.equal(valid.length, 1);
  const rows = buildPositioningRows(valid[0], null, valid);
  assert.equal(rows[0].source, RANKING_SOURCE);
  assert.equal(rows[0].source, "DataForSEO");
  assert.equal(rows[0].checkedAt, "2026-09-17T10:00:00.000Z");
});

test("il confronto accetta solo periodi con device, profondita, localita e lingua identici", () => {
  const current = run("2026-09-17T10:00:00.000Z", [{ keyword: "seo bergamo", position: 7 }]);
  const comparable = run("2026-09-10T10:00:00.000Z", [{ keyword: "seo bergamo", position: 11 }]);
  const mobile = run("2026-09-03T10:00:00.000Z", [{ keyword: "seo bergamo", position: 9 }], { device: "mobile" });
  const differentLocation = run("2026-08-27T10:00:00.000Z", [{ keyword: "seo bergamo", position: 8 }], { locationCode: 2840 });
  assert.deepEqual(comparableRankingRuns(current, [current, comparable, mobile, differentLocation]), [comparable]);
  const [row] = buildPositioningRows(current, comparable, [current, comparable, mobile, differentLocation]);
  assert.equal(row.delta, 4);
});

test("nessun delta viene inventato quando una delle due posizioni non e osservata", () => {
  const current = run("2026-09-17T10:00:00.000Z", [{ keyword: "seo bergamo", position: null, url: "" }]);
  const previous = run("2026-09-10T10:00:00.000Z", [{ keyword: "seo bergamo", position: 11 }]);
  const [row] = buildPositioningRows(current, previous, [current, previous]);
  assert.equal(row.delta, null);
  assert.equal(row.position, null);
  assert.equal(row.positionLabel, ">20");
  assert.equal(row.url, "");
});

test("lo storico mantiene solo osservazioni comparabili e conserva i valori non verificati", () => {
  const current = run("2026-09-17T10:00:00.000Z", [{ keyword: "seo bergamo", error: "provider error" }]);
  const previous = run("2026-09-10T10:00:00.000Z", [{ keyword: "seo bergamo", position: 13 }]);
  const [row] = buildPositioningRows(current, previous, [current, previous]);
  assert.equal(row.positionLabel, "Non verificata");
  assert.deepEqual(row.history.map((point) => point.label), ["13", "Non verificata"]);
});

test("opportunita collegate solo con corrispondenza esatta della query salvata", () => {
  const groups = {
    quickWins: [{ dimension: "seo bergamo", impressions: 100 }],
    lowCtr: [{ dimension: "SEO BERGAMO", impressions: 80 }],
    losses: [{ query: "seo milano" }],
    cannibalizations: [],
  };
  assert.deepEqual(opportunityEvidenceForKeyword(" Seo Bergamo ", groups).map((item) => item.group), ["quickWins", "lowCtr"]);
  assert.deepEqual(opportunityEvidenceForKeyword("seo torino", groups), []);
});

test("i filtri lavorano solo sui dati osservati", () => {
  const row = { keyword: "seo bergamo", url: "https://example.com/seo", position: 9, delta: 2, error: "" };
  assert.equal(positioningFilter(row, { query: "bergamo", view: "growth" }), true);
  assert.equal(positioningFilter(row, { query: "milano", view: "growth" }), false);
  assert.equal(positioningFilter(row, { view: "top10" }), true);
  assert.equal(positioningFilter({ ...row, position: null }, { view: "beyond" }), true);
  assert.equal(positioningFilter({ ...row, error: "errore", position: null }, { view: "beyond" }), false);
});
