import {
  CANONICAL_SUITE_PAGES,
  LEGACY_VIEW_OWNERS,
  OPERATIONAL_SUBVIEW_OWNERS,
  canonicalPageForLegacyView,
  validateFrozenProductArchitecture,
} from "../suite/productArchitecture.js";
import { resolvePageAlias } from "../core/modules/moduleRegistry.js";
import { readWorkspaceJson, writeWorkspaceJson } from "../core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "../core/workspace/storageKeys.js";
import { workspaceStorage } from "../workspaceDatabase.js";
import { reconcileTaskCauses } from "../taskCauseReconciliation.js";
import { classifyProblemSignal } from "./problemDetectionEngine.js";
import { installInteractionWatchdog } from "./interactionWatchdog.js";
import { diagnoseRootCause } from "./rootCauseDiagnosisEngine.js";
import { decideResolutionPath } from "./resolutionDecisionEngine.js";
import { classifyRecurrence, canonicalLifecycleKey } from "./recurrenceEngine.js";
import { dueMonitoringIncidents, monitoringPlan } from "./monitoringScheduler.js";

export const GUARDIAN_VERSION = "1.0.0";
export const GUARDIAN_INCIDENTS_KEY = "seogrow-guardian-incidents-v1";
export const GUARDIAN_SETTINGS_KEY = "seogrow-guardian-settings-v1";

export const GUARDIAN_RISK = Object.freeze({
  OBSERVE: "L0",
  DIAGNOSE: "L1",
  SAFE_AUTOFIX: "L2",
  APPROVAL_REQUIRED: "L3",
});

export const GUARDIAN_ACTIONS = Object.freeze({
  repairSelectedPage: Object.freeze({ id: "repair-selected-page", risk: GUARDIAN_RISK.SAFE_AUTOFIX, scope: "navigation" }),
  reconcileTaskCauses: Object.freeze({ id: "reconcile-task-causes", risk: GUARDIAN_RISK.SAFE_AUTOFIX, scope: "derived-task-state" }),
  compactGuardianLedger: Object.freeze({ id: "compact-guardian-ledger", risk: GUARDIAN_RISK.SAFE_AUTOFIX, scope: "guardian-ledger" }),
  wordpressWrite: Object.freeze({ id: "wordpress-write", risk: GUARDIAN_RISK.APPROVAL_REQUIRED, scope: "wordpress" }),
  customerContentMutation: Object.freeze({ id: "customer-content-mutation", risk: GUARDIAN_RISK.APPROVAL_REQUIRED, scope: "customer-content" }),
  workspaceRestore: Object.freeze({ id: "workspace-restore", risk: GUARDIAN_RISK.APPROVAL_REQUIRED, scope: "workspace" }),
});

const SAFE_SCOPES = new Set(["navigation", "derived-task-state", "guardian-ledger"]);
const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  autoFixSafe: true,
  intervalMs: 60_000,
  maxIncidents: 200,
});
const SEVERITY_WEIGHT = Object.freeze({ info: 1, warning: 4, error: 10, critical: 25 });
const MAX_MESSAGE = 600;
const RESOLVED_RETENTION = 100;
const recentResolvedProblems = new Map();

let installed = false;
let intervalId = 0;
let scheduledId = 0;
let runningPromise = null;
let lastScan = null;
let uninstallInteractionWatchdog = null;

const nowIso = () => new Date().toISOString();
const bounded = (value, max = MAX_MESSAGE) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const djb2 = (value) => {
  let hash = 5381;
  for (const character of String(value)) hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
  return (hash >>> 0).toString(36);
};

export const guardianFingerprint = ({ code = "UNKNOWN", source = "runtime", message = "" } = {}) =>
  `${bounded(code, 80)}:${bounded(source, 80)}:${djb2(bounded(message, 240).toLowerCase())}`;

export function canGuardianAutoFix(action) {
  return Boolean(
    action &&
    action.risk === GUARDIAN_RISK.SAFE_AUTOFIX &&
    SAFE_SCOPES.has(action.scope),
  );
}

