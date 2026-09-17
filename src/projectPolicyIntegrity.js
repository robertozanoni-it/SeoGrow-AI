import { readWorkspaceJson, writeWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";

let repairing = false;

export function enforceMandatoryWordPressApproval() {
  if (repairing) return false;
  const preferences = readWorkspaceJson(WORKSPACE_KEYS.preferences, {});
  if (preferences?.approveWordPress === true) return false;
  repairing = true;
  try {
    writeWorkspaceJson(WORKSPACE_KEYS.preferences, { ...preferences, approveWordPress: true });
    return true;
  } finally {
    repairing = false;
  }
}

if (typeof window !== "undefined" && !window.__seogrowProjectPolicyIntegrityInstalled) {
  window.__seogrowProjectPolicyIntegrityInstalled = true;
  const repair = (event) => {
    if (event?.key && event.key !== WORKSPACE_KEYS.preferences) return;
    enforceMandatoryWordPressApproval();
  };
  window.addEventListener("storage", repair);
  window.addEventListener("seogrow-storage-ok", repair);
  window.queueMicrotask(enforceMandatoryWordPressApproval);
}
