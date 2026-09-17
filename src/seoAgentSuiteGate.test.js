import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSeoGrowToolRegistry } from "./agentRuntime.js";
import { closuresFromAgentRuns } from "./problemClosureMigration.js";
import {
  AGENT_STATE_ROLE,
  REAL_AGENT_TOOLS,
  appendAgentLog,
  asAgentAnalysisLog,
  reconcileAgentLog,
  validateRealAgentCapabilities,
} from "./intelligence/agent/agentSuiteContract.js";

const page = "https://example.com/page/";

test("SEO Agent exposes only real registered read-only capabilities", () => {
  const registry = createSeoGrowToolRegistry();
  const capabilities = registry.capabilities();
  const gate = validateRealAgentCapabilities(capabilities);
  assert.equal(gate.ok, true);
  assert.deepEqual(capabilities.map((item) => item.name).toSorted(), [...REAL_AGENT_TOOLS].toSorted());
  assert.equal(capabilities.every((item) => item.mutatesData === false && item.permission === "READ"), true);
});

test("new Agent runs are non-authoritative analysis logs without pending approval state", () => {
  const run = asAgentAnalysisLog({ id: "agent-1", pendingApproval: { token: "legacy" }, approvalHistory: [{ approved: true }] });
  assert.equal(run.stateRole, AGENT_STATE_ROLE);
  assert.equal(run.pendingApproval, null);
  assert.deepEqual(run.approvalHistory, []);
});

test("analysis-log runs can never create canonical problem closures", () => {
  const run = asAgentAnalysisLog({
    id: "agent-1",
    completedAt: "2026-09-17T15:00:00Z",
    resolutionOutcome: { kind: "obsolete" },
    observations: [{ result: { data: { issueKey: "issue-1", issueType: "title", sourceUrl: page } } }],
  });
  const closures = closuresFromAgentRuns({ 1: [run] }, []);
  assert.deepEqual(closures, []);
});

test("Agent action log reconciles against canonical Task and Corrections state", () => {
  let run = asAgentAnalysisLog({ id: "agent-1" });
  run = appendAgentLog(run, { phase: "action", kind: "TASK_CREATED", label: "Task creata", targetType: "task", targetId: "task-1" });
  run = appendAgentLog(run, { phase: "action", kind: "CORRECTION_HANDOFF", label: "Handoff", targetType: "correction", problemKey: "problem-1" });
  const rows = reconcileAgentLog(run, {
    tasks: [{ id: "task-1", title: "Controlla title", status: "Completato" }],
    corrections: [{ id: "correction-1", issueKey: "problem-1", issueLabel: "Title", status: "Verificato", verifiedAt: "2026-09-17T15:10:00Z" }],
  });
  assert.equal(rows[0].canonical.type, "task");
  assert.equal(rows[0].canonical.status, "Completato");
  assert.equal(rows[1].canonical.type, "correction");
  assert.equal(rows[1].canonical.id, "correction-1");
  assert.equal(rows[1].canonical.status, "Verificato");
});

test("AgentPage separates analysis, proposal and action and performs canonical handoffs only", async () => {
  const source = await readFile(new URL("./AgentPage.jsx", import.meta.url), "utf8");
  assert.match(source, /1 · Analisi/);
  assert.match(source, /2 · Proposte/);
  assert.match(source, /3 · Azione/);
  assert.match(source, /TASK_CREATED/);
  assert.match(source, /CORRECTION_HANDOFF/);
  assert.match(source, /onCreateTask/);
  assert.match(source, /openProblemResolution/);
  assert.match(source, /remediationIndex/);
  assert.doesNotMatch(source, /writeWorkspaceJson/);
  assert.doesNotMatch(source, /retireObsoleteProblemTasks/);
  assert.doesNotMatch(source, /seogrow-problem-closures-v1/);
  assert.doesNotMatch(source, /resolveApproval/);
});