export function normalizeGuardianPage(page) {
  const value = String(page || "").trim();
  if (!value) return null;
  if (CANONICAL_SUITE_PAGES.includes(value) || Object.hasOwn(OPERATIONAL_SUBVIEW_OWNERS, value)) return value;
  const legacy = canonicalPageForLegacyView(value);
  const aliased = resolvePageAlias(legacy);
  if (CANONICAL_SUITE_PAGES.includes(aliased)) return aliased;
  return null;
}

export function selectedPageRepair(page) {
  const value = String(page || "").trim();
  if (!value) return { changed: true, from: value, to: "Panoramica", reason: "missing" };
  if (CANONICAL_SUITE_PAGES.includes(value) || Object.hasOwn(OPERATIONAL_SUBVIEW_OWNERS, value)) {
    return { changed: false, from: value, to: value, reason: "valid" };
  }
  const mapped = normalizeGuardianPage(value);
  if (mapped) {
    const reason = Object.hasOwn(LEGACY_VIEW_OWNERS, value) ? "legacy" : "alias";
    return { changed: mapped !== value, from: value, to: mapped, reason };
  }
  return { changed: true, from: value, to: "Panoramica", reason: "invalid" };
}

const incidentStore = (storage = workspaceStorage) => readWorkspaceJson(GUARDIAN_INCIDENTS_KEY, [], storage);
const settingsStore = (storage = workspaceStorage) => ({
  ...DEFAULT_SETTINGS,
  ...readWorkspaceJson(GUARDIAN_SETTINGS_KEY, {}, storage),
});

export function guardianSettings(storage = workspaceStorage) {
  const settings = settingsStore(storage);
  return {
    ...settings,
    intervalMs: Math.max(15_000, Math.min(10 * 60_000, Number(settings.intervalMs) || DEFAULT_SETTINGS.intervalMs)),
    maxIncidents: Math.max(50, Math.min(500, Number(settings.maxIncidents) || DEFAULT_SETTINGS.maxIncidents)),
  };
}

const dispatchGuardianUpdate = (detail = {}) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("seogrow-guardian-updated", { detail }));
};

export function listGuardianIncidents(storage = workspaceStorage) {
  const rows = incidentStore(storage);
  return Array.isArray(rows) ? rows : [];
}

export function recordGuardianIncident(input, storage = workspaceStorage) {
  const settings = guardianSettings(storage);
  const timestamp = input.at || nowIso();
  const fingerprint = input.fingerprint || guardianFingerprint(input);
  const rows = listGuardianIncidents(storage);
  const existingIndex = rows.findIndex((row) => row?.fingerprint === fingerprint && row?.state !== "resolved");
  let incident;
  let next;

  if (existingIndex >= 0) {
    incident = {
      ...rows[existingIndex],
      severity: input.severity || rows[existingIndex].severity || "warning",
      risk: input.risk || rows[existingIndex].risk || GUARDIAN_RISK.DIAGNOSE,
      message: bounded(input.message || rows[existingIndex].message),
      detail: bounded(input.detail || rows[existingIndex].detail),
      action: input.action || rows[existingIndex].action || "",
      diagnosis: input.diagnosis || rows[existingIndex].diagnosis || null,
      resolution: input.resolution || rows[existingIndex].resolution || null,
      recurrence: input.recurrence || rows[existingIndex].recurrence || null,
      lifecycleKey: input.lifecycleKey || rows[existingIndex].lifecycleKey || canonicalLifecycleKey(input.clientId, fingerprint),
      lastSeenAt: timestamp,
      occurrences: Number(rows[existingIndex].occurrences || 1) + 1,
      state: input.state || rows[existingIndex].state || "open",
    };
    next = rows.map((row, index) => index === existingIndex ? incident : row);
  } else {
    incident = {
      id: input.id || `guardian-${timestamp.replace(/\D/g, "").slice(0, 14)}-${djb2(fingerprint)}`,
      fingerprint,
      code: bounded(input.code || "UNKNOWN", 80),
      source: bounded(input.source || "runtime", 80),
      severity: input.severity || "warning",
      risk: input.risk || GUARDIAN_RISK.DIAGNOSE,
      state: input.state || "open",
      message: bounded(input.message || "Anomalia rilevata"),
      detail: bounded(input.detail || ""),
      action: bounded(input.action || "", 120),
      diagnosis: input.diagnosis || null,
      resolution: input.resolution || null,
      recurrence: input.recurrence || null,
      lifecycleKey: input.lifecycleKey || canonicalLifecycleKey(input.clientId, fingerprint),
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      occurrences: 1,
      resolvedAt: "",
      verification: "",
    };
    next = [...rows, incident];
  }

  const open = next.filter((row) => row?.state !== "resolved");
  const resolved = next.filter((row) => row?.state === "resolved")
    .toSorted((a, b) => Date.parse(b.resolvedAt || b.lastSeenAt || 0) - Date.parse(a.resolvedAt || a.lastSeenAt || 0))
    .slice(0, RESOLVED_RETENTION);
  const limited = [...open, ...resolved].slice(-settings.maxIncidents);
  writeWorkspaceJson(GUARDIAN_INCIDENTS_KEY, limited, storage);
  dispatchGuardianUpdate({ type: "incident", incident });
  return incident;
}

