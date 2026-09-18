import test from "node:test";
import assert from "node:assert/strict";
import { classifyProblemSignal, detectProblemSignals } from "./guardian/problemDetectionEngine.js";

test("rejects signals without a stable fingerprint", () => {
  assert.equal(classifyProblemSignal({ severity: "error" }).accepted, false);
});

test("reappearance after a verified resolution requires root-cause review and disables autofix", () => {
  const now = Date.parse("2026-09-18T19:00:00Z");
  const result = classifyProblemSignal({
    fingerprint: "persist:issue-1", severity: "warning", autoFixEligible: true,
  }, [{
    fingerprint: "persist:issue-1", state: "resolved", occurrences: 1,
    lastSeenAt: "2026-09-18T18:00:00Z",
  }], now);
  assert.equal(result.repeatedAfterResolution, true);
  assert.equal(result.rootCauseReviewRequired, true);
  assert.equal(result.autoFixAllowed, false);
  assert.equal(result.severity, "error");
});

test("fifth occurrence escalates and stops automatic repair", () => {
  const result = classifyProblemSignal({
    fingerprint: "loop:x", severity: "warning", autoFixEligible: true,
  }, [{ fingerprint: "loop:x", state: "open", occurrences: 4, lastSeenAt: new Date().toISOString() }]);
  assert.equal(result.occurrences, 5);
  assert.equal(result.rootCauseReviewRequired, true);
  assert.equal(result.autoFixAllowed, false);
});

test("detector normalizes signal families without inventing findings", () => {
  const rows = detectProblemSignals({
    runtimeErrors: [{ fingerprint: "r1" }],
    failedActions: [{ fingerprint: "a1" }],
    persistenceErrors: [{ fingerprint: "p1" }],
    integrationFailures: [{ fingerprint: "i1" }],
  });
  assert.deepEqual(rows.map((row) => row.family), ["runtime", "interaction", "persistence", "integration"]);
});
