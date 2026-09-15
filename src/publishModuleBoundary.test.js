import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as publish from "./modules/publish/index.js";
import { moduleById, moduleForPage } from "./core/modules/moduleRegistry.js";

const facade = await readFile(new URL("./modules/publish/index.js", import.meta.url), "utf8");
const uiFacade = await readFile(new URL("./modules/publish/ui.js", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

const PUBLIC_API = [
  "preparationFailure",
  "inspectWordPress",
  "inspectFrontend",
  "inspectLinkEvidence",
  "buildPlan",
  "createWordPressCorrection",
  "applyPreparedCorrection",
];

test("Publish espone un confine pubblico sopra il motore WordPress esistente", () => {
  for (const name of PUBLIC_API) assert.equal(typeof publish[name], "function", `${name} deve restare disponibile`);
  assert.match(facade, /\.\.\/\.\.\/wordpressRemediationEngine\.js/);
});

test("Publish possiede le superfici UI di remediation senza spostare i componenti legacy", () => {
  assert.match(uiFacade, /default as AutomaticProposalPage/);
  assert.match(uiFacade, /default as RemediationRuntime/);
  assert.match(uiFacade, /default as CorrectionsWorkspace/);
  assert.match(main, /from ['"]\.\/modules\/publish\/ui\.js['"]/);
  assert.match(main, /<AutomaticProposalPage \/>/);
  assert.match(main, /<RemediationRuntime \/>/);
  assert.match(main, /<CorrectionsWorkspace \/>/);
});

test("Publish è attivo sulla route legacy Correzioni ma non Agent-enabled", () => {
  const manifest = moduleById("publish");
  assert.equal(manifest.status, "active");
  assert.equal(manifest.agentEnabled, false);
  assert.equal(manifest.homePage, "Correzioni");
  assert.deepEqual(manifest.pages, ["Correzioni"]);
  assert.equal(moduleForPage("Correzioni").id, "publish");
  assert.ok(manifest.capabilities.includes("wordpress"));
  assert.ok(manifest.capabilities.includes("apply"));
  assert.ok(manifest.capabilities.includes("verify"));
});