export function resolveGuardianIncident(fingerprint, verification = "", storage = workspaceStorage) {
  const rows = listGuardianIncidents(storage);
  let resolved = null;
  const timestamp = nowIso();
  const next = rows.map((row) => {
    if (row?.fingerprint !== fingerprint || row?.state === "resolved") return row;
    resolved = {
      ...row,
      state: "resolved",
      resolvedAt: timestamp,
      lastSeenAt: timestamp,
      verification: bounded(verification || "Verifica post-fix completata."),
    };
    return resolved;
  });
  if (resolved) {
    writeWorkspaceJson(GUARDIAN_INCIDENTS_KEY, next, storage);
    dispatchGuardianUpdate({ type: "resolved", incident: resolved });
  }
  return resolved;
}

const incidentForError = (code, source, error, extras = {}) => recordGuardianIncident({
  code,
  source,
  severity: extras.severity || "error",
  risk: extras.risk || GUARDIAN_RISK.DIAGNOSE,
  state: extras.state || "open",
  action: extras.action || "",
  message: bounded(error?.message || error || "Errore non specificato"),
  detail: extras.detail || "",
});


const detectAndRecordSignal = (input) => {
  const fingerprint = input.fingerprint || guardianFingerprint(input);
  const history = listGuardianIncidents();
  const classification = classifyProblemSignal({ ...input, fingerprint }, history);
  if (!classification.accepted) return null;
  const diagnosis = diagnoseRootCause({ ...input, fingerprint, occurrences: classification.occurrences }, history);
  const resolution = decideResolutionPath({
    incident: { ...input, occurrences: classification.occurrences, state: classification.rootCauseReviewRequired ? "blocked" : input.state },
    diagnosis,
    correctability: input.correctability || (input.autoFixEligible ? "automatic" : ""),
    hasSafeAdapter: input.hasSafeAdapter === true,
    hasPreviewAdapter: input.hasPreviewAdapter === true,
    reversible: input.reversible === true,
    recurrence,
  });
  const incident = recordGuardianIncident({
    ...input,
    fingerprint,
    severity: classification.severity,
    diagnosis,
    resolution,
    recurrence,
    lifecycleKey: canonicalLifecycleKey(input.clientId, fingerprint),
    state: classification.rootCauseReviewRequired ? "blocked" : (input.state || "open"),
    action: classification.rootCauseReviewRequired ? "root-cause-review" : (input.action || ""),
    detail: [
      input.detail || "",
      classification.repeatedAfterResolution ? "Problema ricomparso dopo una precedente risoluzione verificata." : "",
      classification.rootCauseReviewRequired ? `Ricorrenza: ${classification.occurrences} occorrenze. AutoFix ripetitivo sospeso; richiesta analisi causa radice.` : "",
    ].filter(Boolean).join(" "),
  });
  dispatchGuardianUpdate({ type: "detected-problem", incident, classification, diagnosis, resolution, recurrence });
  return { incident, classification, diagnosis, resolution, recurrence };
};

