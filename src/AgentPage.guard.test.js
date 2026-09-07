import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./AgentPage.jsx", import.meta.url), "utf8");

test("Agent UI uses a synchronous ref lock against double start/approval races", () => {
  assert.match(source, /useRef/);
  assert.match(source, /const operationLock = useRef\(false\)/);
  assert.match(source, /if \(!goal\.trim\(\) \|\| operationLock\.current\) return/);
  assert.match(source, /operationLock\.current = true/);
  assert.match(source, /finally \{ operationLock\.current = false; setRunning\(false\); \}/);
  assert.match(source, /if \(!run\?\.pendingApproval \|\| operationLock\.current\) return/);
});

test("Agent primary actions remain disabled while the visible running state is active", () => {
  assert.match(source, /disabled=\{running \|\| !goal\.trim\(\)\}/);
  assert.match(source, /disabled=\{running\} onClick=\{\(\) => decide\(true\)\}/);
  assert.match(source, /disabled=\{running\} onClick=\{\(\) => decide\(false\)\}/);
});
