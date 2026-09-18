import test from "node:test";
import assert from "node:assert/strict";
import { AUTOMATION_GRAPH, automationExecutionPlan, validateAutomationGraph } from "./automationOrchestrator.js";

test("Automation Orchestrator graph is acyclic and complete", () => {
  assert.deepEqual(validateAutomationGraph(AUTOMATION_GRAPH), { ok: true, errors: [] });
});

test("orchestrator orders dependencies and opens circuit after a failed automation", () => {
  const plan = automationExecutionPlan({ requested: ["guardian", "integration-health", "auto-remediation"], failures: ["integration-health"] });
  assert.deepEqual(plan.steps.map((item) => item.id), ["guardian", "integration-health", "auto-remediation"]);
  assert.equal(plan.steps[1].state, "circuit_open");
  assert.equal(plan.steps[2].state, "blocked");
  assert.equal(plan.circuitOpen, true);
});

test("orchestrator never silently exceeds its step bound", () => {
  const plan = automationExecutionPlan({ maxSteps: 2 });
  assert.equal(plan.steps.length, 2);
  assert.ok(plan.unresolved.length > 0);
  assert.equal(plan.safeToRun, false);
});
