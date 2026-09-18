import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("i portal di navigazione si riallineano per pochi frame senza polling permanente", async () => {
  const corrections = await readFile(new URL("./CorrectionsWorkspace.jsx", import.meta.url), "utf8");
  const guided = await readFile(new URL("./GuidedUxLayer.jsx", import.meta.url), "utf8");
  assert.match(corrections, /attempts < 8/);
  assert.match(corrections, /requestAnimationFrame\(settle\)/);
  assert.doesNotMatch(corrections, /setInterval\(syncTargets/);
  assert.match(guided, /attempts < 8/);
  assert.match(guided, /requestAnimationFrame\(settle\)/);
  assert.doesNotMatch(guided, /setInterval\(syncTargets/);
});
