import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_REMEDIATION_DECISION, autoRemediationDecision, buildAutoRemediationPlan } from "./autoRemediationPolicy.js";

const problem = (patch = {}) => ({
  key: "p1", issueType: "title-missing", title: "Title mancante", sourceUrl: "https://example.com/page/",
  correctability: "automatic", problemState: "open", interventionState: "not_prepared", pageKind: "page", ownershipBlocked: false,
  ...patch,
});

test("Auto-Remediation auto-runs only standard direct reversible candidates", () => {
  assert.equal(autoRemediationDecision(problem()).decision, AUTO_REMEDIATION_DECISION.AUTO);
  assert.equal(autoRemediationDecision(problem({ issueType: "canonical-different" })).decision, AUTO_REMEDIATION_DECISION.APPROVAL);
  assert.equal(autoRemediationDecision(problem({ issueType: "h1-multiple" })).decision, AUTO_REMEDIATION_DECISION.APPROVAL);
  assert.equal(autoRemediationDecision(problem({ ownershipBlocked: true })).decision, AUTO_REMEDIATION_DECISION.ASSISTED);
  assert.equal(autoRemediationDecision(problem({ correctability: "manual" })).decision, AUTO_REMEDIATION_DECISION.ASSISTED);
  assert.equal(autoRemediationDecision(problem({ problemState: "resolved" })).decision, AUTO_REMEDIATION_DECISION.SKIP);
});

test("mixed problems are partitioned without promoting approval/manual work to automatic writes", () => {
  const plan = buildAutoRemediationPlan([
    problem({ key: "safe" }),
    problem({ key: "high", issueType: "canonical-different" }),
    problem({ key: "manual", correctability: "manual" }),
    problem({ key: "done", problemState: "resolved" }),
  ]);
  assert.deepEqual(plan.automatic.map((entry) => entry.problem.key), ["safe"]);
  assert.deepEqual(plan.approvalRequired.map((entry) => entry.problem.key), ["high"]);
  assert.deepEqual(plan.assisted.map((entry) => entry.problem.key), ["manual"]);
  assert.deepEqual(plan.skipped.map((entry) => entry.problem.key), ["done"]);
});
