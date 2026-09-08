import { workspaceStorage, openWorkspaceDb, readWorkspace, flushWorkspace } from "./workspaceDatabase.js";
import { MONITOR_KEY, normalizeMonitorRecords } from "./auditMonitoring.js";
const record = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export function readAuditMonitor() {
  try { return normalizeMonitorRecords(JSON.parse(workspaceStorage.getItem(MONITOR_KEY) || "{}")); } catch { return {}; }
}
export async function readMonitorSource() {
  await flushWorkspace();
  const db = await openWorkspaceDb();
  try {
    const data = await readWorkspace(db);
    const clients = JSON.parse(data.get("seogrow-clients") || "[]");
    return { generation: data.get("__generation"), clients: Array.isArray(clients) ? clients : [], settings: record(JSON.parse(data.get("seogrow-preferences-v1") || "{}")).projectSettings || {}, records: normalizeMonitorRecords(JSON.parse(data.get(MONITOR_KEY) || "{}")) };
  } finally { db.close(); }
}
export async function saveAuditMonitor(records) {
  const newValue = JSON.stringify(records);
  workspaceStorage.setItem(MONITOR_KEY, newValue);
  await flushWorkspace();
  window.dispatchEvent(new StorageEvent("storage", { key: MONITOR_KEY, newValue }));
}
