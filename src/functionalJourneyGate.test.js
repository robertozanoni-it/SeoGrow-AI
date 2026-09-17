import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  initializeWorkspace,
  workspaceStorage,
  flushWorkspace,
  openWorkspaceDb,
  readWorkspace,
} from "./workspaceDatabase.js";
import { rememberWordPressSession, getWordPressSession } from "./system/index.js";
import { buildUnifiedProblems } from "./problemsModel.js";
import {
  saveCorrection,
  updateCorrection,
  readCorrection,
  listCorrections,
  removeVerifiedTask,
  reopenTask,
} from "./remediationStore.js";
import { createTaskDraft } from "./experience/tasks/index.js";
import { buildPositioningRows, buildSeoOpportunities } from "./modules/rank/index.js";
import { buildEditorialPlanRows, patchEditorialPlanState } from "./modules/content/index.js";

const native = new Map();
const localStorage = {
  get length() { return native.size; },
  key(index) { return [...native.keys()][index] ?? null; },
  getItem(key) { return native.get(key) ?? null; },
  setItem(key, value) { native.set(key, String(value)); },
  removeItem(key) { native.delete(key); },
};

const windowMock = Object.assign(new EventTarget(), {
  indexedDB: new IDBFactory(),
  setTimeout,
  clearTimeout,
  location: { href: "http://localhost:5176/", reload() {} },
});
globalThis.window = windowMock;
globalThis.localStorage = localStorage;
globalThis.StorageEvent = class extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } };
globalThis.CustomEvent = class extends Event { constructor(type, init = {}) { super(type); this.detail = init.detail; } };

