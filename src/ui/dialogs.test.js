import test from "node:test";
import assert from "node:assert/strict";
import { confirmAction, notifyUser } from "./dialogs.js";

test("dialog helpers fail closed without browser globals", () => {
  assert.equal(confirmAction("x"), false);
  assert.equal(notifyUser("x"), false);
});
