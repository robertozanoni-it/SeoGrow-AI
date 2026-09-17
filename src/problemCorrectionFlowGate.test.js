import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildUnifiedProblems } from "./problemsModel.js";
import { problemEntryLabel } from "./resolutionPath.js";
import { problemResolutionPriority } from "./problemResolutionPriority.js";
import { canonicalProblemClosures } from "./core/workspace/projectState.js";
import { writeWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { closuresFromAgentRuns } from "./problemClosureMigration.js";
import { isPermanentProblemClosure, problemClosureIdentity } from "./problemDisposition.js";

const clientId = 91;
const sourceUrl = "https://example.com/pagina/";
const issue = { type: "title", label: "Title mancante", severity: "alta", sourceUrl, detail: "Il title non è presente." };
const laterAudit = { url: "https://example.com/", analyzedAt: "2026-09-17T10:00:00.000Z", pages: [{ url: sourceUrl, ok: true }], issues: [issue] };
const normalClosure = { clientId, issueType: "title", sourceUrl, targetUrl: "", closedAt: "2026-09-17T09:00:00.000Z", reason: "verified-not-present" };
const permanentClosure = { ...normalClosure, closedAt: "2026-09-17T08:00:00.000Z", reason: "user-do-not-modify", disposition: "do_not_modify", permanent: true };

const modelWith = (closures) => buildUnifiedProblems({ clientId, siteHistory: [laterAudit], closures, now: Date.parse("2026-09-17T11:00:00.000Z") });

test("chiusura normale può riapparire solo con una rilevazione audit più recente", () => {
  const model = modelWith([normalClosure]);
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0].problemState, "reappeared");
  assert.equal(model.activeRows.length, 1);
});

test("Non modificare resta escluso anche dopo un audit più recente", () => {
  const model = modelWith([permanentClosure]);
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0].problemState, "intentional");
  assert.equal(model.rows[0].disposition, "do_not_modify");
  assert.equal(model.activeRows.length, 0);
});

test("canonicalizzazione, migrazione e scrittura non possono sovrascrivere Non modificare", () => {
  const newerNormal = { ...normalClosure, closedAt: "2026-09-17T12:00:00.000Z" };
  const canonical = canonicalProblemClosures([newerNormal, permanentClosure]);
  assert.equal(canonical.length, 1);
  assert.equal(isPermanentProblemClosure(canonical[0]), true);
  const migrated = closuresFromAgentRuns({
    [clientId]: [{ id: "agent-new", startedAt: "2026-09-17T13:00:00.000Z", completedAt: "2026-09-17T13:01:00.000Z", resolutionOutcome: { kind: "obsolete" }, observations: [{ result: { data: { issueType: "title", sourceUrl } } }] }],
  }, canonical);
  assert.equal(migrated.length, 1);
  assert.equal(isPermanentProblemClosure(migrated[0]), true);

  const values = new Map([[WORKSPACE_KEYS.problemClosures, JSON.stringify(canonical)]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  writeWorkspaceJson(WORKSPACE_KEYS.problemClosures, [newerNormal], storage);
  const stored = JSON.parse(storage.getItem(WORKSPACE_KEYS.problemClosures));
  assert.equal(stored.length, 1);
  assert.equal(isPermanentProblemClosure(stored[0]), true);
});

test("identità Non modificare è scoped per problema e target", () => {
  assert.deepEqual(problemClosureIdentity({ key: "issue-key", issueType: "title", sourceUrl }, clientId), {
    clientId,
    issueKey: "issue-key",
    issueType: "title",
    sourceUrl: "https://example.com/pagina",
    targetUrl: "",
  });
});

test("CTA principali usano solo la tassonomia richiesta", () => {
  const automatic = { issueType: "title", title: "Title mancante", sourceUrl, problemState: "open", interventionState: "not_prepared", correctability: "automatic", stale: false };
  assert.equal(problemEntryLabel(automatic), "Correggi automaticamente");
  assert.equal(problemResolutionPriority(automatic).label, "Correggi automaticamente");

  const approval = { issueType: "description", title: "Meta description da confermare", sourceUrl, problemState: "needs_verification", interventionState: "not_prepared", correctability: "not_supported", reviewOnly: true, stale: false };
  assert.equal(problemEntryLabel(approval), "Prepara correzione");
  assert.equal(problemResolutionPriority(approval).label, "Prepara correzione");

  const manual = { issueType: "image", title: "Alt immagine mancante", sourceUrl, problemState: "open", interventionState: "not_prepared", correctability: "manual", stale: false };
  assert.equal(problemEntryLabel(manual), "Richiede intervento manuale");
  assert.equal(problemResolutionPriority(manual).label, "Richiede intervento manuale");

  assert.equal(problemEntryLabel({ ...automatic, stale: true }), "Aggiorna audit");
});

test("pagina Problema → Correzione espone i quattro passaggi e usa le closures", async () => {
  const [page, nav, list] = await Promise.all([
    readFile(new URL("./ProblemResolutionPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("./AutomaticProposalNavigation.js", import.meta.url), "utf8"),
    readFile(new URL("./ProblemsWorkspace.jsx", import.meta.url), "utf8"),
  ]);
  for (const heading of [">Problema<", ">Spiegazione<", ">Prima / Dopo<", ">Soluzione<"]) assert.match(page, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(page, /excludeProblemPermanently/);
  assert.match(page, /PROBLEM_CLOSURES_KEY/);
  assert.match(page, /buildUnifiedProblems\([\s\S]*closures/);
  assert.match(page, /> Non modificare</);
  assert.match(nav, /sessionStorage\.setItem\(RESOLUTION_FOCUS_KEY/);
  assert.match(nav, /seogrow-problem-resolution-open/);
  assert.doesNotMatch(list, />Risolvi automaticamente</);
  assert.match(list, /entryLabel === "Correggi automaticamente"/);
  assert.match(list, /activeRows\.length/);
});