const ARCHITECTURE_DRIFT_FINGERPRINT = guardianFingerprint({
  code: "ARCHITECTURE_DRIFT",
  source: "suite",
  message: "Frozen architecture invariant failed",
});

async function checkArchitecture() {
  try {
    validateFrozenProductArchitecture();
    resolveGuardianIncident(ARCHITECTURE_DRIFT_FINGERPRINT, "I 14 moduli canonici e le relative ownership risultano coerenti.");
    return { id: "architecture", ok: true, changed: false };
  } catch (error) {
    recordGuardianIncident({
      fingerprint: ARCHITECTURE_DRIFT_FINGERPRINT,
      code: "ARCHITECTURE_DRIFT",
      source: "suite",
      severity: "critical",
      risk: GUARDIAN_RISK.APPROVAL_REQUIRED,
      state: "blocked",
      action: "review-architecture-drift",
      message: bounded(error?.message || error || "Invariante architettura non valida"),
    });
    return { id: "architecture", ok: false, changed: false, error };
  }
}

function checkSelectedPage(settings) {
  const raw = (() => {
    try { return JSON.parse(workspaceStorage.getItem(WORKSPACE_KEYS.selectedPage) || "null"); }
    catch { return null; }
  })();
  const repair = selectedPageRepair(raw);
  if (!repair.changed) return { id: "selected-page", ok: true, changed: false };

  const incident = recordGuardianIncident({
    code: "INVALID_SELECTED_PAGE",
    source: "navigation",
    severity: "warning",
    risk: GUARDIAN_RISK.SAFE_AUTOFIX,
    state: settings.autoFixSafe ? "open" : "approval_required",
    action: GUARDIAN_ACTIONS.repairSelectedPage.id,
    message: `Vista salvata non valida: “${repair.from || "vuota"}”.`,
    detail: `Destinazione sicura proposta: ${repair.to} (${repair.reason}).`,
  });

  if (!settings.autoFixSafe || !canGuardianAutoFix(GUARDIAN_ACTIONS.repairSelectedPage)) {
    return { id: "selected-page", ok: false, changed: false, incident };
  }

  writeWorkspaceJson(WORKSPACE_KEYS.selectedPage, repair.to);
  const verified = (() => {
    try { return JSON.parse(workspaceStorage.getItem(WORKSPACE_KEYS.selectedPage) || "null") === repair.to; }
    catch { return false; }
  })();
  if (verified) {
    resolveGuardianIncident(incident.fingerprint, `Vista ripristinata e riletta come ${repair.to}.`);
    return { id: "selected-page", ok: true, changed: true, repairedTo: repair.to };
  }
  return { id: "selected-page", ok: false, changed: true, error: new Error("La vista riparata non è stata persistita.") };
}

async function checkTaskCauses(settings) {
  if (!settings.autoFixSafe || !canGuardianAutoFix(GUARDIAN_ACTIONS.reconcileTaskCauses)) {
    return { id: "task-causes", ok: true, changed: false, skipped: true };
  }
  try {
    const result = await reconcileTaskCauses();
    if (!result.changed) return { id: "task-causes", ok: true, changed: false };
    const incident = recordGuardianIncident({
      code: "TASK_CAUSE_DRIFT",
      source: "tasks",
      severity: "warning",
      risk: GUARDIAN_RISK.SAFE_AUTOFIX,
      action: GUARDIAN_ACTIONS.reconcileTaskCauses.id,
      message: "Task non allineati allo stato canonico di problemi/correzioni.",
      detail: `Riconciliazione deterministica eseguita su ${result.clients} progetti.`,
    });
    resolveGuardianIncident(incident.fingerprint, "Riconciliazione completata usando il modello canonico Task/Problemi/Correzioni.");
    return { id: "task-causes", ok: true, changed: true };
  } catch (error) {
    incidentForError("TASK_RECONCILIATION_FAILED", "tasks", error, {
      severity: "error",
      risk: GUARDIAN_RISK.DIAGNOSE,
      action: "inspect-task-reconciliation",
    });
    return { id: "task-causes", ok: false, changed: false, error };
  }
}

