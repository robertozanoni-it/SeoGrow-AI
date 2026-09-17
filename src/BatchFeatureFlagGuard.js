import { readWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { projectFeatureEnabled, projectPolicyFromPreferences } from "./system/settings/projectPolicy.js";

const selectedClientId = () => Number(readWorkspaceJson(WORKSPACE_KEYS.selectedClient, 0));
const batchEnabled = () => {
  const clientId = selectedClientId();
  if (!Number.isSafeInteger(clientId) || clientId <= 0) return true;
  const preferences = readWorkspaceJson(WORKSPACE_KEYS.preferences, {});
  return projectFeatureEnabled(projectPolicyFromPreferences(preferences, clientId), "batchAutoFix");
};

const isBatchExecutionButton = (button) => {
  if (!(button instanceof HTMLButtonElement)) return false;
  const label = String(button.textContent || "").trim();
  if (button.closest(".batch-toolbar") && /^Risolvi\b/i.test(label)) return true;
  if (button.closest(".batch-workspace") && /^(?:Prepara|Approva|Applica|Esegui|Correggi)\b/i.test(label)) return true;
  return false;
};

const refresh = () => {
  const root = document.querySelector(".batch-remediation");
  if (!root) return;
  const disabled = !batchEnabled();
  root.toggleAttribute("data-batch-feature-disabled", disabled);
  root.querySelectorAll("button").forEach((button) => {
    if (!isBatchExecutionButton(button)) return;
    if (disabled && !button.disabled) {
      button.dataset.featureFlagDisabled = "true";
      button.disabled = true;
    } else if (!disabled && button.dataset.featureFlagDisabled === "true") {
      delete button.dataset.featureFlagDisabled;
      button.disabled = false;
    }
  });
  let note = root.querySelector(".seogrow-batch-feature-note");
  if (disabled && !note) {
    note = document.createElement("p");
    note.className = "batch-note seogrow-batch-feature-note";
    note.setAttribute("role", "status");
    note.textContent = "Batch AutoFix è disattivato nelle Impostazioni del progetto. Le correzioni singole restano disponibili.";
    root.querySelector(".batch-toolbar")?.insertAdjacentElement("afterend", note);
  } else if (!disabled && note) {
    note.remove();
  }
};

if (typeof window !== "undefined" && !window.__seogrowBatchFeatureGuardInstalled) {
  window.__seogrowBatchFeatureGuardInstalled = true;
  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button");
    if (!button || batchEnabled() || !isBatchExecutionButton(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    refresh();
  }, true);
  const observer = new MutationObserver(() => window.requestAnimationFrame(refresh));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  for (const name of ["storage", "seogrow-storage-ok", "seogrow-project-policy-changed", "seogrow-locationchange"]) window.addEventListener(name, refresh);
  window.requestAnimationFrame(refresh);
}

export { batchEnabled as batchAutoFixEnabledForSelectedProject };
