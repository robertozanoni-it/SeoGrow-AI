import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MANUAL_MASTER_QA_CHECKS, summarizeMasterQa } from "./masterQaHarness.js";

const source = await readFile(new URL("./masterQaHarness.js", import.meta.url), "utf8");
const main = await readFile(new URL("./main.jsx", import.meta.url), "utf8");

test("master QA summary never hides failures and preserves manual gaps", () => {
  assert.equal(summarizeMasterQa([{ status: "PASS" }, { status: "MANUAL" }]).overall, "PASS_PARZIALE");
  assert.equal(summarizeMasterQa([{ status: "PASS" }, { status: "FAIL" }]).overall, "FAIL");
  assert.ok(MANUAL_MASTER_QA_CHECKS.some((item) => /Elementor save\/render\/cache/.test(item)));
  assert.ok(MANUAL_MASTER_QA_CHECKS.some((item) => /zoom 200%/.test(item)));
});

test("master QA is dev-only, opt-in and does not perform live WordPress writes", () => {
  assert.match(main, /params\.get\("qaMaster"\) !== "1"/);
  assert.match(main, /installMasterQaPanel/);
  assert.match(source, /\/api\/wordpress\/qa-master-delay/);
  assert.doesNotMatch(source, /\/api\/wordpress\/live-apply/);
  assert.doesNotMatch(source, /\/api\/wordpress\/live-rollback/);
  assert.doesNotMatch(source, /\/seogrow\/v1\/atomic-write/);
});

test("master QA restores selected client after cancellation probe", () => {
  assert.match(source, /const originalSelected = workspaceStorage\.getItem\(SELECTED_CLIENT_KEY\)/);
  assert.match(source, /workspaceStorage\.setItem\(SELECTED_CLIENT_KEY, originalSelected\)/);
  assert.match(source, /await flushWorkspace\(\)/);
});
