import {
  SUITE_CAPABILITIES,
  agentAvailableSuiteCapabilities,
  suiteCapability,
} from "../../core/modules/capabilityRegistry.js";
import { moduleById } from "../../core/modules/moduleRegistry.js";

const ORCHESTRATABLE_LAYERS = new Set(["module", "action"]);

const toAgentTool = (entry) => {
  const moduleDefinition = moduleById(entry.moduleId);
  if (!moduleDefinition || !ORCHESTRATABLE_LAYERS.has(moduleDefinition.layer)) return null;
  return Object.freeze({
    id: entry.key,
    moduleId: entry.moduleId,
    moduleLabel: moduleDefinition.label,
    capability: entry.capability,
    available: entry.agentAvailable,
  });
};

export const agentModuleTools = ({ includeUnavailable = false } = {}) => {
  const source = includeUnavailable ? SUITE_CAPABILITIES : agentAvailableSuiteCapabilities();
  return Object.freeze(source.map(toAgentTool).filter(Boolean));
};

export const agentToolForCapability = (key, { includeUnavailable = false } = {}) => {
  const entry = suiteCapability(key);
  if (!entry) return null;
  const tool = toAgentTool(entry);
  if (!tool) return null;
  if (!includeUnavailable && !tool.available) return null;
  return tool;
};

export const isAgentCapabilityAvailable = (key) => Boolean(agentToolForCapability(key));
