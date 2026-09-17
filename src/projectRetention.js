import { readWorkspaceJson, writeWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { projectPolicyFromPreferences } from "./system/settings/projectPolicy.js";

const forClient = (store, clientId) => store?.[clientId] ?? store?.[String(clientId)] ?? null;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const trimClientArray = (key, clientId, limit) => {
  const store = readWorkspaceJson(key, {});
  const current = forClient(store, clientId);
  if (!Array.isArray(current) || current.length <= limit) return false;
  const next = { ...store, [clientId]: current.slice(0, limit) };
  writeWorkspaceJson(key, next);
  return true;
};

const trimGeo = (clientId, limit) => {
  const store = readWorkspaceJson(WORKSPACE_KEYS.geoData, {});
  const current = forClient(store, clientId);
  if (!current || typeof current !== "object" || !Array.isArray(current.history) || current.history.length <= limit) return false;
  const nextValue = { ...current, history: current.history.slice(0, limit) };
  if (same(nextValue, current)) return false;
  writeWorkspaceJson(WORKSPACE_KEYS.geoData, { ...store, [clientId]: nextValue });
  return true;
};

export function applyProjectRetention(clientId) {
  const id = Number(clientId);
  if (!Number.isSafeInteger(id) || id <= 0) return { changed: false, clientId: id };
  const preferences = readWorkspaceJson(WORKSPACE_KEYS.preferences, {});
  const policy = projectPolicyFromPreferences(preferences, id);
  const changed = [
    trimClientArray(WORKSPACE_KEYS.analyses, id, policy.retention.auditRuns),
    trimClientArray(WORKSPACE_KEYS.pageAuditHistory, id, policy.retention.auditRuns),
    trimClientArray(WORKSPACE_KEYS.rankings, id, policy.retention.rankingRuns),
    trimClientArray(WORKSPACE_KEYS.agentRuns, id, policy.retention.agentRuns),
    trimGeo(id, policy.retention.geoSnapshots),
  ].some(Boolean);
  return { changed, clientId: id, retention: policy.retention };
}

let timer = 0;
const schedule = (clientId) => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => applyProjectRetention(clientId), 80);
};

if (typeof window !== "undefined" && !window.__seogrowProjectRetentionInstalled) {
  window.__seogrowProjectRetentionInstalled = true;
  const selected = () => Number(readWorkspaceJson(WORKSPACE_KEYS.selectedClient, 0));
  window.addEventListener("seogrow-project-policy-changed", (event) => schedule(Number(event.detail?.clientId) || selected()));
  window.addEventListener("storage", (event) => {
    if (![WORKSPACE_KEYS.analyses, WORKSPACE_KEYS.pageAuditHistory, WORKSPACE_KEYS.rankings, WORKSPACE_KEYS.agentRuns, WORKSPACE_KEYS.geoData].includes(event.key)) return;
    schedule(selected());
  });
  schedule(selected());
}
