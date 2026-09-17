import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appMain = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");
const workspace = await readFile(new URL("./EditorialPlanWorkspaceLayer.jsx", import.meta.url), "utf8");
const api = await readFile(new URL("./api.js", import.meta.url), "utf8");
const model = await readFile(new URL("./modules/content/editorialPlanModel.js", import.meta.url), "utf8");
const context = await readFile(new URL("./modules/content/editorialProjectContext.js", import.meta.url), "utf8");

test("structured editorial workspace is mounted on the existing Piano editoriale page", () => {
  assert.match(appMain, /import EditorialPlanWorkspaceLayer from ['"]\.\/EditorialPlanWorkspaceLayer['"]/);
  assert.match(appMain, /<EditorialPlanWorkspaceLayer \/>/);
  assert.match(workspace, /page !== "Piano editoriale"/);
  assert.match(workspace, /registerPageHost\(page, mountedHost\)/);
});

test("editorial workspace exposes every required field", () => {
  for (const label of ["Topic", "Keyword", "Intento", "Cluster", "Stato", "Brief", "Data prevista", "Ranking \/ opportunità"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /EDITORIAL_STATUSES/);
  assert.match(workspace, /patchEditorialPlanState/);
  assert.match(workspace, /scheduleItem/);
});

test("ranking and opportunity links use the canonical Rank facade", () => {
  assert.match(workspace, /validRankingRuns/);
  assert.match(workspace, /comparableRankingRuns/);
  assert.match(workspace, /buildPositioningRows/);
  assert.match(workspace, /buildSeoOpportunities/);
  assert.match(workspace, /navigatePage\("Posizionamenti"\)/);
  assert.match(workspace, /navigatePage\("Opportunità"\)/);
  assert.doesNotMatch(model, /includes\(.*keyword|startsWith\(.*keyword/i);
});

test("intent and cluster are evidence fields rather than invented defaults", () => {
  assert.match(model, /const intent = text\(item\.intent \|\| topicalMatch\?\.intent\)/);
  assert.match(model, /const cluster = text\(item\.cluster \|\| topicalMatch\?\.coreKeyword\)/);
  assert.doesNotMatch(model, /intent:\s*["']informazionale["']/i);
  assert.doesNotMatch(model, /cluster:\s*["']generico["']/i);
});

test("editorial generation is fail-closed before the API request", () => {
  assert.match(api, /prepareEditorialGenerateBody/);
  assert.match(api, /serializeEditorialProjectContext/);
  assert.match(api, /PROJECT_CONTEXT_REQUIRED/);
  assert.match(api, /trimGenerateContext\(prepareEditorialGenerateBody\(init\.body\)\)/);
  assert.match(api, /isWordPressRemediationGenerate/);
  assert.match(context, /Manca un’evidenza SEO del progetto/);
});

test("WordPress remediation remains outside the editorial generation gate", () => {
  assert.match(api, /\^Remediation WordPress\\b/i);
  assert.match(api, /isWordPressRemediationGenerate\(payload\.topic\).*return body/);
});
