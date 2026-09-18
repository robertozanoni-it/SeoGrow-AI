import test from "node:test";
import assert from "node:assert/strict";
import { decideResolutionPath, RESOLUTION_PATH } from "./guardian/resolutionDecisionEngine.js";

for (const kind of ["regression", "flapping"]) {
  test(`${kind} lifecycle cannot enter L2 even with a safe reversible adapter`, () => {
    const result = decideResolutionPath({
      diagnosis: { diagnosisId: "known", confidence: "high" },
      correctability: "automatic",
      hasSafeAdapter: true,
      reversible: true,
      recurrence: { kind, autoFixAllowed: false, reason: `${kind} requires root-cause review` },
    });
    assert.equal(result.path, RESOLUTION_PATH.MANUAL);
    assert.equal(result.canExecute, false);
  });
}
