import { metadataOf } from "./remediationStore.js";
import { readWorkspaceBackup } from "./seoHelpers.js";
import { restoreWorkspace, workspaceStorage } from "./workspaceDatabase.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";

const sections = {
  clients: WORKSPACE_KEYS.clients,
  tasks: WORKSPACE_KEYS.tasks,
  gscData: WORKSPACE_KEYS.gsc,
  gscHistory: WORKSPACE_KEYS.gscHistory,
  analyses: WORKSPACE_KEYS.analyses,
  rankings: WORKSPACE_KEYS.rankings,
  topicalMaps: WORKSPACE_KEYS.topicalMaps,
  geoData: WORKSPACE_KEYS.geoData,
  contentDrafts: WORKSPACE_KEYS.contentDrafts,
  wordpressProfiles: WORKSPACE_KEYS.wordpressProfiles,
  auditMonitor: WORKSPACE_KEYS.auditMonitor,
  pageAuditHistory: WORKSPACE_KEYS.pageAuditHistory,
  auditResults: WORKSPACE_KEYS.auditResults,
  agentRuns: WORKSPACE_KEYS.agentRuns,
  preferences: WORKSPACE_KEYS.preferences,
};

export async function prepareWorkspaceRestore(input, { snapshots = [], corrections } = {}) {
  // Same validator for encrypted import, direct restore and automatic snapshots.
  const text = JSON.stringify({ schemaVersion: 4, ...input, ...(corrections ? { corrections } : {}) });
  const backup = await readWorkspaceBackup({ size: new TextEncoder().encode(text).length, text: async () => text });
  const entries = new Map();
  for (const [section, key] of Object.entries(sections)) {
    if (section === "auditMonitor" && backup.auditMonitor == null) continue; // Old backups restore the same key set; the transaction clears obsolete monitor data.
    entries.set(key, JSON.stringify(backup[section] ?? (section === "tasks" ? [] : {})));
  }
  entries.set(WORKSPACE_KEYS.gscHistory, JSON.stringify(backup.gscHistory || Object.fromEntries(Object.entries(backup.gscData).map(([id, data]) => [id, [data]]))));
  const selected = backup.clients.some(client => client.id === Number(backup.selectedClient)) ? Number(backup.selectedClient) : backup.clients[0].id;
  entries.set(WORKSPACE_KEYS.selectedClient, JSON.stringify(selected));
  entries.set(WORKSPACE_KEYS.selectedPage, JSON.stringify("Panoramica"));
  entries.set(WORKSPACE_KEYS.snapshots, JSON.stringify(snapshots));
  const records = (backup.corrections || []).toSorted((a, b) => Date.parse(b.appliedAt || 0) - Date.parse(a.appliedAt || 0));
  entries.set(WORKSPACE_KEYS.remediationHistory, JSON.stringify(records.map(metadataOf)));
  entries.set(WORKSPACE_KEYS.remediationLastBatch, JSON.stringify(records[0]?.batchId || ""));
  return { entries, corrections: records };
}

export async function restoreValidatedWorkspace(backup, { preserveSnapshots = false } = {}) {
  if (preserveSnapshots && !Array.isArray(backup.corrections)) throw new Error("Copia locale precedente alla migrazione: manca lo storico correzioni. Ripristino completo bloccato.");
  const options = preserveSnapshots ? {
    snapshots: JSON.parse(workspaceStorage.getItem(WORKSPACE_KEYS.snapshots) || "[]"),
    corrections: backup.corrections,
  } : {};
  const prepared = await prepareWorkspaceRestore(backup, options);
  await restoreWorkspace(prepared.entries, prepared.corrections);
}
