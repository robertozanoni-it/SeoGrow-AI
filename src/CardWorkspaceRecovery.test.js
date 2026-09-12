import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./CardWorkspaceRecovery.js", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("card workspace recovery reattaches registered hosts without inventing page content", () => {
  assert.match(source, /enforcePageStartHierarchy/);
  assert.match(source, /MAX_FRAMES = 180/);
  assert.match(source, /\.card-workspace-host/);
  assert.match(source, /\.card-workspace/);
  assert.match(source, /main\.dataset\.page !== page/);
  assert.match(source, /requestAnimationFrame\(tick\)/);
});

test("recovery excludes pages intentionally outside card mode and is installed globally", () => {
  assert.match(source, /Centro progetto/);
  assert.match(source, /Problemi/);
  assert.match(source, /seogrow-locationchange/);
  assert.match(main, /import '\.\/CardWorkspaceRecovery';/);
});
