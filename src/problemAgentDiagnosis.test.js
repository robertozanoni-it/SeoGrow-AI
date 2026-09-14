import test from "node:test";
import assert from "node:assert/strict";
import { buildProblemAgentRun, findProblemFinding } from "./problemAgentDiagnosis.js";
import { resolutionPath } from "./resolutionPath.js";

const pageUrl = "https://yogabuenaonda.it/yoga-alimentazione-cinisello-balsamo";
const reviewItem = {
  type: "canonical-different",
  label: "Canonical differente dall’URL analizzato",
  sourceUrl: `${pageUrl}/`,
  detail: "La canonical osservata non coincide con la URL analizzata.",
  severity: "low",
  diagnosisState: "needs-confirmation",
};

const detail = {
  clientId: 1,
  title: "Canonical differente dall’URL analizzato",
  sourceUrl: pageUrl,
  problemState: "Da confermare",
  evidence: [{ source: "Audit SeoGrow", detail: reviewItem.detail }],
};

test("il prefill di un review item canonical viene riconosciuto nell’ultimo audit", () => {
  const found = findProblemFinding({ url: "https://yogabuenaonda.it/", reviewItems: [reviewItem], issues: [] }, detail);
  assert.equal(found?.kind, "review");
  assert.equal(found?.item?.type, "canonical-different");
});

test("SEO Agent produce una diagnosi specifica invece di UNSUPPORTED_GOAL", () => {
  const run = buildProblemAgentRun({
    goal: "Analizza e aiutami a risolvere questo problema specifico: Canonical differente dall’URL analizzato.",
    detail,
    projectId: 1,
    analysis: {
      analyzedAt: "2026-09-14T10:19:54.000Z",
      url: "https://yogabuenaonda.it/",
      issues: [],
      reviewItems: [reviewItem],
    },
  });

  assert.equal(run.status, "COMPLETED");
  assert.equal(run.plan.workflow, "PROBLEM_DIAGNOSIS");
  assert.equal(run.recommendations.length, 1);
  assert.equal(run.recommendations[0].priority, "Da verificare");
  assert.match(run.recommendations[0].interpretation, /canonical diversa/i);
  assert.match(run.recommendations[0].recommendation, /Riesegui l’audit della singola URL/i);
  assert.deepEqual(run.approvalHistory, []);
  assert.equal(run.pendingApproval, null);
});

test("un review item senza evidenze sufficienti non viene dichiarato risolto", () => {
  const run = buildProblemAgentRun({
    goal: "Analizza questo problema specifico",
    detail: { clientId: 1, title: "Segnale sconosciuto", sourceUrl: "https://example.com/x" },
    analysis: { issues: [], reviewItems: [] },
    projectId: 1,
  });
  assert.equal(run.status, "PARTIAL");
  assert.equal(run.recommendations.length, 0);
  assert.match(run.errors[0], /Riesegui l’audit/i);
});

test("review-only canonical propone un nuovo audit, non una verifica di correzione inesistente", () => {
  const path = resolutionPath({
    issueType: "canonical-different",
    title: "Canonical differente dall’URL analizzato",
    sourceUrl: pageUrl,
    problemState: "needs_verification",
    interventionState: "not_prepared",
    correctability: "not_supported",
    reviewOnly: true,
  });
  assert.equal(path.action, "audit");
  assert.equal(path.label, "Verifica URL e indicizzazione");
  assert.match(path.instructions, /singola pagina/i);
});
