import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MANUAL_MASTER_QA_CHECKS, summarizeMasterQa } from "./masterQaHarness.js";

const source = await readFile(new URL("./masterQaHarness.js", import.meta.url), "utf8");
const v2 = await readFile(new URL("./masterQaHarnessV2.js", import.meta.url), "utf8");
const checksV2 = await readFile(new URL("./masterQaV2Checks.js", import.meta.url), "utf8");
const agentAdversarial = await readFile(new URL("./agentAdversarialQa.js", import.meta.url), "utf8");
const agentPage = await readFile(new URL("./AgentPage.jsx", import.meta.url), "utf8");
const main = await readFile(new URL("./main.jsx", import.meta.url), "utf8");

test("master QA summary never hides failures and preserves manual gaps", () => {
  assert.equal(summarizeMasterQa([{ status: "PASS" }, { status: "MANUAL" }]).overall, "PASS_PARZIALE");
  assert.equal(summarizeMasterQa([{ status: "PASS" }, { status: "FAIL" }]).overall, "FAIL");
  assert.ok(MANUAL_MASTER_QA_CHECKS.some((item) => /Elementor save\/render\/cache/.test(item)));
  assert.ok(MANUAL_MASTER_QA_CHECKS.some((item) => /zoom 200%/.test(item)));
});

test("master QA v3 is dev-only, opt-in and does not perform live WordPress writes", () => {
  assert.match(main, /params\.get\("qaMaster"\) !== "1"/);
  assert.match(main, /installMasterQaV2Panel/);
  assert.match(v2, /runMasterQaV2Checks/);
  assert.match(v2, /checkAgentAdversarialRuntime/);
  assert.match(v2, /version: 3/);
  assert.match(checksV2, /Audit → Task/);
  assert.match(checksV2, /Storico Agent/);
  assert.match(checksV2, /Search Console \/ provenance/);
  assert.match(checksV2, /Stati correzioni/);
  assert.match(agentAdversarial, /APPROVAL_CONTEXT_MISMATCH/);
  assert.match(agentAdversarial, /AgentStatus\.CANCELLED/);
  const allQaSource = `${source}\n${v2}\n${checksV2}\n${agentAdversarial}`;
  assert.match(allQaSource, /\/api\/wordpress\/qa-master-delay/);
  assert.doesNotMatch(allQaSource, /\/api\/wordpress\/live-apply/);
  assert.doesNotMatch(allQaSource, /\/api\/wordpress\/live-rollback/);
  assert.doesNotMatch(allQaSource, /\/seogrow\/v1\/atomic-write/);
});

test("master QA restores selected client after cancellation probe", () => {
  assert.match(source, /const originalSelected = workspaceStorage\.getItem\(SELECTED_CLIENT_KEY\)/);
  assert.match(source, /workspaceStorage\.setItem\(SELECTED_CLIENT_KEY, originalSelected\)/);
  assert.match(source, /await flushWorkspace\(\)/);
});

test("Agent UI keeps double-start guard while runtime adversarial checks cover cancel and stale approval", () => {
  assert.match(agentPage, /if \(!goal\.trim\(\) \|\| running\) return/);
  assert.match(agentPage, /disabled=\{running \|\| !goal\.trim\(\)\}/);
  assert.ok(MANUAL_MASTER_QA_CHECKS.some((item) => /Agent doppio avvio UI\/disabled-state/.test(item)));
});

test("master QA v3 preserves manual-only environmental gaps", () => {
  assert.match(v2, /status: "MANUAL"/);
  assert.match(v2, /MANUAL_MASTER_QA_CHECKS/);
  assert.doesNotMatch(checksV2, /fetch\(/);
  assert.doesNotMatch(agentAdversarial, /apiFetch|fetch\(/);
});
