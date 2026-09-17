import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { canonicalCorrections, canonicalizeWorkspaceEntries } from "./core/workspace/projectState.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { normalizeWorkspacePersistence } from "./core/workspace/normalizePersistence.js";
import { buildUnifiedProblems } from "./problemsModel.js";
import { loadProjectProblemSummary } from "./projectProblemSummary.js";
import { loadProjectWorkspaceState } from "./projectWorkspaceState.js";
import { replaceCorrections, saveCorrection } from "./remediationStore.js";
import { flushWorkspace, initializeWorkspace, workspaceStorage } from "./workspaceDatabase.js";

const json = (value) => JSON.stringify(value);

const fixtureEntries = () => new Map([
  [WORKSPACE_KEYS.clients, json([
    { id: 1, name: "Uno", url: "https://uno.example" },
    { id: 1, name: "Uno duplicato", url: "https://uno.example" },
    { id: 2, name: "Due", url: "https://due.example" },
  ])],
  [WORKSPACE_KEYS.selectedClient, json(1)],
  ["seogrow-tasks", json([
    { id: "t1", title: "Controlla noindex", sourceClientId: 1, status: "Da fare", priority: "Alta", kind: "noindex", sourceUrl: "https://uno.example/a", updatedAt: "2026-09-16T09:00:00Z" },
    { id: "t1", title: "Controlla noindex", sourceClientId: 1, status: "Completato", priority: "Alta", kind: "noindex", sourceUrl: "https://uno.example/a", updatedAt: "2026-09-16T12:00:00Z", completedAt: "2026-09-16T12:00:00Z" },
  ])],
  ["seogrow-analyses-v1", json({
    1: { analyzedAt: "2026-09-16T10:00:00Z", issues: [{ type: "noindex", label: "Pagina noindex", sourceUrl: "https://uno.example/a" }] },
  })],
  [WORKSPACE_KEYS.pageAuditHistory, json({
    1: [
      { analyzedAt: "2026-09-16T10:00:00Z", url: "https://uno.example/a", issues: [{ type: "noindex", label: "Pagina noindex", sourceUrl: "https://uno.example/a" }] },
      { analyzedAt: "2026-09-16T10:00:00Z", url: "https://uno.example/a", issues: [{ type: "noindex", label: "Pagina noindex", sourceUrl: "https://uno.example/a" }] },
    ],
  })],
  [WORKSPACE_KEYS.problemClosures, json([
    { clientId: 1, issueType: "noindex", sourceUrl: "https://uno.example/a", closedAt: "2026-09-16T10:30:00Z" },
    { clientId: 1, issueType: "noindex", sourceUrl: "https://uno.example/a/", closedAt: "2026-09-16T11:00:00Z" },
  ])],
  [WORKSPACE_KEYS.preferences, json({ projectSettings: { 1: { goal: "SEO locale" }, 2: { goal: "SEO nazionale" } } })],
]);

test("canonical workspace elimina duplicati e chiavi legacy senza cambiare al secondo passaggio", () => {
  const first = canonicalizeWorkspaceEntries(fixtureEntries());
  const second = canonicalizeWorkspaceEntries(first);
  assert.deepEqual([...second.entries()], [...first.entries()]);
  assert.equal(first.has("seogrow-tasks"), false);
  assert.equal(first.has("seogrow-analyses-v1"), false);
  assert.equal(JSON.parse(first.get(WORKSPACE_KEYS.clients)).length, 2);
  const tasks = JSON.parse(first.get(WORKSPACE_KEYS.tasks));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, "Completato");
  assert.equal(JSON.parse(first.get(WORKSPACE_KEYS.analyses))[1].length, 1);
  assert.equal(JSON.parse(first.get(WORKSPACE_KEYS.pageAuditHistory))[1].length, 1);
  const closures = JSON.parse(first.get(WORKSPACE_KEYS.problemClosures));
  assert.equal(closures.length, 1);
  assert.equal(closures[0].closedAt, "2026-09-16T11:00:00Z");
});

