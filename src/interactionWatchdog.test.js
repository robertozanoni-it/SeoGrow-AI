import test from "node:test";
import assert from "node:assert/strict";
import { classifyProblemSignal } from "./guardian/problemDetectionEngine.js";

test("UI no-effect recurrence escalates instead of creating endless safe fixes", () => {
  const fingerprint = "UI_ACTION_NO_EFFECT:interaction-watchdog:abc";
  const result = classifyProblemSignal({
    fingerprint,
    severity: "warning",
    autoFixEligible: false,
  }, [{
    fingerprint,
    state: "resolved",
    occurrences: 2,
    lastSeenAt: new Date().toISOString(),
  }]);
  assert.equal(result.repeatedAfterResolution, true);
  assert.equal(result.rootCauseReviewRequired, true);
  assert.equal(result.autoFixAllowed, false);
  assert.equal(result.severity, "error");
});
