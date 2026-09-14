import { apiFetch } from "./api.js";
import { normalizeSiteAnalysis } from "./seoResponseIntegrity.js";
import { normalizeHttpUrl } from "./reliabilityModel.js";
import { workspaceStorage } from "./workspaceDatabase.js";
import { requiresDuplicateAudit } from "./metadataCorrectionVerification.js";

const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";
const SITE_HISTORY_KEY = "seogrow-analyses-v2";

const readJson = (key, fallback) => {
  try { return JSON.parse(workspaceStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

const writeJson = (key, value) => {
  const serialized = JSON.stringify(value);
  workspaceStorage.setItem(key, serialized);
  if (typeof window !== "undefined") window.dispatchEvent(new StorageEvent("storage", { key, newValue: serialized }));
};

const comparableUrl = (value) => normalizeHttpUrl(value || "", { stripSlash: true });
const findingType = (record) => String(record?.issueType || record?.issue?.type || "").trim().toLowerCase();
const findingLabel = (record) => String(record?.issueLabel || record?.issue?.label || "").trim().toLowerCase();
const findingUrl = (item, fallback = "") => item?.sourceUrl || item?.url || item?.targetUrl || fallback || "";

const sameFinding = (record, item, audit) => {
  const wantedType = findingType(record);
  const wantedLabel = findingLabel(record);
  const type = String(item?.type || "").trim().toLowerCase();
  const label = String(item?.label || item?.title || item?.type || "").trim().toLowerCase();
  const sourceMatches = comparableUrl(findingUrl(item, audit?.url)) === comparableUrl(record?.sourceUrl);
  if (!sourceMatches) return false;
  if (wantedType) return type === wantedType;
  return Boolean(wantedLabel && (label === wantedLabel || label.includes(wantedLabel) || wantedLabel.includes(label)));
};

const sourceCovered = (record, audit, mode) => {
  const wanted = comparableUrl(record?.sourceUrl);
  if (!wanted) return false;
  if (mode === "page") return comparableUrl(audit?.url || record?.sourceUrl) === wanted;
  return (Array.isArray(audit?.pages) ? audit.pages : []).some((page) => comparableUrl(page?.url) === wanted && page?.ok !== false);
};

const saveAudit = (record, audit, mode) => {
  const clientId = Number(record.clientId);
  const key = mode === "site" ? SITE_HISTORY_KEY : PAGE_HISTORY_KEY;
  const current = readJson(key, {});
  const history = Array.isArray(current[clientId]) ? current[clientId] : Array.isArray(current[String(clientId)]) ? current[String(clientId)] : [];
  writeJson(key, { ...current, [clientId]: [audit, ...history].slice(0, mode === "site" ? 20 : 30) });
};

const siteUrlFor = (record) => {
  if (record?.siteUrl) return record.siteUrl;
  try { return new URL(record.sourceUrl).origin + "/"; } catch { return ""; }
};

export async function runConfirmationAudit(record) {
  if (!record?.sourceUrl || !record?.clientId) throw new Error("Correzione senza URL o progetto: audit di conferma non avviato.");
  const mode = requiresDuplicateAudit(record) ? "site" : "page";
  const targetUrl = mode === "site" ? siteUrlFor(record) : record.sourceUrl;
  if (!targetUrl) throw new Error("URL del sito non disponibile per l’audit di conferma.");
  const startedAt = new Date().toISOString();
  const progressId = globalThis.crypto?.randomUUID?.() || `confirm-${Date.now()}`;
  const response = await apiFetch(mode === "site" ? "/api/site-analysis" : "/api/audit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(mode === "site" ? { url: targetUrl, maxPages: 75, progressId } : { url: targetUrl, progressId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Audit di conferma non riuscito.");
  const audit = normalizeSiteAnalysis({ ...data, auditMode: mode, startedAt, analyzedAt: data.analyzedAt || new Date().toISOString() });
  saveAudit(record, audit, mode);
  const findings = [...(Array.isArray(audit.issues) ? audit.issues : []), ...(Array.isArray(audit.reviewItems) ? audit.reviewItems : [])];
  const stillPresent = findings.some((item) => sameFinding(record, item, audit));
  const covered = sourceCovered(record, audit, mode);
  return {
    audit,
    mode,
    covered,
    stillPresent,
    resolved: covered && !stillPresent,
    note: !covered
      ? "Audit automatico completato, ma la pagina interessata non è stata osservata con copertura sufficiente: la correzione resta da verificare."
      : stillPresent
        ? "Audit automatico completato: il finding originale è ancora presente e la correzione resta da verificare."
        : `Audit automatico ${mode === "site" ? "del sito" : "della pagina"} completato: il finding originale non è più rilevato.`,
  };
}
