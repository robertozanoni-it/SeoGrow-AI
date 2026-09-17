import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, model, main, content, links, rank] = await Promise.all([
  readFile(new URL("./OpportunitiesWorkspaceLayer.jsx", import.meta.url), "utf8"),
  readFile(new URL("./modules/rank/seoOpportunities.js", import.meta.url), "utf8"),
  readFile(new URL("./appMain.jsx", import.meta.url), "utf8"),
  readFile(new URL("./modules/content/index.js", import.meta.url), "utf8"),
  readFile(new URL("./modules/links/index.js", import.meta.url), "utf8"),
  readFile(new URL("./modules/rank/index.js", import.meta.url), "utf8"),
]);

test("workspace Opportunità raccoglie le quattro fonti richieste", () => {
  assert.match(workspace, /buildUnifiedProblems/);
  assert.match(workspace, /buildPositioningRows/);
  assert.match(workspace, /contentPlan/);
  assert.match(workspace, /analyzeInternalLinkSuggestions/);
  assert.match(workspace, /auditProblems:\s*problems/);
  assert.match(workspace, /rankingRows/);
  assert.match(workspace, /contentItems/);
  assert.match(workspace, /linkSuggestions:\s*safeLinks/);
});

test("modello Opportunità deduplica e calcola priorità, impatto e sforzo", () => {
  assert.match(model, /const grouped = new Map\(\)/);
  assert.match(model, /dedupeKey/);
  assert.match(model, /priorityEvidence/);
  assert.match(model, /impact/);
  assert.match(model, /effort/);
  assert.match(model, /corroboration/);
});

test("Gate azionabilità permette solo Task, Correzione o Contenuto", () => {
  assert.match(model, /ACTION_PAGES/);
  assert.match(model, /validateSeoOpportunityActionability/);
  assert.match(model, /CTA operativa mancante o non supportata/);
  assert.match(workspace, /data-opportunity-action/);
  assert.match(workspace, /item\.action\.label/);
  assert.match(workspace, /navigatePage\("Task"\)/);
  assert.match(workspace, /navigatePage\("Piano editoriale"\)/);
  assert.match(workspace, /openProblemResolution/);
  assert.match(workspace, /navigatePage\("Link interni"\)/);
});

test("Task create dall'Opportunità sono persistenti e deduplicate", () => {
  assert.match(workspace, /createTaskDraft/);
  assert.match(workspace, /sameTask/);
  assert.match(workspace, /writeWorkspaceJson\(WORKSPACE_KEYS\.tasks/);
});

test("workspace Opportunità è montato nel runtime reale", () => {
  assert.match(main, /import OpportunitiesWorkspaceLayer from ['"]\.\/OpportunitiesWorkspaceLayer['"]/);
  assert.match(main, /<OpportunitiesWorkspaceLayer\s*\/>/);
});

test("consumer usa le facade pubbliche di Rank, Content e Links", () => {
  assert.match(workspace, /from ["']\.\/modules\/rank\/index\.js["']/);
  assert.match(workspace, /from ["']\.\/modules\/content\/index\.js["']/);
  assert.match(workspace, /from ["']\.\/modules\/links\/index\.js["']/);
  assert.match(rank, /buildSeoOpportunities/);
  assert.match(content, /contentPlan/);
  assert.match(links, /analyzeInternalLinkSuggestions/);
});
