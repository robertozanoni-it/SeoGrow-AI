import test from "node:test";
import assert from "node:assert/strict";
import { decideResolutionPath, RESOLUTION_PATH } from "./guardian/resolutionDecisionEngine.js";

test("L2 requires all three safety predicates: adapter, reversibility, confidence", () => {
  const base = { diagnosis: { diagnosisId: "known", confidence: "high" }, correctability: "automatic" };
  assert.notEqual(decideResolutionPath({ ...base, hasSafeAdapter: false, reversible: true }).path, RESOLUTION_PATH.SAFE_AUTOFIX);
  assert.notEqual(decideResolutionPath({ ...base, hasSafeAdapter: true, reversible: false }).path, RESOLUTION_PATH.SAFE_AUTOFIX);
  assert.equal(decideResolutionPath({ ...base, hasSafeAdapter: true, reversible: true }).path, RESOLUTION_PATH.SAFE_AUTOFIX);
});

test("L3 is preparation only and never executable by decision engine", () => {
  const result = decideResolutionPath({
    diagnosis: { diagnosisId: "known", confidence: "high" },
    correctability: "assisted", hasPreviewAdapter: true,
  });
  assert.equal(result.path, RESOLUTION_PATH.APPROVAL);
  assert.equal(result.canExecute, false);
});