async function checkLocalApi() {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return { id: "local-api", ok: true, skipped: true };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);
  const fingerprint = guardianFingerprint({ code: "LOCAL_API_UNHEALTHY", source: "api", message: "Local API health check failed" });
  try {
    const response = await window.fetch("/api/health", { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) throw new Error(data?.error || `Health endpoint HTTP ${response.status}`);
    resolveGuardianIncident(fingerprint, `API locale disponibile${data.version ? ` (v${data.version})` : ""}.`);
    return { id: "local-api", ok: true, changed: false, version: data.version || "" };
  } catch (error) {
    recordGuardianIncident({
      fingerprint,
      code: "LOCAL_API_UNHEALTHY",
      source: "api",
      severity: "error",
      risk: GUARDIAN_RISK.DIAGNOSE,
      action: "inspect-local-api",
      message: "API locale non raggiungibile o health check negativo.",
      detail: bounded(error?.message || error),
    });
    return { id: "local-api", ok: false, changed: false, error };
  } finally {
    window.clearTimeout(timeout);
  }
}

export function guardianHealthScore(incidents = listGuardianIncidents()) {
  const open = incidents.filter((row) => row?.state !== "resolved");
  const penalty = open.reduce((total, row) => total + (SEVERITY_WEIGHT[row?.severity] || 4), 0);
  return Math.max(0, 100 - Math.min(100, penalty));
}

export function guardianSnapshot(storage = workspaceStorage) {
  const incidents = listGuardianIncidents(storage);
  const open = incidents.filter((row) => row?.state !== "resolved");
  const approvalRequired = open.filter((row) => row?.risk === GUARDIAN_RISK.APPROVAL_REQUIRED || row?.state === "approval_required" || row?.state === "blocked");
  const autoResolved = incidents.filter((row) => row?.state === "resolved" && row?.risk === GUARDIAN_RISK.SAFE_AUTOFIX);
  return {
    version: GUARDIAN_VERSION,
    installed,
    score: guardianHealthScore(incidents),
    lastScan,
    incidents,
    open,
    approvalRequired,
    autoResolved,
  };
}

export async function runGuardianScan({ trigger = "manual" } = {}) {
  if (runningPromise) return runningPromise;
  runningPromise = (async () => {
    const settings = guardianSettings();
    if (!settings.enabled) return guardianSnapshot();
    const startedAt = nowIso();
    const results = [];
    results.push(await checkArchitecture());
    results.push(checkSelectedPage(settings));
    results.push(await checkTaskCauses(settings));
    results.push(await checkLocalApi());
    const completedAt = nowIso();
    lastScan = {
      trigger,
      startedAt,
      completedAt,
      checks: results.length,
      failed: results.filter((item) => item.ok === false).length,
      changed: results.filter((item) => item.changed === true).length,
    };
    dispatchGuardianUpdate({ type: "scan", scan: lastScan });
    return { ...guardianSnapshot(), results };
  })().finally(() => { runningPromise = null; });
  return runningPromise;
}

const scheduleScan = (trigger, delay = 400) => {
  if (typeof window === "undefined") return;
  if (scheduledId) window.clearTimeout(scheduledId);
  scheduledId = window.setTimeout(() => {
    scheduledId = 0;
    runGuardianScan({ trigger }).catch((error) => incidentForError("GUARDIAN_SCAN_FAILED", "guardian", error));
  }, delay);
};

const rememberResolvedProblem = (event) => {
  const key = event?.detail?.issueKey || event?.detail?.id;
  if (!key) return;
  recentResolvedProblems.set(String(key), Date.now());
  while (recentResolvedProblems.size > 50) recentResolvedProblems.delete(recentResolvedProblems.keys().next().value);
};

