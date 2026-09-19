import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Guided UX usa osservazione DOM event-driven e non polling ogni 300 ms", async () => {
  const source = await readFile(new URL("./GuidedUxLayer.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /setInterval\(syncTargets, 300\)/);
  assert.doesNotMatch(source, /MutationObserver/);
  assert.match(source, /attempts < 120/);
});

test("Corrections workspace usa osservazione DOM event-driven e cleanup", async () => {
  const source = await readFile(new URL("./CorrectionsWorkspace.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /setInterval\(syncTargets, 300\)/);
  assert.doesNotMatch(source, /MutationObserver/);
  assert.match(source, /attempts < 120/);
});

test("Centro progetto non forza rerender ogni secondo per una scadenza di 30 minuti", async () => {
  const source = await readFile(new URL("./ProjectCenter.jsx", import.meta.url), "utf8");
  assert.match(source, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 60_000\)/);
  assert.doesNotMatch(source, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\)/);
});
