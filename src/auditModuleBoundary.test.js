import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const facade = await readFile(new URL("./modules/audit/index.js", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

const EXPORTED_SURFACES = [
  "ProblemsNavBridge",
  "ProblemsWorkspaceMount",
  "ProblemResolutionPage",
  "AutomaticProposalPage",
  "AuditWorkspace",
  "RemediationRuntime",
  "CorrectionsWorkspace",
];

test("Audit & Fix espone una facade transitoria unica per il bootstrap", () => {
  for (const surface of EXPORTED_SURFACES) {
    assert.match(facade, new RegExp(`default as ${surface}`));
    assert.match(main, new RegExp(`<${surface} \\/>`));
  }
  assert.match(main, /from ['"]\.\/modules\/audit\/index\.js['"]/);
});

test("il bootstrap non dipende più direttamente dai file UI interni di Audit & Fix", () => {
  for (const surface of EXPORTED_SURFACES) {
    assert.doesNotMatch(main, new RegExp(`from ['"]\\.\\/${surface}['"]`));
  }
});
