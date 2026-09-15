import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  observedNumber,
  observedPageCount,
  observedScoreDelta,
} from "./modules/audit/observedData.js";
import {
  observedNumber as legacyObservedNumber,
  observedPageCount as legacyObservedPageCount,
  observedScoreDelta as legacyObservedScoreDelta,
} from "./observedAuditData.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

async function sourceFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path.join(directory, entry.name), relative));
    else if (/\.(?:js|jsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) files.push(relative);
  }
  return files;
}

test("Audit owns observed evidence normalization while legacy exports remain identical", async () => {
  assert.equal(observedNumber, legacyObservedNumber);
  assert.equal(observedPageCount, legacyObservedPageCount);
  assert.equal(observedScoreDelta, legacyObservedScoreDelta);

  assert.equal(observedNumber("12"), 12);
  assert.equal(observedNumber(""), null);
  assert.equal(observedPageCount({ pages: [1, 2, 3] }), 3);
  assert.equal(observedScoreDelta({ score: 80 }, { score: 65 }), 15);
  assert.equal(observedScoreDelta({ score: null }, { score: 65 }), null);

  const facade = await readFile(new URL("./modules/audit/index.js", import.meta.url), "utf8");
  const legacyShim = await readFile(new URL("./observedAuditData.js", import.meta.url), "utf8");
  assert.match(facade, /from ["']\.\/observedData\.js["']/);
  assert.doesNotMatch(legacyShim, /function observedNumber/);
  assert.match(legacyShim, /from ["']\.\/modules\/audit\/observedData\.js["']/);
});

test("nessun nuovo consumer di produzione importa direttamente lo shim observedAuditData", async () => {
  const importers = [];
  const pattern = /from\s+["']\.\/observedAuditData\.js["']/;
  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === "observedAuditData.js" || normalized.startsWith("modules/audit/")) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  assert.deepEqual(importers.sort(), ["App.jsx", "AuditWorkspace.jsx"]);
});
