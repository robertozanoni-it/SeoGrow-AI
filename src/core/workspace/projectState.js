import { normalizeStoredTasks } from "../../experience/tasks/taskPersistence.js";
import { normalizeHttpUrl } from "../../reliabilityModel.js";
import { WORKSPACE_KEYS } from "./storageKeys.js";

export const LEGACY_WORKSPACE_KEYS = Object.freeze({
  tasks: "seogrow-tasks",
  analyses: "seogrow-analyses-v1",
});

const parsed = (raw, fallback) => {
  if (raw == null) return fallback;
  try { return JSON.parse(raw) ?? fallback; } catch { return fallback; }
};

const timestamp = (value) => {
  const result = Date.parse(value || "");
  return Number.isFinite(result) ? result : 0;
};

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).toSorted().map((key) => [key, stableValue(value[key])]));
};

const fingerprint = (value) => JSON.stringify(stableValue(value));

const dedupeExact = (items, dateOf = () => "") => {
  const seen = new Set();
  const output = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== "object") continue;
    const key = fingerprint(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output.toSorted((a, b) => timestamp(dateOf(b)) - timestamp(dateOf(a)));
};

const canonicalClients = (value) => {
  const byId = new Map();
  for (const client of Array.isArray(value) ? value : []) {
    const id = Number(client?.id);
    if (!Number.isSafeInteger(id) || id <= 0 || byId.has(id)) continue;
    byId.set(id, client);
  }
  return [...byId.values()];
};

const taskRecency = (task) => timestamp(task?.updatedAt || task?.completedAt || task?.createdAt);

export const canonicalTasks = (value) => {
  const byId = new Map();
  for (const task of Array.isArray(value) ? value : []) {
    const id = typeof task?.id === "string" ? task.id.trim() : "";
    if (!id) continue;
    const current = byId.get(id);
    if (!current || taskRecency(task) >= taskRecency(current)) byId.set(id, task);
  }
  return normalizeStoredTasks([...byId.values()], []);
};

const canonicalHistoryMap = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([clientId, history]) => [
    clientId,
    dedupeExact(Array.isArray(history) ? history : history ? [history] : [], (item) => item?.analyzedAt || item?.startedAt),
  ]));
};

const closureKey = (item) => [
  Number(item?.clientId) || 0,
  String(item?.issueType || "").trim().toLowerCase(),
  normalizeHttpUrl(item?.sourceUrl || "", { stripSlash: true }),
  normalizeHttpUrl(item?.targetUrl || "", { stripSlash: true }),
].join("::");

export const canonicalProblemClosures = (value) => {
  const byKey = new Map();
  for (const closure of Array.isArray(value) ? value : []) {
    if (!closure || typeof closure !== "object" || !Number(closure.clientId) || !closure.issueType || !closure.sourceUrl) continue;
    const key = closureKey(closure);
    const current = byKey.get(key);
    if (!current || timestamp(closure.closedAt) >= timestamp(current.closedAt)) byKey.set(key, closure);
  }
  return [...byKey.values()].toSorted((a, b) => timestamp(b.closedAt) - timestamp(a.closedAt));
};

const canonicalRemediationIndex = (value) => {
  const byId = new Map();
  for (const item of Array.isArray(value) ? value : []) {
    if (!item?.id) continue;
    const current = byId.get(item.id);
    const at = item?.verifiedAt || item?.rollbackAt || item?.appliedAt;
    const currentAt = current?.verifiedAt || current?.rollbackAt || current?.appliedAt;
    if (!current || timestamp(at) >= timestamp(currentAt)) byId.set(item.id, item);
  }
  return [...byId.values()].toSorted((a, b) => timestamp(b.verifiedAt || b.rollbackAt || b.appliedAt) - timestamp(a.verifiedAt || a.rollbackAt || a.appliedAt));
};

const setJson = (entries, key, value) => entries.set(key, JSON.stringify(value));

export function canonicalizeWorkspaceEntries(input) {
  const entries = new Map(input instanceof Map ? input : []);
  const hasPersistedClients = entries.has(WORKSPACE_KEYS.clients);
  const clients = canonicalClients(parsed(entries.get(WORKSPACE_KEYS.clients), []));
  if (hasPersistedClients) setJson(entries, WORKSPACE_KEYS.clients, clients);

  let tasks = parsed(entries.get(WORKSPACE_KEYS.tasks), null);
  if (!Array.isArray(tasks)) tasks = parsed(entries.get(LEGACY_WORKSPACE_KEYS.tasks), []);
  setJson(entries, WORKSPACE_KEYS.tasks, canonicalTasks(tasks));
  entries.delete(LEGACY_WORKSPACE_KEYS.tasks);

  let analyses = parsed(entries.get(WORKSPACE_KEYS.analyses), null);
  if (!analyses || typeof analyses !== "object" || Array.isArray(analyses)) {
    analyses = parsed(entries.get(LEGACY_WORKSPACE_KEYS.analyses), {});
  }
  setJson(entries, WORKSPACE_KEYS.analyses, canonicalHistoryMap(analyses));
  entries.delete(LEGACY_WORKSPACE_KEYS.analyses);

  setJson(entries, WORKSPACE_KEYS.pageAuditHistory, canonicalHistoryMap(parsed(entries.get(WORKSPACE_KEYS.pageAuditHistory), {})));
  setJson(entries, WORKSPACE_KEYS.problemClosures, canonicalProblemClosures(parsed(entries.get(WORKSPACE_KEYS.problemClosures), [])));
  setJson(entries, WORKSPACE_KEYS.remediationHistory, canonicalRemediationIndex(parsed(entries.get(WORKSPACE_KEYS.remediationHistory), [])));

  if (hasPersistedClients) {
    const selected = Number(parsed(entries.get(WORKSPACE_KEYS.selectedClient), null));
    if (!clients.some((client) => Number(client.id) === selected)) {
      setJson(entries, WORKSPACE_KEYS.selectedClient, clients[0]?.id ?? null);
    }
  }
  return entries;
}

const forClient = (store, clientId, fallback = []) => store?.[clientId] ?? store?.[String(clientId)] ?? fallback;

export function buildProjectState({
  clients = [],
  selectedClient = null,
  preferences = {},
  analyses = {},
  pageAuditHistory = {},
  tasks = [],
  problemClosures = [],
  corrections = [],
} = {}, requestedClientId = selectedClient) {
  const canonicalClientList = canonicalClients(clients);
  const clientId = Number(requestedClientId);
  const client = canonicalClientList.find((item) => Number(item.id) === clientId) || null;
  if (!client) return { clientId: null, client: null, project: {}, audits: { site: [], page: [] }, tasks: [], corrections: [], problemClosures: [] };
  return {
    clientId,
    client,
    project: preferences?.projectSettings?.[clientId] || preferences?.projectSettings?.[String(clientId)] || {},
    audits: {
      site: dedupeExact(forClient(analyses, clientId), (item) => item?.analyzedAt || item?.startedAt),
      page: dedupeExact(forClient(pageAuditHistory, clientId), (item) => item?.analyzedAt || item?.startedAt),
    },
    tasks: canonicalTasks(tasks).filter((task) => Number(task.sourceClientId) === clientId),
    corrections: (Array.isArray(corrections) ? corrections : []).filter((item) => Number(item?.clientId) === clientId),
    problemClosures: canonicalProblemClosures(problemClosures).filter((item) => Number(item.clientId) === clientId),
  };
}
