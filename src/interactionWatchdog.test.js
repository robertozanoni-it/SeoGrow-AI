import test from "node:test";
import assert from "node:assert/strict";
import { classifyProblemSignal } from "./guardian/problemDetectionEngine.js";
import { shouldWatchAction } from "./guardian/interactionWatchdog.js";

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


const fakeElement = ({ disabled = false, attrs = {}, matches = false, optOut = false } = {}) => ({
  disabled,
  getAttribute: (name) => attrs[name] ?? null,
  matches: () => matches,
  closest: (selector) => selector === "[data-guardian-watch='off']" && optOut ? {} : null,
});

test("watchdog excludes disabled, external/download and explicit opt-out actions", () => {
  assert.equal(shouldWatchAction(fakeElement({ disabled: true })), false);
  assert.equal(shouldWatchAction(fakeElement({ matches: true })), false);
  assert.equal(shouldWatchAction(fakeElement({ optOut: true })), false);
});

test("watchdog accepts ordinary internal actions", () => {
  assert.equal(shouldWatchAction(fakeElement()), true);
});
