import test from "node:test";
import assert from "node:assert/strict";
import { deriveProjectContinuity } from "./projectContinuity.js";

const projectState = {
  clientId: 7,
  client: { id: 7, name: "Studio QA", url: "https://qa.example/", gscProperty: "sc-domain:qa.example" },
  project: { objective: "Crescita locale" },
  audits: {
    site: [{
      analyzedAt: "2026-09-17T08:00:00Z",
      score: 81,
      issues: [{ type: "noindex", label: "Pagina noindex", sourceUrl: "https://qa.example/a" }],
    }],
    page: [],
  },
  tasks: [
    { id: "t1", title: "Controlla pagina", sourceClientId: 7, status: "Da fare", priority: "Alta", kind: "noindex", sourceUrl: "https://qa.example/a" },
    { id: "t2", title: "Task chiusa", sourceClientId: 7, status: "Completato", priority: "Media", kind: "seo-agent" },
  ],
  corrections: [
    { id: "c1", clientId: 7, issueType: "noindex", issueLabel: "Pagina noindex", sourceUrl: "https://qa.example/a", status: "Verificato", verifiedAt: "2026-09-17T08:30:00Z" },
  ],
  problemClosures: [
    { clientId: 7, issueType: "noindex", sourceUrl: "https://qa.example/a", closedAt: "2026-09-17T08:40:00Z" },
  ],
};

test("continuità progetto aggrega integrazioni e lavoro senza riaprire issue chiuse", () => {
  const result = deriveProjectContinuity({
    projectState,
    dataset: { property: { url: "sc-domain:qa.example" }, queries: [{ query: "dentista" }] },
    rankings: {
      7: [{ checkedAt: "2026-09-17T09:00:00Z", rankings: [{ keyword: "dentista", position: 3 }] }],
    },
    wordpressProfile: { url: "https://qa.example/", username: "qa-admin", name: "QA" },
    wordpressSession: { url: "https://qa.example/", username: "qa-admin", applicationPassword: "session-only" },
    dataForSeoStatus: { configured: true, verified: true },
    openAiStatus: { configured: true },
  });

  assert.equal(result.clientId, 7);
  assert.equal(result.site, "https://qa.example/");
  assert.equal(result.integrations.wordpress.connected, true);
  assert.equal(result.integrations.wordpress.detail, "qa-admin");
  assert.equal("applicationPassword" in result.integrations.wordpress, false);
  assert.equal(result.integrations.searchConsole.connected, true);
  assert.equal(result.integrations.searchConsole.detail, "sc-domain:qa.example");
  assert.equal(result.integrations.dataForSeo.connected, true);
  assert.equal(result.integrations.openAI.connected, true);
  assert.equal(result.work.audit.score, 81);
  assert.equal(result.work.problems.active, 0);
  assert.equal(result.work.problems.resolved, 1);
  assert.equal(result.work.corrections.total, 1);
  assert.equal(result.work.corrections.verified, 1);
  assert.equal(result.work.tasks.active, 1);
  assert.equal(result.work.tasks.completed, 1);
  assert.equal(result.work.rankings.keywords, 1);
});

test("profilo WordPress persistente non equivale a salvare il segreto", () => {
  const result = deriveProjectContinuity({
    projectState: { ...projectState, problemClosures: [] },
    wordpressProfile: { url: "https://qa.example/", username: "qa-admin" },
    wordpressSession: null,
  });
  assert.equal(result.integrations.wordpress.configured, true);
  assert.equal(result.integrations.wordpress.connected, false);
  assert.match(result.integrations.wordpress.label, /Configurato/);
});
