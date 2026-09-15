import { agentToolForCapability } from "./moduleToolCatalog.js";

/**
 * Compatibility map between the current Agent runtime and the Suite domains.
 *
 * Legacy tool names remain unchanged so existing saved runs, approvals and
 * browser QA stay valid. The mapping gives each tool a stable Suite semantic
 * identity while the runtime is migrated incrementally.
 */
export const LEGACY_AGENT_TOOL_CAPABILITIES = Object.freeze({
  "data.gsc": "rank:growth-signals",
  "data.analysis": "audit:detect",
  "data.rankings": "rank:rankings",
  "seo.opportunities": "rank:search-opportunities",
  "seo.trafficDrop": "rank:growth-signals",
  "seo.contentDecay": "content:content-optimization",
  "seo.internalLinks": "links:internal-links",
});

export const suiteCapabilityKeyForLegacyTool = (legacyTool) =>
  LEGACY_AGENT_TOOL_CAPABILITIES[String(legacyTool || "")] || null;

export const suiteToolForLegacyAgentTool = (legacyTool, options = {}) => {
  const capabilityKey = suiteCapabilityKeyForLegacyTool(legacyTool);
  return capabilityKey ? agentToolForCapability(capabilityKey, options) : null;
};

export function validateLegacyAgentToolCapabilityMap() {
  for (const [legacyTool, capabilityKey] of Object.entries(LEGACY_AGENT_TOOL_CAPABILITIES)) {
    if (!legacyTool.trim()) throw new Error("Tool Agent legacy senza nome.");
    if (!agentToolForCapability(capabilityKey, { includeUnavailable: true })) {
      throw new Error(`Tool Agent ${legacyTool} punta a una capability Suite sconosciuta: ${capabilityKey}`);
    }
  }
  return true;
}

validateLegacyAgentToolCapabilityMap();
