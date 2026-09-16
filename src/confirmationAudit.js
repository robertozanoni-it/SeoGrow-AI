import { readWorkspaceJson as readJson, writeWorkspaceJson as writeJson } from "./core/workspace/jsonStorage.js";
import { apiFetch } from "./api.js";
import { normalizeSiteAnalysis } from "./seoResponseIntegrity.js";
import { normalizeHttpUrl } from "./reliabilityModel.js";
import { requiresDuplicateAudit } from "./metadataCorrectionVerification.js";

const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";
const SITE_HISTORY_KEY = "seogrow-analyses-v2";



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


const canonicalLike = (record) => /canonical/.test(`${findingType(record)} ${findingLabel(record)}`);
const normalizedCanonical = (value, base) => { try { return comparableUrl(new URL(value, base).href); } catch { return comparableUrl(value); } };

async function targetedFrontendDecision(record) {
  if (!canonicalLike(record)) return null;
  const response = await apiFetch("/api/frontend/inspect", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ url:record.sourceUrl }) });
  const data = await response.json();
  if (!response.ok) return { covered:false, stillPresent:true, resolved:false, note:`Verifica puntuale frontend non conclusa: ${data.error || "risposta non valida"}.` };
  const requested=comparableUrl(record.sourceUrl);
  const finalUrl=comparableUrl(data.url);
  const canonical=normalizedCanonical(data.canonical, data.url || record.sourceUrl);
  if (!data.isHtml) return { covered:true, stillPresent:false, resolved:true, frontend:data, note:"La URL non restituisce più una pagina HTML indicizzabile: il vecchio finding canonical viene chiuso senza modifiche." };
  if (finalUrl && finalUrl !== requested) return { covered:true, stillPresent:false, resolved:true, frontend:data, note:`La URL ora reindirizza a ${data.url}. Il vecchio finding canonical sulla URL originaria viene chiuso senza modifiche.` };
  if (data.canonicalCount === 1 && canonical === requested) return { covered:true, stillPresent:false, resolved:true, frontend:data, note:"Verifica frontend puntuale completata: la canonical è corretta e coincide con la URL finale. Nessuna modifica necessaria." };
  if (data.canonicalCount === 1 && canonical && canonical !== requested) return { covered:true, stillPresent:true, resolved:false, frontend:data, note:`Verifica frontend puntuale: canonical attuale ${data.canonical}; URL finale ${data.url}. Il finding è ancora presente e serve una decisione/correzione.` };
  return { covered:true, stillPresent:true, resolved:false, frontend:data, note:`Verifica frontend puntuale: canonical ${data.canonical || "non rilevata"}, occorrenze ${data.canonicalCount ?? "non disponibili"}. Il finding resta aperto.` };
}
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
  let stillPresent = findings.some((item) => sameFinding(record, item, audit));
  let covered = sourceCovered(record, audit, mode);
  let targeted = null;
  if (!covered) {
    targeted = await targetedFrontendDecision(record);
    if (targeted) { covered = targeted.covered; stillPresent = targeted.stillPresent; }
  }
  return {
    audit,
    mode,
    covered,
    stillPresent,
    resolved: covered && !stillPresent,
    targetedFrontend: targeted?.frontend || null,
    note: targeted?.note || (!covered
      ? "Audit automatico completato, ma la pagina interessata non è stata osservata con copertura sufficiente: la correzione resta da verificare."
      : stillPresent
        ? "Audit automatico completato: il finding originale è ancora presente e la correzione resta da verificare."
        : `Audit automatico ${mode === "site" ? "del sito" : "della pagina"} completato: il finding originale non è più rilevato.`),
  };
}
