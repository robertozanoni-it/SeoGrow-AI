export const RESOLUTION_PATH = Object.freeze({
  MONITOR: "L0-monitor",
  DIAGNOSE: "L1-diagnose",
  SAFE_AUTOFIX: "L2-safe-autofix",
  APPROVAL: "L3-approval",
  MANUAL: "manual",
});

const confidenceScore = (value) => ({ high: 3, medium: 2, low: 1 }[value] || 0);

export function decideResolutionPath({
  incident = {},
  diagnosis = incident.diagnosis || {},
  correctability = "",
  hasSafeAdapter = false,
  hasPreviewAdapter = false,
  reversible = false,
} = {}) {
  const recurrence = Math.max(Number(incident.occurrences || 1), Number(diagnosis.recurrence || 1));
  const confidence = confidenceScore(diagnosis.confidence);

  if (diagnosis.requiresHumanReview || incident.state === "blocked" || recurrence >= 5) {
    return { path: RESOLUTION_PATH.MANUAL, reason: "Root-cause review richiesta; AutoFix sospeso.", canExecute: false };
  }
  if (confidence <= 1 || diagnosis.diagnosisId === "unknown") {
    return { path: RESOLUTION_PATH.DIAGNOSE, reason: "Evidenza insufficiente per scegliere una modifica.", canExecute: false };
  }
  if (correctability === "not_supported" || correctability === "manual") {
    return { path: RESOLUTION_PATH.MANUAL, reason: "Nessun adapter automatico sicuro disponibile.", canExecute: false };
  }
  if (correctability === "automatic" && hasSafeAdapter && reversible && confidence >= 2) {
    return { path: RESOLUTION_PATH.SAFE_AUTOFIX, reason: "Adapter sicuro e reversibile con diagnosi sufficiente.", canExecute: true };
  }
  if (hasPreviewAdapter && confidence >= 2) {
    return { path: RESOLUTION_PATH.APPROVAL, reason: "Modifica preparabile in anteprima; approvazione obbligatoria.", canExecute: false };
  }
  if (incident.severity === "info") {
    return { path: RESOLUTION_PATH.MONITOR, reason: "Segnale informativo: monitoraggio senza modifica.", canExecute: false };
  }
  return { path: RESOLUTION_PATH.DIAGNOSE, reason: "Servono ulteriori evidenze o un adapter affidabile.", canExecute: false };
}
