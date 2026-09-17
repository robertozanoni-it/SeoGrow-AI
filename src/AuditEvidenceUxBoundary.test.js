import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Audit UI mostra sorgente riproducibile e CTA di risoluzione", async () => {
  const source = await readFile(new URL("./AuditEvidenceUx.js", import.meta.url), "utf8");
  assert.match(source, /Sorgente:/);
  assert.match(source, /evidence\.field/);
  assert.match(source, /evidence\.observed/);
  assert.match(source, /evidence\.url/);
  assert.match(source, /Vai alla risoluzione/);
});
