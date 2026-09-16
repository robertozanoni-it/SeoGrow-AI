import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../scripts/browser-smoke.mjs", import.meta.url), "utf8");
const workspace = await readFile(new URL("./workspaceDatabase.js", import.meta.url), "utf8");

test("browser QA waits for workspace idle before forcing a CDP reload", () => {
  const reload = source.match(/async function reload\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(reload, /sleep\(200\)/);
  assert.match(reload, /isWorkspaceIdle\(\)/);
  assert.ok(reload.indexOf("isWorkspaceIdle()") < reload.indexOf('command("Page.reload"'), "idle gate must complete before Page.reload");
  assert.match(workspace, /export function isWorkspaceIdle\(\)/);
  assert.match(workspace, /pendingWrites/);
});
