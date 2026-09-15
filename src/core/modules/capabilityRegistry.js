import { SUITE_MODULES } from "./moduleRegistry.js";

const CAPABILITY_KEY = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

export const capabilityKey = (moduleId, capability) => `${String(moduleId || "").trim()}:${String(capability || "").trim()}`;

export const SUITE_CAPABILITIES = Object.freeze(
  SUITE_MODULES.flatMap((moduleDefinition) =>
    moduleDefinition.capabilities.map((capability) => Object.freeze({
      key: capabilityKey(moduleDefinition.id, capability),
      moduleId: moduleDefinition.id,
      capability,
      moduleStatus: moduleDefinition.status,
      available: moduleDefinition.status === "active",
    })),
  ),
);

const capabilityMap = new Map();
for (const entry of SUITE_CAPABILITIES) {
  if (!CAPABILITY_KEY.test(entry.key)) throw new Error(`Capability SeoGrow non valida: ${entry.key}`);
  if (capabilityMap.has(entry.key)) throw new Error(`Capability SeoGrow duplicata: ${entry.key}`);
  capabilityMap.set(entry.key, entry);
}

export const suiteCapability = (key) => capabilityMap.get(String(key || "")) || null;

export const capabilitiesForModule = (moduleId, { availableOnly = false } = {}) =>
  SUITE_CAPABILITIES.filter((entry) =>
    entry.moduleId === moduleId && (!availableOnly || entry.available),
  );

export const availableSuiteCapabilities = () => SUITE_CAPABILITIES.filter((entry) => entry.available);
