import test from "node:test";
import assert from "node:assert/strict";
import { closureTransition, evaluatePostFixVerification } from "./guardian/verificationClosureEngine.js";

test("verified closure is idempotent when replayed", () => {
  const verification = evaluatePostFixVerification({
    incident: { fingerprint: "audit:1:x" },
    correction: { state: "applied", appliedAt: "2026-09-18T20:00:00Z" },
    evidenceAfter: { issueAbsent: true },
    recheck: { ok: true, problemPresent: false, fingerprint: "audit:1:x", at: "2026-09-18T20:05:00Z" },
  });
  const first = closureTransition({ problemState: "open", verification });
  const replay = closureTransition({ problemState: first.to, verification });
  assert.equal(first.to, "resolved");
  assert.equal(replay.to, "resolved");
  assert.equal(replay.verified, true);
});

test("resolved problem without fresh proof cannot remain verified by assumption", () => {
  const inconclusive = evaluatePostFixVerification({
    incident: { fingerprint: "audit:1:x" },
    correction: { state: "applied", appliedAt: "2026-09-18T20:00:00Z" },
    evidenceAfter: null,
    recheck: {},
  });
  const transition = closureTransition({ problemState: "resolved", verification: inconclusive });
  assert.equal(transition.to, "needs_verification");
  assert.equal(transition.verified, false);
});
