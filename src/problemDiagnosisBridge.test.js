import test from "node:test";
import assert from "node:assert/strict";
import { diagnosisForProblem } from "./problemDiagnosisBridge.js";
import { auditIssueFingerprint } from "./auditProblemDetectionBridge.js";

test("Problems drawer receives diagnosis only from exact canonical Audit fingerprint", () => {
  const problem = { issueType: "h1", title: "H1 mancante", sourceUrl: "https://example.com/a" };
  const fingerprint = auditIssueFingerprint({ clientId: 7, issue: { type: "h1", label: "H1 mancante", sourceUrl: "https://example.com/a" } });
  const diagnosis = { cause: "Causa test", confidence: "high", evidence: ["x"] };
  assert.deepEqual(diagnosisForProblem(problem, 7, [{ fingerprint, diagnosis, source: "audit" }]), diagnosis);
});

test("same problem on another client cannot inherit diagnosis", () => {
  const problem = { issueType: "title", title: "Title duplicato", sourceUrl: "https://example.com/a" };
  const fingerprint = auditIssueFingerprint({ clientId: 1, issue: { type: "title", label: "Title duplicato", sourceUrl: "https://example.com/a" } });
  assert.equal(diagnosisForProblem(problem, 2, [{ fingerprint, diagnosis: { cause: "wrong" }, source: "audit" }]), null);
});

test("ambiguous fallback does not expose a diagnosis", () => {
  const problem = { issueType: "h1", title: "H1", sourceUrl: "https://example.com/a" };
  const incidents = [1, 2].map((n) => ({
    fingerprint: `legacy-${n}`, source: "audit", code: "AUDIT_H1",
    detail: "https://example.com/a", diagnosis: { cause: `cause-${n}` },
  }));
  assert.equal(diagnosisForProblem(problem, 3, incidents), null);
});