const detectPrematureReopen = (event) => {
  const key = event?.detail?.issueKey || event?.detail?.id;
  if (!key) return;
  const resolvedAt = recentResolvedProblems.get(String(key));
  if (!resolvedAt || Date.now() - resolvedAt > 5 * 60_000) return;
  recordGuardianIncident({
    code: "PROBLEM_REOPENED_AFTER_VERIFICATION",
    source: "problems",
    severity: "error",
    risk: GUARDIAN_RISK.DIAGNOSE,
    action: "inspect-problem-cause",
    message: "Un problema appena verificato è ricomparso.",
    detail: `Issue: ${bounded(key, 120)}. Guardian non la richiude automaticamente: va verificata la causa canonica.`,
  });
};

export function installGuardianRuntime() {
  if (typeof window === "undefined" || installed) return guardianSnapshot();
  installed = true;

  window.addEventListener("error", (event) => {
    detectAndRecordSignal({ code: "RUNTIME_ERROR", source: "browser", severity: "error", risk: GUARDIAN_RISK.DIAGNOSE, message: bounded(event?.error?.message || event?.message || "Errore runtime") });
  });
  window.addEventListener("unhandledrejection", (event) => {
    detectAndRecordSignal({ code: "UNHANDLED_REJECTION", source: "browser", severity: "error", risk: GUARDIAN_RISK.DIAGNOSE, message: bounded(event?.reason?.message || event?.reason || "Promise rifiutata senza gestione") });
  });
  window.addEventListener("seogrow-storage-error", (event) => {
    detectAndRecordSignal({
      code: "WORKSPACE_WRITE_FAILED",
      source: "workspace",
      severity: "critical",
      risk: GUARDIAN_RISK.APPROVAL_REQUIRED,
      state: "blocked",
      action: "preserve-and-recover-workspace",
      message: "Scrittura workspace fallita: Guardian ha bloccato l'auto-riparazione distruttiva.",
      detail: bounded(event?.detail?.message || ""),
    });
  });
  window.addEventListener("seogrow-audit-problem-detected", (event) => {
    const detail = event?.detail || {};
    detectAndRecordSignal({
      fingerprint: detail.fingerprint,
      code: detail.code || "AUDIT_ISSUE",
      source: "audit",
      severity: detail.severity || "warning",
      risk: detail.autoFixEligible ? GUARDIAN_RISK.SAFE_AUTOFIX : GUARDIAN_RISK.DIAGNOSE,
      message: bounded(detail.message || "Problema rilevato dall'Audit SEO"),
      detail: bounded(detail.detail || ""),
      autoFixEligible: detail.autoFixEligible === true,
      clientId: detail.clientId,
      observedAt: detail.observedAt,
      changedAt: detail.changedAt,
      deployAt: detail.deployAt,
      correctionAt: detail.correctionAt,
      auditIssue: detail.auditIssue,
    });
  });
  window.addEventListener("seogrow-action-failed", (event) => {
    const detail = event?.detail || {};
    detectAndRecordSignal({
      code: detail.code || "ACTION_FAILED",
      source: detail.source || "interaction",
      severity: detail.severity || "warning",
      risk: GUARDIAN_RISK.DIAGNOSE,
      message: bounded(detail.message || "Un'azione dell'interfaccia non è stata completata."),
      detail: bounded(detail.detail || ""),
      autoFixEligible: false,
    });
  });
  window.addEventListener("seogrow-integration-failed", (event) => {
    const detail = event?.detail || {};
    detectAndRecordSignal({
      code: detail.code || "INTEGRATION_FAILED",
      source: detail.integration || detail.source || "integration",
      severity: detail.severity || "error",
      risk: GUARDIAN_RISK.DIAGNOSE,
      message: bounded(detail.message || "Integrazione non disponibile."),
      detail: bounded(detail.detail || ""),
      autoFixEligible: false,
    });
  });
  window.addEventListener("seogrow-post-fix-verified", (event) => {
    const detail = event?.detail || {};
    const fingerprint = String(detail.fingerprint || "");
    if (!fingerprint || detail.verification?.canClose !== true) return;
    const resolved = resolveGuardianIncident(
      fingerprint,
      detail.verification?.reason || "Verifica post-fix PASS: problema assente al nuovo Audit.",
    );
    if (!resolved) return;
    rememberResolvedProblem({ detail: { issueKey: fingerprint } });
    dispatchGuardianUpdate({ type: "post-fix-verified", incident: resolved, verification: detail.verification });
    window.dispatchEvent(new CustomEvent("seogrow-problem-resolved", {
      detail: {
        id: resolved.id,
        issueKey: fingerprint,
        fingerprint,
        clientId: detail.correction?.clientId,
        issueType: detail.issue?.type || detail.correction?.issueType || "",
        sourceUrl: detail.issue?.sourceUrl || detail.issue?.url || detail.correction?.sourceUrl || "",
        verifiedAt: detail.verification?.verification?.at || new Date().toISOString(),
      },
    }));
  });
  window.addEventListener("seogrow-problem-resolved", rememberResolvedProblem);
  window.addEventListener("seogrow-problem-reopened", detectPrematureReopen);
  window.addEventListener("seogrow-remediation-applied", () => scheduleScan("remediation-applied", 900));
  window.addEventListener("seogrow-task-cause-reconciled", () => scheduleScan("task-reconciled", 900));
  window.addEventListener("storage", (event) => {
    if ([WORKSPACE_KEYS.selectedPage, WORKSPACE_KEYS.tasks, WORKSPACE_KEYS.problemClosures].includes(event?.key)) scheduleScan("workspace-change", 700);
  });
  window.addEventListener("seogrow-guardian-run-request", () => scheduleScan("requested", 0));
  uninstallInteractionWatchdog = installInteractionWatchdog();

  const settings = guardianSettings();
  scheduleScan("startup", 1_200);
  intervalId = window.setInterval(() => runGuardianScan({ trigger: "interval" }).catch((error) => {
    incidentForError("GUARDIAN_SCAN_FAILED", "guardian", error);
  }), settings.intervalMs);

  dispatchGuardianUpdate({ type: "installed", version: GUARDIAN_VERSION });
  return guardianSnapshot();
}