test("normalizzazione non crea un clients vuoto su una prima apertura senza dati", () => {
  const normalized = canonicalizeWorkspaceEntries(new Map());
  assert.equal(normalized.has(WORKSPACE_KEYS.clients), false);
  assert.equal(normalized.has(WORKSPACE_KEYS.selectedClient), false);
});

test("correzioni duplicate conservano lo stato più recente per id", () => {
  const corrections = canonicalCorrections([
    { id: "c1", clientId: 1, status: "Applicato", appliedAt: "2026-09-16T10:00:00Z" },
    { id: "c1", clientId: 1, status: "Verificato", appliedAt: "2026-09-16T10:00:00Z", verifiedAt: "2026-09-16T11:00:00Z" },
    { id: "c2", clientId: 1, status: "Preparato", createdAt: "2026-09-16T09:00:00Z" },
  ]);
  assert.equal(corrections.length, 2);
  assert.equal(corrections.find((item) => item.id === "c1").status, "Verificato");
});

test("cliente progetto audit correzioni task e chiusure restano identici dopo reload e cambio cliente", async () => {
  const oldWindow = globalThis.window;
  const oldLocalStorage = globalThis.localStorage;
  const factory = new IDBFactory();
  const native = fixtureEntries();
  const nativeStorage = {
    get length() { return native.size; },
    key: (index) => [...native.keys()][index],
    getItem: (key) => native.get(key) ?? null,
  };
  globalThis.window = { indexedDB: factory, dispatchEvent: () => true };
  globalThis.localStorage = nativeStorage;
  try {
    await initializeWorkspace(nativeStorage);
    await normalizeWorkspacePersistence();
    await replaceCorrections([]);
    await saveCorrection({
      id: "c1",
      clientId: 1,
      clientName: "Uno",
      issueType: "noindex",
      issueLabel: "Pagina noindex",
      sourceUrl: "https://uno.example/a",
      status: "Applicato",
      appliedAt: "2026-09-16T10:15:00Z",
      fields: ["robots"],
    });

    const before = await loadProjectWorkspaceState(1);
    assert.equal(before.client.name, "Uno");
    assert.equal(before.project.goal, "SEO locale");
    assert.equal(before.audits.site.length, 1);
    assert.equal(before.audits.page.length, 1);
    assert.equal(before.tasks.length, 1);
    assert.equal(before.corrections.length, 1);
    assert.equal(before.problemClosures.length, 1);
    const beforeProblems = buildUnifiedProblems({
      clientId: 1,
      siteHistory: before.audits.site,
      pageHistory: before.audits.page,
      tasks: before.tasks,
      corrections: before.corrections,
      closures: before.problemClosures,
      now: Date.parse("2026-09-16T12:00:00Z"),
    });
    assert.equal(beforeProblems.rows[0].problemState, "resolved");
    assert.equal((await loadProjectProblemSummary({ clientId: 1 })).active, 0);

    workspaceStorage.setItem(WORKSPACE_KEYS.selectedClient, json(2));
    await flushWorkspace();
    const other = await loadProjectWorkspaceState(2);
    assert.equal(other.client.name, "Due");
    assert.equal(other.project.goal, "SEO nazionale");
    assert.equal(other.tasks.length, 0);

    workspaceStorage.setItem(WORKSPACE_KEYS.selectedClient, json(1));
    await flushWorkspace();
    await initializeWorkspace(nativeStorage);
    const after = await loadProjectWorkspaceState(1);
    assert.deepEqual(after, before);
    const afterProblems = buildUnifiedProblems({
      clientId: 1,
      siteHistory: after.audits.site,
      pageHistory: after.audits.page,
      tasks: after.tasks,
      corrections: after.corrections,
      closures: after.problemClosures,
      now: Date.parse("2026-09-16T12:00:00Z"),
    });
    assert.equal(afterProblems.rows[0].problemState, "resolved");
    assert.equal((await loadProjectProblemSummary({ clientId: 1 })).active, 0);
    assert.equal(workspaceStorage.getItem("seogrow-tasks"), null);
    assert.equal(workspaceStorage.getItem("seogrow-analyses-v1"), null);
  } finally {
    globalThis.window = oldWindow;
    globalThis.localStorage = oldLocalStorage;
  }
});
