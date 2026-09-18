import test from "node:test";
import assert from "node:assert/strict";
import { closureTransition, evaluatePostFixVerification, VERIFICATION_STATE } from "./guardian/verificationClosureEngine.js";

test("applied correction alone can never close a problem", () => {
  const result = evaluatePostFixVerification({ correction: { state: "applied", appliedAt: "2026-09-18T20:00:00Z" } });
  assert.equal(result.canClose, false);
  assert.equal(result.state, VERIFICATION_STATE.INCONCLUSIVE);
});

test("verified absence of same canonical problem allows closure", () => {
  const result = evaluatePostFixVerification({
    incident: { fingerprint: "audit:1:h1" },
    correction: { state: "applied", appliedAt: "2026-09-18T20:00:00Z" },
    evidenceBefore: "H1 missing",
    evidenceAfter: "H1 present",
    recheck: { ok: true, problemPresent: false, fingerprint: "audit:1:h1", source: "audit-page", at: "2026-09-18T20:05:00Z" },
  });
  assert.equal(result.canClose, true);
  assert.equal(closureTransition({ problemState: "open", verification: result }).to, "resolved");
});

test("failed post-fix check reopens instead of closing", () => {
  const verification = evaluatePostFixVerification({
    correction: { state: "verified" },
    evidenceAfter: "still broken",
    recheck: { ok: false, problemPresent: true },
  });
  assert.equal(verification.state, VERIFICATION_STATE.FAILED);
  assert.equal(closureTransition({ problemState: "needs_verification", verification }).to, "reappeared");
});

test("mismatched fingerprint is inconclusive", () => {
  const result = evaluatePostFixVerification({
    incident: { fingerprint: "a" },
    correction: { state: "applied", appliedAt: "x" },
    evidenceAfter: "ok",
    recheck: { ok: true, problemPresent: false, fingerprint: "b" },
  });
  assert.equal(result.canClose, false);
  assert.equal(result.state, VERIFICATION_STATE.INCONCLUSIVE);
});
