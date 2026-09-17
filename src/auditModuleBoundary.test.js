import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const facade = await readFile(new URL("./modules/audit/index.js", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

const AUDIT_SURFACES = [
  "ProblemsNavBridge",
  "ProblemsWorkspaceMount",
  "ProblemResolutionPage",
  "AuditWorkspace",
];

const MOUNTED_AUDIT_SURFACES = [
  "ProblemsWorkspaceMount",
  "ProblemResolutionPage",
  "AuditWorkspace",
];

const PUBLISH_SURFACES = [
  "AutomaticProposalPage",
  "RemediationRuntime",
  "CorrectionsWorkspace",
];

test("Audit espone le superfici legacy necessarie ma non rimonta una navigazione Problemi parallela", () => {
  for (const surface of AUDIT_SURFACES) {
    assert.match(facade, new RegExp(`default as ${surface}`));
  }
  for (const surface of MOUNTED_AUDIT_SURFACES) {
    assert.match(main, new RegExp(`<${surface} \\/>`));
  }
  assert.doesNotMatch(main, /<ProblemsNavBridge \/>/);
  for (const surface of PUBLISH_SURFACES) {
    assert.doesNotMatch(facade, new RegExp(`default as ${surface}`));
  }
  assert.match(main, /from ['"]\.\/modules\/audit\/index\.js['"]/);
});

test("il bootstrap non dipende direttamente dai file UI interni dei domini", () => {
  for (const surface of [...AUDIT_SURFACES, ...PUBLISH_SURFACES]) {
    assert.doesNotMatch(main, new RegExp(`from ['"]\\.\\/${surface}['"]`));
  }
  assert.match(main, /from ['"]\.\/modules\/publish\/ui\.js['"]/);
});
