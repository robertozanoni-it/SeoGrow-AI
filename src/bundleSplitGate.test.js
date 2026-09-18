import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const vite = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");

test("first-party feature modules are split from the appMain bootstrap bundle", () => {
  for (const chunk of [
    "audit-module",
    "publish-module",
    "rank-module",
    "content-module",
    "geo-module",
    "workspace-layers",
  ]) {
    assert.match(vite, new RegExp(`return ["']${chunk}["']`));
  }
  assert.match(vite, /normalized\.includes\("\/src\/"\)/);
});

test("vendor chunking remains separate from first-party feature chunks", () => {
  assert.match(vite, /react-vendor/);
  assert.match(vite, /charts/);
  assert.match(vite, /archive/);
  assert.match(vite, /csv/);
});
