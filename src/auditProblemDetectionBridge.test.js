import test from "node:test";
import assert from "node:assert/strict";
import { auditIssueFingerprint, auditIssueSignal, auditSignals } from "./auditProblemDetectionBridge.js";

test("same Audit issue on same client gets a stable fingerprint", () => {
  const issue = { type: "h1", label: "H1 mancante", sourceUrl: "https://example.com/pagina" };
  assert.equal(
    auditIssueFingerprint({ clientId: 7, issue }),
    auditIssueFingerprint({ clientId: 7, issue: { ...issue } }),
  );
});

test("same issue on different clients stays isolated", () => {
  const issue = { type: "title", label: "Title duplicato", sourceUrl: "https://example.com/a" };
  assert.notEqual(auditIssueFingerprint({ clientId: 1, issue }), auditIssueFingerprint({ clientId: 2, issue }));
});

test("bridge emits one signal for every canonical Audit issue", () => {
  const signals = auditSignals({ clientId: 3, analysis: { issues: [
    { type: "h1", label: "H1", sourceUrl: "https://x.test/a" },
    { type: "title", label: "Title", sourceUrl: "https://x.test/b", autoFixEligible: true },
  ] } });
  assert.equal(signals.length, 2);
  assert.equal(signals[1].autoFixEligible, true);
  assert.equal(signals[0].source, "audit");
});
