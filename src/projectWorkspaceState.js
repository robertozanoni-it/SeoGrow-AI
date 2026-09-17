import { buildProjectState } from "./core/workspace/projectState.js";
import { readWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { listCorrections } from "./remediationStore.js";

export async function loadProjectWorkspaceState(clientId) {
  const corrections = await listCorrections({ clientId });
  return buildProjectState({
    clients: readWorkspaceJson(WORKSPACE_KEYS.clients, []),
    selectedClient: readWorkspaceJson(WORKSPACE_KEYS.selectedClient, null),
    preferences: readWorkspaceJson(WORKSPACE_KEYS.preferences, {}),
    analyses: readWorkspaceJson(WORKSPACE_KEYS.analyses, {}),
    pageAuditHistory: readWorkspaceJson(WORKSPACE_KEYS.pageAuditHistory, {}),
    tasks: readWorkspaceJson(WORKSPACE_KEYS.tasks, []),
    problemClosures: readWorkspaceJson(WORKSPACE_KEYS.problemClosures, []),
    corrections,
  }, clientId);
}
