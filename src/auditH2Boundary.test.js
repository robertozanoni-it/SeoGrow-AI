import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("frontend inspection espone H2 reale senza simulazione", async () => {
  const source = await readFile(new URL("../server/frontendVerificationHook.js", import.meta.url), "utf8");
  assert.match(source, /function visibleH2Count/);
  assert.match(source, /const h2 = visibleH2Count\(conservativeMarkup\)/);
  assert.match(source, /h2: result\.h2/);
});
