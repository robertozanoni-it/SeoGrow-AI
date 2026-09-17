import { confirmAction } from "./ui/dialogs.js";
import { readWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";

const submitButton = (form) => form?.querySelector?.('button[type="submit"], input[type="submit"]');
const isWordPressDraftForm = (form) => {
  const button = submitButton(form);
  return /Invia come bozza/i.test(String(button?.textContent || button?.value || ""));
};

export function legacyApprovalRequired() {
  const preferences = readWorkspaceJson(WORKSPACE_KEYS.preferences, {});
  return preferences?.approveWordPress !== true;
}

export function confirmLegacyWordPressDraft(event) {
  const form = event?.target;
  if (!form || !isWordPressDraftForm(form) || !legacyApprovalRequired()) return true;
  const approved = confirmAction("Confermi l’invio della bozza a WordPress? SeoGrow non pubblicherà direttamente il contenuto.");
  if (!approved) {
    event.preventDefault();
    event.stopPropagation();
  }
  return approved;
}

if (typeof document !== "undefined" && !window.__seogrowWordPressDraftApprovalInvariantInstalled) {
  window.__seogrowWordPressDraftApprovalInvariantInstalled = true;
  document.addEventListener("submit", confirmLegacyWordPressDraft, true);
}
