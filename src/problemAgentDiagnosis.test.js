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

test("review-only canonical richiede intent esplicito prima di preparare la soluzione", () => {
  const path = resolutionPath({
    issueType: "canonical-different",
    title: "Canonical differente dall’URL analizzato",
    sourceUrl: pageUrl,
    problemState: "needs_verification",
    interventionState: "not_prepared",
    correctability: "not_supported",
    reviewOnly: true,
  });
  assert.equal(path.action, "confirm");
  assert.equal(path.label, "Verifica e prepara soluzione");
  assert.match(path.instructions, /Conferma/i);
  assert.match(path.instructions, /Prima\/Dopo/i);
});

test("un problema con URL ma senza finding corrente richiede audit fresco", async () => {
  const { problemNeedsFreshAudit } = await import("./problemAgentDiagnosis.js");
  assert.equal(problemNeedsFreshAudit({ issues: [] }, { sourceUrl: "https://example.com/page", title: "Finding vecchio" }), true);
  assert.equal(problemNeedsFreshAudit({ issues: [{ label: "Finding vecchio", url: "https://example.com/page" }] }, { sourceUrl: "https://example.com/page", title: "Finding vecchio" }), false);
});

test("finding obsoleto chiude e archivia la task sorgente del progetto", async () => {
  const { retireObsoleteProblemTasks } = await import("./problemAgentDiagnosis.js");
  const tasks = [
    { id: "a", sourceClientId: 7, kind: "batch-assisted", title: "Intervento SEO: Ottimizza buenaonda", sourceUrl: "https://example.com/", status: "Da fare" },
    { id: "b", sourceClientId: 8, kind: "batch-assisted", title: "Intervento SEO: Ottimizza buenaonda", sourceUrl: "https://example.com/", status: "Da fare" },
  ];
  const result = retireObsoleteProblemTasks(tasks, { title: "Ottimizza buenaonda", sourceUrl: "https://example.com/" }, 7, "2026-09-16T12:00:00.000Z");
  assert.equal(result.changed, true);
  assert.equal(result.tasks[0].status, "Completato");
  assert.equal(result.tasks[0].stale, true);
  assert.equal(result.tasks[0].excludedFromSeo, true);
  assert.equal(result.tasks[1].status, "Da fare");
});

test("non associa due canonical dello stesso tipo su URL diverse", () => {
  const analysis={issues:[
    {type:"canonical",label:"Canonical differente dall’URL analizzato",url:"https://example.com/a"},
    {type:"canonical",label:"Canonical differente dall’URL analizzato",url:"https://example.com/b"},
  ]};
  const found=findProblemFinding(analysis,{issueType:"canonical",title:"Canonical differente dall’URL analizzato",sourceUrl:"https://example.com/b"});
  assert.equal(found.item.url,"https://example.com/b");
  assert.equal(findProblemFinding(analysis,{issueType:"canonical",title:"Canonical differente dall’URL analizzato",sourceUrl:"https://example.com/c"}),null);
});