export function uninstallGuardianRuntimeForTests() {
  if (typeof window !== "undefined") {
    if (intervalId) window.clearInterval(intervalId);
    if (scheduledId) window.clearTimeout(scheduledId);
  }
  uninstallInteractionWatchdog?.();
  uninstallInteractionWatchdog = null;
  intervalId = 0;
  scheduledId = 0;
  installed = false;
}
export function guardianMonitoringQueue(now = Date.now()) {
  return dueMonitoringIncidents(listGuardianIncidents(), now);
}

export function markGuardianMonitored(fingerprint, result = {}, now = new Date().toISOString()) {
  const rows = listGuardianIncidents();
  const index = rows.findIndex(row => row.fingerprint === fingerprint);
  if (index < 0) return null;
  rows[index] = {
    ...rows[index],
    lastMonitoredAt: now,
    lastMonitoringResult: result,
    monitoring: monitoringPlan({ incident: { ...rows[index], lastMonitoredAt: now }, now: Date.parse(now) || Date.now() }),
  };
  writeIncidents(rows);
  dispatchGuardianUpdate({ type: "monitoring-completed", incident: rows[index], result });
  return rows[index];
}

export function runDueGuardianMonitoring(now = Date.now()) {
  const queue = guardianMonitoringQueue(now);
  if (typeof window !== "undefined") for (const item of queue) {
    window.dispatchEvent(new CustomEvent("seogrow-guardian-monitoring-due", {
      detail: { fingerprint: item.incident.fingerprint, clientId: item.incident.clientId, plan: item.plan },
    }));
  }
  return queue;
}