const json = (key, fallback) => {
  try { return JSON.parse(workspaceStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};
const put = (key, value) => workspaceStorage.setItem(key, JSON.stringify(value));

await initializeWorkspace(localStorage);

test("Gate 18: full functional journey survives without manual resets", async () => {
  const client = { id: 31801, name: "Functional journey", url: "https://journey.example/" };

  // 1. Nuovo cliente.
  put("seogrow-clients", [client]);
  put("seogrow-selected-client-v1", client.id);
  assert.equal(json("seogrow-selected-client-v1", 0), client.id);

  // 2. Collega WordPress: one transient session, never persisted.
  rememberWordPressSession(client.id, { url: client.url, username: "qa-user", applicationPassword: "qa-session-only" });
  assert.equal(getWordPressSession(client.id, client.url)?.username, "qa-user");
  assert.equal(JSON.stringify([...native.values()]).includes("qa-session-only"), false);

  // 3–4. Audit -> problema canonico.
  const issue = {
    type: "meta_description",
    label: "Meta description mancante",
    detail: "La pagina non espone una meta description.",
    severity: "alta",
    sourceUrl: "https://journey.example/servizio/",
  };
  const audit = { analyzedAt: "2026-09-17T17:00:00.000Z", url: client.url, issues: [issue] };
  put("seogrow-analyses-v2", { [client.id]: [audit] });
  let problems = buildUnifiedProblems({ clientId: client.id, siteHistory: [audit], tasks: [], corrections: [] }).rows;
  assert.equal(problems.length, 1);
  assert.equal(problems[0].problemState, "open");
  const problem = problems[0];

  // 5. Task collegata alla causa, nello stesso workspace.
  const task = createTaskDraft({
    title: issue.label,
    kind: issue.type,
    priority: "Alta",
    sourceUrl: issue.sourceUrl,
    detail: issue.detail,
    origin: "audit",
    automatic: true,
    taskLinks: { problemKey: problem.key },
  }, { client, clientId: client.id, idFactory: () => "journey-task" });
  put("seogrow-tasks-v2", [task]);

  // 6. Correzione -> verifica: usa lo store canonico delle Correzioni.
  const correction = await saveCorrection({
    id: "journey-correction",
    clientId: client.id,
    clientName: client.name,
    issueType: issue.type,
    issueLabel: issue.label,
    severity: "alta",
    sourceUrl: issue.sourceUrl,
    siteUrl: client.url,
    adapter: "Rank Math",
    status: "Da verificare",
    writeConfirmed: true,
    fields: ["meta.rank_math_description"],
    before: { "meta.rank_math_description": "" },
    after: { "meta.rank_math_description": "Descrizione verificabile" },
    appliedAt: "2026-09-17T17:05:00.000Z",
  });
  const verified = await updateCorrection(correction.id, {
    status: "Verificato",
    verifiedAt: "2026-09-17T17:06:00.000Z",
    frontendConfirmed: true,
    verificationNote: "Frontend e audit confermano la modifica.",
  });
  removeVerifiedTask(verified);
  assert.equal((await readCorrection(correction.id)).status, "Verificato");
  assert.equal(json("seogrow-tasks-v2", [])[0].status, "Completato");

  // 7. Rollback -> task riaperta, senza reset manuale.
  const rolledBack = await updateCorrection(correction.id, {
    status: "Ripristinato",
    rollbackAt: "2026-09-17T17:07:00.000Z",
  });
  reopenTask(rolledBack);
  assert.equal((await readCorrection(correction.id)).status, "Ripristinato");
  assert.equal(json("seogrow-tasks-v2", [])[0].status, "Da fare");

  // 8–10. Ranking -> opportunità, nello stesso progetto.
  const rankingRun = {
    checkedAt: "2026-09-17T17:08:00.000Z",
    depth: 50,
    device: "desktop",
    locationCode: 2380,
    languageCode: "it",
    rankings: [{ keyword: "seo locale bergamo", position: 8, url: issue.sourceUrl }],
  };
  put("seogrow-rankings-v1", { [client.id]: [rankingRun] });
  const rankingRows = buildPositioningRows(rankingRun, null, [rankingRun]);
  assert.equal(rankingRows[0].source, "DataForSEO");
  const dataset = {
    queries: [{ dimension: "seo locale bergamo", impressions: 120, clicks: 4, ctr: 1.1, position: 8, page: issue.sourceUrl }],
    queryPages: [{ dimension: "seo locale bergamo", impressions: 120, pages: [issue.sourceUrl] }],
  };
  put("seogrow-gsc-v1", { [client.id]: dataset });
  const opportunityResult = buildSeoOpportunities({ rankingRows, gscDataset: dataset });
  assert.ok(opportunityResult.opportunities.some(item => item.action?.page === "Piano editoriale"));

  // 11. Piano editoriale collegato a ranking/opportunità.
  const editorialRows = buildEditorialPlanRows({
    dataset,
    analysis: audit,
    rankingRows,
    opportunities: opportunityResult.opportunities,
    topicalMap: { ideas: [{ keyword: "seo locale bergamo", coreKeyword: "seo locale", intent: "commerciale", searchVolume: 140, covered: false }] },
  });
  const editorial = editorialRows.find(row => row.keyword === "seo locale bergamo");
  assert.ok(editorial);
  assert.ok(editorial.ranking);
  assert.ok(editorial.opportunity);
  const editorialState = patchEditorialPlanState({}, editorial.id, { status: "Pianificato", brief: "Brief QA funzionale" });
  const preferences = { projectSettings: { [client.id]: { editorialPlanState: editorialState } } };
  put("seogrow-preferences-v1", preferences);

  // 12. Riapertura app: tutto il workspace canonico è già committato in IndexedDB.
  await flushWorkspace();
  const db = await openWorkspaceDb();
  const persisted = await readWorkspace(db);
  db.close();
  assert.equal(JSON.parse(persisted.get("seogrow-selected-client-v1")), client.id);
  assert.equal(JSON.parse(persisted.get("seogrow-tasks-v2"))[0].status, "Da fare");
  assert.equal(JSON.parse(persisted.get("seogrow-rankings-v1"))[client.id][0].rankings[0].keyword, "seo locale bergamo");
  assert.equal(JSON.parse(persisted.get("seogrow-preferences-v1")).projectSettings[client.id].editorialPlanState[editorial.id].status, "Pianificato");
  assert.equal((await listCorrections({ clientId: client.id }))[0].status, "Ripristinato");
});
