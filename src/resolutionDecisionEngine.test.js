import test from "node:test";
import assert from "node:assert/strict";
import { decideResolutionPath, RESOLUTION_PATH } from "./guardian/resolutionDecisionEngine.js";

test("unknown diagnosis stays in evidence gathering", () => {
  const result = decideResolutionPath({ diagnosis: { diagnosisId: "unknown", confidence: "low" } });
  assert.equal(result.path, RESOLUTION_PATH.DIAGNOSE);
  assert.equal(result.canExecute, false);
});

test("safe reversible automatic adapter can enter L2", () => {
  const result = decideResolutionPath({
    diagnosis: { diagnosisId: "ui-no-effect", confidence: "medium", recurrence: 1 },
    correctability: "automatic", hasSafeAdapter: true, reversible: true,
  });
  assert.equal(result.path, RESOLUTION_PATH.SAFE_AUTOFIX);
  assert.equal(result.canExecute, true);
});

test("previewable mutation stays L3 and never auto executes", () => {
  const result = decideResolutionPath({
    diagnosis: { diagnosisId: "audit-recurrence", confidence: "medium", recurrence: 1 },
    correctability: "assisted", hasPreviewAdapter: true,
  });
  assert.equal(result.path, RESOLUTION_PATH.APPROVAL);
  assert.equal(result.canExecute, false);
});

test("fifth recurrence forces manual root-cause review", () => {
  const result = decideResolutionPath({
    incident: { occurrences: 5 },
    diagnosis: { diagnosisId: "audit-recurrence", confidence: "high", recurrence: 5 },
    correctability: "automatic", hasSafeAdapter: true, reversible: true,
  });
  assert.equal(result.path, RESOLUTION_PATH.MANUAL);
  assert.equal(result.canExecute, false);
});
