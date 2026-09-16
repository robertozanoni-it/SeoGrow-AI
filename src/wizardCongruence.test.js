import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("il footer wizard non usa innerHTML con testo dinamico", async () => {
  const source = await readFile(new URL("./WizardCongruenceLayer.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /footerText\.innerHTML/);
  assert.match(source, /destinationNode\.textContent/);
});
