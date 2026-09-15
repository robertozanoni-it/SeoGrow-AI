import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as publish from "./modules/publish/index.js";
import { moduleById } from "./core/modules/moduleRegistry.js";

const facade = await readFile(new URL("./modules/publish/index.js", import.meta.url), "utf8");

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

test("Publish resta pianificato finché la UI non possiede una route dedicata", () => {
  const manifest = moduleById("publish");
  assert.equal(manifest.status, "planned");
  assert.equal(manifest.homePage, null);
  assert.deepEqual(manifest.pages, []);
  assert.ok(manifest.capabilities.includes("wordpress"));
  assert.ok(manifest.capabilities.includes("verify"));
});
