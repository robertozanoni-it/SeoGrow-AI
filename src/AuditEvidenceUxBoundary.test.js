import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Audit UI mostra sorgente riproducibile e CTA di risoluzione direttamente nel workspace", async () => {
  const source = await read("./AuditWorkspace.jsx");
  assert.match(source, /Sorgente:/);
  assert.match(source, /evidence\.field/);
  assert.match(source, /evidence\.observed/);
  assert.match(source, /evidence\.url/);
  assert.match(source, /data-reproducible/);
  assert.match(source, /Vai alla risoluzione/);
  assert.match(source, /enforceAuditEvidence/);
});

test("Audit evidence non installa side effect DOM globale", async () => {
  const [main, audit] = await Promise.all([
    read("./appMain.jsx"),
    read("./AuditWorkspace.jsx"),
  ]);
  assert.doesNotMatch(main, /AuditEvidenceUx/);
  assert.doesNotMatch(audit, /MutationObserver/);
});
