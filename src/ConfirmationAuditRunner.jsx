import { useEffect, useRef } from "react";
import { apiFetch } from "./api.js";
import { workspaceStorage } from "./workspaceDatabase.js";
import { normalizeSiteAnalysis } from "./seoResponseIntegrity.js";
import { analysisDiff, normalizeAnalysisHistory, tasksFromAnalysis } from "./platform.js";
import { observedScoreDelta } from "./observedAuditData.js";
import { reconcileAuditTasks } from "./auditTaskReconciliation.js";
import { readCorrection, removeVerifiedTask, updateCorrection } from "./remediationStore.js";
import { navigatePage } from "./navigationUx.js";
import {
  CONFIRMATION_AUDIT_EVENT,
  CONFIRMATION_AUDIT_KEY,
  confirmationAuditIntent,
  confirmationAuditOutcome,
  confirmationAuditPolicy,
  confirmationAuditReady,
} from "./confirmationAuditPolicy.js";

const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";
const SITE_HISTORY_KEY = "seogrow-analyses-v2";
const TASKS_KEY = "seogrow-tasks-v2";
const FRONTEND_VERIFIED_EVENT = "seogrow-frontend-verification-complete";

const readJson = (key, fallback) => {
  try { return JSON.parse(workspaceStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const writeJson = (key, value) => {
  const serialized = JSON.stringify(value);
  workspaceStorage.setItem(key, serialized);
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: serialized }));
  window.dispatchEvent(new CustomEvent("seogrow-storage-ok", { detail: { key, value: serialized } }));
};
const selectedClientId = () => Number(readJson(SELECTED_CLIENT_KEY, 0));
const explicitConfirmationReady = (record) => Boolean(record?.id && record.status === "Da verificare" && record.lastVerificationAttemptAt && record.frontendFailure !== true && !record.confirmationAuditVerifiedAt);

export function requestConfirmationAudit(record, { navigate = true } = {}) {
  const explicit = navigate === true;
  if (!explicit && !confirmationAuditReady(record)) return false;
  if (explicit && !explicitConfirmationReady(record)) return false;
  const intent = confirmationAuditIntent(record);
  if (!intent || typeof window === "undefined") return false;
  const payload = { ...intent, navigate, explicit };
  try { sessionStorage.setItem(CONFIRMATION_AUDIT_KEY, JSON.stringify(payload)); } catch { return false; }
  if (navigate) navigatePage("Audit SEO");
  window.dispatchEvent(new CustomEvent(CONFIRMATION_AUDIT_EVENT, { detail: payload }));
  return true;
}

const saveAudit = (intent, data, client) => {
  const normalized = normalizeSiteAnalysis({ ...data, auditMode: intent.mode, analyzedAt: data.analyzedAt || new Date().toISOString() });
  if (intent.mode === "page") {
    const current = readJson(PAGE_HISTORY_KEY, {});
    writeJson(PAGE_HISTORY_KEY, { ...current, [intent.clientId]: [normalized, ...(current[intent.clientId] || [])].slice(0, 30) });
    return normalized;
  }
  const current = readJson(SITE_HISTORY_KEY, {});
  const previousHistory = normalizeAnalysisHistory(current[intent.clientId]);
  const previous = previousHistory[0];
  const diff = analysisDiff(normalized, previous);
  const scoreDelta = observedScoreDelta(normalized, previous);
  const enriched = { ...normalized, ...diff, scoreDelta, hasPrevious: scoreDelta !== null };
  writeJson(SITE_HISTORY_KEY, { ...current, [intent.clientId]: [enriched, ...previousHistory].slice(0, 20) });
  if (client) {
    const tasks = readJson(TASKS_KEY, []);
    const generated = tasksFromAnalysis(enriched, client);
    writeJson(TASKS_KEY, reconcileAuditTasks(tasks, generated, intent.clientId, enriched.analyzedAt));
  }
  return enriched;
};

