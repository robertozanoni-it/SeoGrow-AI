import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./AgentPage.jsx", import.meta.url), "utf8");

test("Agent UI keeps a synchronous lock against double analysis starts", () => {
  assert.match(source, /useRef/);
  assert.match(source, /const operationLock = useRef\(false\)/);
  assert.match(source, /if \(!goal\.trim\(\) \|\| operationLock\.current\) return/);
  assert.match(source, /operationLock\.current = true/);
  assert.match(source, /finally \{ operationLock\.current = false; setRunning\(false\); \}/);
});

test("SEO Agent has no internal approval/write execution path", () => {
  assert.doesNotMatch(source, /resolveApproval/);
  assert.doesNotMatch(source, /pendingApproval/);
  assert.doesNotMatch(source, /decide\(/);
  assert.doesNotMatch(source, />Approva<\/button>/);
  assert.doesNotMatch(source, />Rifiuta<\/button>/);
  assert.match(source, /mode: AgentMode\.READ_ONLY/);
});

test("unsupported modes remain visible but unavailable and actions lock while running", () => {
  assert.match(source, /id="seo-agent-mode"[^>]*disabled=\{running\}/);
  assert.match(source, /value=\{AgentMode\.ASSISTED\} disabled/);
  assert.match(source, /value=\{AgentMode\.AUTONOMOUS\} disabled/);
  assert.match(source, /id="seo-agent-goal"[^>]*disabled=\{running\}/);
  assert.match(source, /id="agent-history"[^>]*disabled=\{running\}/);
  assert.match(source, /disabled=\{running \|\| !goal\.trim\(\)\}/);
  assert.match(source, /<button className="secondary" onClick=\{\(\) => orchestrator.cancel\(run.id\)\}>Interrompi<\/button>/);
});
