import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspaceRestoreCrashInterrupt,
  shouldArmWorkspaceRestoreCrashHarness,
} from "./workspaceCrashHarness.js";

test("crash harness is fail-closed outside dev", () => {
  assert.equal(shouldArmWorkspaceRestoreCrashHarness({ isDev: false, search: "?qaWorkspaceRestoreCrash=1" }), false);
  assert.equal(createWorkspaceRestoreCrashInterrupt({ isDev: false, search: "?qaWorkspaceRestoreCrash=1" }), undefined);
});

test("crash harness requires explicit query flag", () => {
  assert.equal(shouldArmWorkspaceRestoreCrashHarness({ isDev: true, search: "" }), false);
  assert.equal(shouldArmWorkspaceRestoreCrashHarness({ isDev: true, search: "?qaWorkspaceRestoreCrash=1" }), true);
});

test("closing checkpoint normally always aborts transaction", () => {
  let aborted = 0;
  const interrupt = createWorkspaceRestoreCrashInterrupt({
    isDev: true,
    search: "?qaWorkspaceRestoreCrash=1",
    confirmFn: () => true,
  });
  interrupt({ abort: () => { aborted += 1; } });
  assert.equal(aborted, 1);
});