export default function ConfirmationAuditRunner() {
  const running = useRef(new Set());

  useEffect(() => {
    let disposed = false;

    const finalize = async (intent, result) => {
      const current = await readCorrection(intent.correctionId);
      if (!current || Number(current.clientId) !== Number(intent.clientId) || selectedClientId() !== Number(intent.clientId)) return;
      const policy = confirmationAuditPolicy(current);
      const outcome = confirmationAuditOutcome(current, result, intent.mode);
      const at = result.analyzedAt || new Date().toISOString();
      const patch = outcome.confirmed
        ? { status: "Verificato", frontendConfirmed: true, frontendFailure: false, verifiedAt: at, confirmationAuditVerifiedAt: at, confirmationAuditState: "verified", confirmationAuditType: intent.mode, verificationNote: policy.successNote }
        : { status: "Da verificare", verifiedAt: "", confirmationAuditState: outcome.inconclusive ? "inconclusive" : "completed", confirmationAuditType: intent.mode, confirmationAuditLastAt: at, verificationNote: outcome.inconclusive ? `${outcome.reason} La correzione resta Da verificare.` : policy.stillPresentNote };
      const updated = await updateCorrection(current.id, patch);
      if (updated?.status === "Verificato") removeVerifiedTask(updated);
      window.dispatchEvent(new CustomEvent("seogrow-remediation-history", { detail: { id: current.id, confirmationAudit: true } }));
      window.dispatchEvent(new CustomEvent("seogrow-confirmation-audit-complete", { detail: { correctionId: current.id, outcome, result } }));
    };

    const runIntent = async (intent) => {
      if (disposed || !intent?.correctionId || running.current.has(intent.correctionId)) return;
      if (selectedClientId() !== Number(intent.clientId)) return;
      const record = await readCorrection(intent.correctionId);
      const ready = intent.explicit === true ? explicitConfirmationReady(record) : confirmationAuditReady(record);
      if (!record || Number(record.clientId) !== Number(intent.clientId) || !ready) return;
      running.current.add(record.id);
      const policy = confirmationAuditPolicy(record);
      try {
        await updateCorrection(record.id, { confirmationAuditState: "running", confirmationAuditStartedAt: new Date().toISOString(), verificationNote: policy.runningNote });
        window.dispatchEvent(new CustomEvent("seogrow-remediation-history", { detail: { id: record.id, confirmationAudit: "running" } }));
        const progressId = crypto.randomUUID();
        const response = await apiFetch(intent.mode === "site" ? "/api/site-analysis" : "/api/audit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(intent.mode === "site"
            ? { url: intent.startUrl, maxPages: Math.max(1, Math.min(200, Number(intent.maxPages) || 200)), progressId }
            : { url: intent.sourceUrl, progressId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Audit di conferma non riuscito");
        const client = readJson(CLIENTS_KEY, []).find((item) => Number(item?.id) === Number(intent.clientId)) || null;
        const saved = saveAudit(intent, data, client);
        await finalize(intent, saved);
        if (intent.navigate) navigatePage("Audit SEO");
      } catch (error) {
        const current = await readCorrection(intent.correctionId);
        if (current && Number(current.clientId) === Number(intent.clientId)) {
          await updateCorrection(current.id, { status: "Da verificare", verifiedAt: "", confirmationAuditState: "failed", confirmationAuditErrorAt: new Date().toISOString(), verificationNote: `Audit di conferma non completato: ${error.message}. Nessuna nuova modifica è stata applicata.` });
          window.dispatchEvent(new CustomEvent("seogrow-remediation-history", { detail: { id: current.id, confirmationAudit: "failed" } }));
        }
      } finally {
        running.current.delete(intent.correctionId);
        try {
          const queued = JSON.parse(sessionStorage.getItem(CONFIRMATION_AUDIT_KEY) || "null");
          if (queued?.correctionId === intent.correctionId) sessionStorage.removeItem(CONFIRMATION_AUDIT_KEY);
        } catch { sessionStorage.removeItem(CONFIRMATION_AUDIT_KEY); }
      }
    };

    const onRequest = (event) => {
      if (event?.detail) void runIntent(event.detail);
    };
    const onFrontendVerified = async (event) => {
      const correctionId = event?.detail?.correctionId;
      const clientId = Number(event?.detail?.clientId);
      if (!correctionId || !clientId || clientId !== selectedClientId()) return;
      const record = await readCorrection(correctionId);
      if (!record || !confirmationAuditReady(record)) return;
      const intent = confirmationAuditIntent(record);
      if (intent) void runIntent({ ...intent, navigate: false, explicit: false });
    };
    window.addEventListener(CONFIRMATION_AUDIT_EVENT, onRequest);
    window.addEventListener(FRONTEND_VERIFIED_EVENT, onFrontendVerified);

    // Only resume an audit explicitly queued by the current workflow. Do not scan
    // every pending correction on load/navigation: a saved "Da verificare" state
    // is not by itself permission to start network work in the background.
    const initial = window.setTimeout(() => {
      try {
        const queued = JSON.parse(sessionStorage.getItem(CONFIRMATION_AUDIT_KEY) || "null");
        if (queued && Date.now() - Number(queued.createdAt || 0) < 30 * 60 * 1000) void runIntent(queued);
        else sessionStorage.removeItem(CONFIRMATION_AUDIT_KEY);
      } catch { sessionStorage.removeItem(CONFIRMATION_AUDIT_KEY); }
    }, 250);

    return () => {
      disposed = true;
      window.clearTimeout(initial);
      window.removeEventListener(CONFIRMATION_AUDIT_EVENT, onRequest);
      window.removeEventListener(FRONTEND_VERIFIED_EVENT, onFrontendVerified);
    };
  }, []);

  return null;
}
