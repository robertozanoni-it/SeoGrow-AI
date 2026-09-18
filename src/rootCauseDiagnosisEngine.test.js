import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseRootCause } from "./guardian/rootCauseDiagnosisEngine.js";

test("recurring persistence incident gets high-confidence reconciliation diagnosis", () => {
  const incident = { fingerprint: "x", code: "WORKSPACE_WRITE_FAILED", source: "workspace", occurrences: 3 };
  const result = diagnoseRootCause(incident, []);
  assert.equal(result.diagnosisId, "persistence-reconciliation");
  assert.equal(result.confidence, "high");
});

test("reappearance after resolution forces human root-cause review", () => {
  const incident = { fingerprint: "audit:x", code: "AUDIT_H1", source: "audit", occurrences: 1 };
  const result = diagnoseRootCause(incident, [{ fingerprint: "audit:x", state: "resolved", occurrences: 1 }]);
  assert.equal(result.confidence, "high");
  assert.equal(result.requiresHumanReview, true);
});

test("unknown incident never invents a confident diagnosis", () => {
  const result = diagnoseRootCause({ fingerprint: "z", code: "NEW_UNKNOWN", source: "other" }, []);
  assert.equal(result.diagnosisId, "unknown");
  assert.equal(result.confidence, "low");
  assert.equal(result.requiresHumanReview, true);
});
