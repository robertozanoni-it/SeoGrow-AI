import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_AGENT_TOOL_CAPABILITIES,
  suiteCapabilityKeyForLegacyTool,
  suiteToolForLegacyAgentTool,
  validateLegacyAgentToolCapabilityMap,
} from "./intelligence/agent/legacyToolCapabilityMap.js";

test("tutti i tool del runtime Agent corrente hanno una capability Suite", () => {
  assert.deepEqual(Object.keys(LEGACY_AGENT_TOOL_CAPABILITIES).sort(), [
    "data.analysis",
    "data.gsc",
    "data.rankings",
    "seo.contentDecay",
    "seo.internalLinks",
    "seo.opportunities",
    "seo.trafficDrop",
  ]);
  assert.equal(validateLegacyAgentToolCapabilityMap(), true);
});

test("il mapping conserva il significato dei workflow esistenti", () => {
  assert.equal(suiteCapabilityKeyForLegacyTool("data.analysis"), "audit:detect");
  assert.equal(suiteCapabilityKeyForLegacyTool("data.rankings"), "rank:rankings");
  assert.equal(suiteCapabilityKeyForLegacyTool("seo.opportunities"), "rank:search-opportunities");
  assert.equal(suiteCapabilityKeyForLegacyTool("seo.contentDecay"), "content:content-optimization");
  assert.equal(suiteCapabilityKeyForLegacyTool("seo.internalLinks"), "links:internal-links");
});

test("la risoluzione produce tool modulari disponibili senza rinominare il runtime legacy", () => {
  const tool = suiteToolForLegacyAgentTool("seo.internalLinks");
  assert.equal(tool.id, "links:internal-links");
  assert.equal(tool.moduleId, "links");
  assert.equal(tool.available, true);
  assert.equal(suiteToolForLegacyAgentTool("legacy.unknown"), null);
});
