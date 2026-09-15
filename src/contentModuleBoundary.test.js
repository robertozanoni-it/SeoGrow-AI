import test from "node:test";
import assert from "node:assert/strict";
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
