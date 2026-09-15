import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  budgetMoney,
  providerBudgetHealth,
} from "./system/index.js";
import {
  budgetMoney as legacyBudgetMoney,
  providerBudgetHealth as legacyProviderBudgetHealth,
} from "./providerBudgetModel.js";
import {
  observedNumber,
  observedPageCount,
  observedScoreDelta,
} from "./modules/audit/data.js";
import {
  observedNumber as internalObservedNumber,
  observedPageCount as internalObservedPageCount,
  observedScoreDelta as internalObservedScoreDelta,
} from "./modules/audit/observedData.js";

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

test("Audit exposes a pure data API without pulling the UI facade", async () => {
  assert.equal(observedNumber, internalObservedNumber);
  assert.equal(observedPageCount, internalObservedPageCount);
  assert.equal(observedScoreDelta, internalObservedScoreDelta);

  const source = await readFile(new URL("./modules/audit/data.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["'](?:react|[^"']*\.jsx)["']/i);
  assert.doesNotMatch(source, /AuditWorkspace|ProblemsWorkspace|ProblemResolutionPage/);
  assert.match(source, /from ["']\.\/observedData\.js["']/);
});

test("System owns provider budget policy while legacy exports remain identical", async () => {
  assert.equal(budgetMoney, legacyBudgetMoney);
  assert.equal(providerBudgetHealth, legacyProviderBudgetHealth);

  assert.equal(budgetMoney(null), "—");
  assert.equal(budgetMoney(1.234, 2), "$1.23");

  const known = { configured: true, monthlyCost: 8, reservedCost: 1, monthlyBudget: 10 };
  assert.equal(providerBudgetHealth(known, { explicit: true }).remaining, 1);
  assert.equal(providerBudgetHealth({ ...known, monthlyCost: 10 }, { explicit: true }).label, "Budget esaurito");
  assert.equal(providerBudgetHealth({ ...known, monthlyCost: 6 }, { explicit: true }).label, "Budget disponibile");

  const implementation = await readFile(new URL("./system/providers/providerBudget.js", import.meta.url), "utf8");
  const legacyShim = await readFile(new URL("./providerBudgetModel.js", import.meta.url), "utf8");
  assert.match(implementation, /from ["']\.\.\/\.\.\/modules\/audit\/data\.js["']/);
  assert.doesNotMatch(implementation, /observedAuditData\.js|modules\/audit\/index\.js/);
  assert.doesNotMatch(legacyShim, /function providerBudgetHealth|const budgetMoney\s*=/);
  assert.match(legacyShim, /from ["']\.\/system\/providers\/providerBudget\.js["']/);
});

test("nessun nuovo consumer production importa direttamente lo shim provider budget", async () => {
  const importers = [];
  const pattern = /from\s+["']\.\/providerBudgetModel(?:\.js)?["']/;
  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === "providerBudgetModel.js" || normalized.startsWith("system/")) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  assert.deepEqual(importers.sort(), ["ProviderBudgetUx.js"]);
});
