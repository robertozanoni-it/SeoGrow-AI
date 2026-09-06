import { metadataOf, REMEDIATION_INDEX_KEY, REMEDIATION_LAST_BATCH_KEY } from "./remediationStore.js";
import { readWorkspaceBackup } from "./seoHelpers.js";
import { restoreWorkspace, workspaceStorage } from "./workspaceDatabase.js";

const sections = {
  clients: "seogrow-clients", tasks: "seogrow-tasks-v2", gscData: "seogrow-gsc-v1",
  gscHistory: "seogrow-gsc-history-v1", analyses: "seogrow-analyses-v2",
  rankings: "seogrow-rankings-v1", topicalMaps: "seogrow-topical-maps-v1", geoData: "seogrow-geo-v1",
  contentDrafts: "seogrow-content-drafts-v1", wordpressProfiles: "seogrow-wordpress-profiles-v1",
  pageAuditHistory: "seogrow-page-audit-history-v2", auditResults: "seogrow-quick-audits-v1", agentRuns: "seogrow-agent-runs-v1", preferences: "seogrow-preferences-v1",
};

export async function prepareWorkspaceRestore(input, { snapshots = [], corrections } = {}) {
  // Same validator for encrypted import, direct restore and automatic snapshots.
  const text = JSON.stringify({ schemaVersion: 4, ...input, ...(corrections ? { corrections } : {}) });
  const backup = await readWorkspaceBackup({ size: new TextEncoder().encode(text).length, text: async () => text });
  const entries = new Map();
  for (const [section, key] of Object.entries(sections)) entries.set(key, JSON.stringify(backup[section] ?? (section === "tasks" ? [] : {})));
  entries.set("seogrow-gsc-history-v1", JSON.stringify(backup.gscHistory || Object.fromEntries(Object.entries(backup.gscData).map(([id, data]) => [id, [data]]))));
  const selected = backup.clients.some(client => client.id === Number(backup.selectedClient)) ? Number(backup.selectedClient) : backup.clients[0].id;
  entries.set("seogrow-selected-client-v1", JSON.stringify(selected));
  entries.set("seogrow-selected-page-v1", JSON.stringify("Panoramica"));
  entries.set("seogrow-snapshots-v1", JSON.stringify(snapshots));
  const records = (backup.corrections || []).toSorted((a, b) => Date.parse(b.appliedAt || 0) - Date.parse(a.appliedAt || 0));
  entries.set(REMEDIATION_INDEX_KEY, JSON.stringify(records.map(metadataOf)));
  entries.set(REMEDIATION_LAST_BATCH_KEY, JSON.stringify(records[0]?.batchId || ""));
  return { entries, corrections: records };
}

export async function restoreValidatedWorkspace(backup, { preserveSnapshots = false } = {}) {
  if (preserveSnapshots && !Array.isArray(backup.corrections)) throw new Error("Copia locale precedente alla migrazione: manca lo storico correzioni. Ripristino completo bloccato.");
  const options = preserveSnapshots ? {
    snapshots: JSON.parse(workspaceStorage.getItem("seogrow-snapshots-v1") || "[]"),
    corrections: backup.corrections,
  } : {};
  const prepared = await prepareWorkspaceRestore(backup, options);
  await restoreWorkspace(prepared.entries, prepared.corrections);
}
