import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("workspace usa un solo listener pagehide per il flush finale", async () => {
  const source = await readFile(new URL("./App.jsx", import.meta.url), "utf8");
  const registrations = source.match(/addEventListener\("pagehide"/g) || [];
  assert.equal(registrations.length, 1);
  assert.match(source, /flushOnPageHide/);
});

test("browser QA fallisce sui network failure non cancellati", async () => {
  const source = await readFile(new URL("../scripts/browser-smoke.mjs", import.meta.url), "utf8");
  assert.match(source, /unexpectedNetworkFailures/);
  assert.match(source, /params\?\.canceled !== true/);
});
