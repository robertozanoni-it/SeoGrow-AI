import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contentManifest, contentPlan } from "./modules/content/index.js";
import { contentPlan as legacyContentPlan } from "./platform.js";

test("Content facade espone le capability dichiarate dal modulo", () => {
  assert.equal(contentManifest.id, "content");
  assert.equal(contentManifest.status, "active");
  assert.equal(contentManifest.agentEnabled, true);
  assert.deepEqual(contentManifest.capabilities, ["editorial-plan", "content-brief", "content-optimization"]);
});

test("Content facade mantiene identica l'implementazione legacy durante l'estrazione", () => {
  assert.equal(contentPlan, legacyContentPlan);
});

test("il piano editoriale appartiene a Content e usa la pure Rank data API", async () => {
  const implementation = await readFile(new URL("./modules/content/contentPlan.js", import.meta.url), "utf8");
  const platform = await readFile(new URL("./platform.js", import.meta.url), "utf8");

  assert.match(implementation, /export function contentPlan/);
  assert.match(implementation, /from ["']\.\.\/rank\/data\.js["']/);
  assert.doesNotMatch(implementation, /rank\/opportunityAnalysis\.js/);
  assert.doesNotMatch(platform, /function contentPlan/);
  assert.match(platform, /from ["']\.\/modules\/content\/contentPlan\.js["']/);
});
