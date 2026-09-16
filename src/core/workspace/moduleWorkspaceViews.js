import { moduleById } from "../modules/moduleRegistry.js";
import { WORKSPACE_KEYS } from "./storageKeys.js";

const view = (moduleId, names) => Object.freeze({
  moduleId,
  names: Object.freeze([...new Set(names)]),
});

/**
 * Logical data views over the existing shared workspace.
 *
 * These are access lenses, not new stores and not ownership transfers. A key
 * may appear in more than one module because existing SeoGrow workflows share
 * evidence across domains. Persisted key names remain unchanged.
 */
export const MODULE_WORKSPACE_VIEWS = Object.freeze([
  view("hub", [
    "clients", "selectedClient", "selectedPage", "tasks", "gsc", "analyses",
    "rankings", "agentRuns", "problemClosures", "snapshots",
  ]),
  view("audit", [
    "clients", "selectedClient", "analyses", "auditMonitor", "pageAuditHistory",
    "auditResults", "remediationHistory",
  ]),
  view("rank", [
    "clients", "selectedClient", "gsc", "gscHistory", "rankings",
  ]),
  view("content", [
    "clients", "selectedClient", "gsc", "analyses", "topicalMaps", "contentDrafts",
  ]),
  view("links", [
    "clients", "selectedClient", "analyses", "pageAuditHistory", "tasks",
  ]),
  view("geo", [
    "clients", "selectedClient", "gsc", "analyses", "topicalMaps", "geoData", "tasks",
  ]),
  view("tasks", [
    "clients", "selectedClient", "tasks",
  ]),
  view("agent", [
    "clients", "selectedClient", "gsc", "analyses", "rankings", "agentRuns",
    "problemClosures", "approvalLedger", "tasks",
  ]),
  view("publish", [
    "clients", "selectedClient", "wordpressProfiles", "cmsRouter", "analyses",
    "pageAuditHistory", "remediationHistory", "remediationLastBatch",
  ]),
  view("system", [
    "clients", "selectedClient", "wordpressProfiles", "cmsRouter", "preferences",
  ]),
]);

const viewMap = new Map();
for (const definition of MODULE_WORKSPACE_VIEWS) {
  if (!moduleById(definition.moduleId)) {
    throw new Error(`Vista workspace associata a modulo SeoGrow sconosciuto: ${definition.moduleId}`);
  }
  if (viewMap.has(definition.moduleId)) {
    throw new Error(`Vista workspace SeoGrow duplicata: ${definition.moduleId}`);
  }
  for (const name of definition.names) {
    if (!WORKSPACE_KEYS[name]) {
      throw new Error(`Dataset workspace SeoGrow sconosciuto in ${definition.moduleId}: ${name}`);
    }
  }
  viewMap.set(definition.moduleId, definition);
}

export const moduleWorkspaceView = (moduleId) => viewMap.get(String(moduleId || "")) || null;

export const moduleWorkspaceKeyNames = (moduleId) => moduleWorkspaceView(moduleId)?.names || Object.freeze([]);

export const moduleWorkspaceKeys = (moduleId) => Object.freeze(
  moduleWorkspaceKeyNames(moduleId).map((name) => WORKSPACE_KEYS[name]),
);

export const moduleCanAccessWorkspaceKey = (moduleId, keyOrName) => {
  const names = moduleWorkspaceKeyNames(moduleId);
  const value = WORKSPACE_KEYS[keyOrName] || String(keyOrName || "");
  return names.some((name) => WORKSPACE_KEYS[name] === value);
};
