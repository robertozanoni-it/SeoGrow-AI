import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, css, main, model] = await Promise.all([
  readFile(new URL("./RankingsWorkspaceLayer.jsx", import.meta.url), "utf8"),
  readFile(new URL("./RankingsWorkspaceLayer.css", import.meta.url), "utf8"),
  readFile(new URL("./appMain.jsx", import.meta.url), "utf8"),
  readFile(new URL("./modules/rank/positioningModel.js", import.meta.url), "utf8"),
]);

test("Posizionamenti monta un workspace largo e leggibile senza sostituire i controlli DataForSEO esistenti", () => {
  assert.match(main, /import RankingsWorkspaceLayer from ['"]\.\/RankingsWorkspaceLayer['"]/);
  assert.match(main, /<RankingsWorkspaceLayer\s*\/>/);
  assert.match(workspace, /guided-next-actions-host/);
  assert.match(css, /\.rankings-workspace-host[\s\S]*max-width:\s*none/);
  assert.match(css, /min-width:\s*1220px/);
});

test("la tabella mostra keyword URL posizione delta storico filtri confronto fonte e data", () => {
  for (const expected of ["Keyword", "Posizione", "Δ periodo", "URL posizionata", "Storico", "Confronto periodo", "Fonte e data"]) {
    assert.match(workspace, new RegExp(expected));
  }
  assert.match(workspace, /positioningFilter/);
  assert.match(workspace, /comparableRankingRuns/);
  assert.match(workspace, /RANKING_SOURCE/);
  assert.match(workspace, /formatDateTime\(row\.checkedAt\)/);
});

test("ranking collega soltanto evidenze realmente presenti a pagina problemi e opportunita", () => {
  assert.match(workspace, /problemIndex\.get\(normalizedUrl\(row\.url\)\)/);
  assert.match(workspace, /openProblemResolution\(linkedProblems\[0\]/);
  assert.match(workspace, /opportunityEvidenceForKeyword\(row\.keyword, opportunitySet\)/);
  assert.match(workspace, /navigatePage\("Opportunità"\)/);
  assert.match(workspace, /Nessun problema osservato sulla URL/);
  assert.match(workspace, /Nessuna opportunità GSC associata/);
});

test("il gate vieta delta senza osservazioni comparabili e richiede checkedAt valido", () => {
  assert.match(model, /validDate\(run\?\.checkedAt\)/);
  assert.match(model, /currentPosition != null && previousPosition != null/);
  assert.match(model, /RANKING_SOURCE = "DataForSEO"/);
  assert.doesNotMatch(workspace, /demo|mock|simulat/i);
});
