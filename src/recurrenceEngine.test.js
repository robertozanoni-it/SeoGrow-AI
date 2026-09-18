import test from "node:test";
import assert from "node:assert/strict";
import { canonicalLifecycleKey, classifyRecurrence, RECURRENCE_KIND } from "./guardian/recurrenceEngine.js";

test("same client and fingerprint produce one canonical lifecycle key", () => {
  assert.equal(canonicalLifecycleKey(7, "audit:title:/a"), canonicalLifecycleKey(7, "audit:title:/a"));
  assert.notEqual(canonicalLifecycleKey(7, "audit:title:/a"), canonicalLifecycleKey(8, "audit:title:/a"));
});

test("existing unresolved problem is persistent, not new", () => {
  const result = classifyRecurrence({
    observation: { fingerprint: "x" },
    history: [{ fingerprint: "x", state: "open", at: "2026-09-18T10:00:00Z" }],
  });
  assert.equal(result.kind, RECURRENCE_KIND.PERSISTENT);
});

test("verified closure followed by fresh detection is recurrent", () => {
  const result = classifyRecurrence({
    observation: { fingerprint: "x" },
    history: [{ fingerprint: "x", state: "resolved", verified: true, resolvedAt: "2026-09-18T10:00:00Z" }],
  });
  assert.equal(result.kind, RECURRENCE_KIND.RECURRENT);
});

test("post-closure change followed by detection is regression and suspends AutoFix", () => {
  const result = classifyRecurrence({
    observation: { fingerprint: "x", changedAt: "2026-09-18T11:00:00Z" },
    history: [{ fingerprint: "x", state: "resolved", verified: true, resolvedAt: "2026-09-18T10:00:00Z" }],
  });
  assert.equal(result.kind, RECURRENCE_KIND.REGRESSION);
  assert.equal(result.autoFixAllowed, false);
});

test("repeated open/closed oscillation is flapping and suspends AutoFix", () => {
  const history = ["open", "resolved", "reappeared", "resolved", "reappeared"].map((state, i) => ({
    fingerprint: "x", state, verified: state === "resolved", at: `2026-09-18T1${i}:00:00Z`,
  }));
  const result = classifyRecurrence({ observation: { fingerprint: "x" }, history });
  assert.equal(result.kind, RECURRENCE_KIND.FLAPPING);
  assert.equal(result.autoFixAllowed, false);
});
