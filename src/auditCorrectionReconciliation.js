import { normalizeClientId, normalizeHttpUrl } from "./reliabilityModel.js";
import { requiresDuplicateAudit } from "./metadataCorrectionVerification.js";
import { listCorrections, removeVerifiedTask, updateCorrection } from "./remediationStore.js";
import { workspaceStorage } from "./workspaceDatabase.js";

const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";
const SITE_HISTORY_KEY = "seogrow-analyses-v2";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";

const urlKey = value => normalizeHttpUrl(value || "", { stripSlash: true });
const auditAt = result => result?.analyzedAt || result?.startedAt || "";
const findingType = item => String(item?.type || "").trim().toLowerCase();
const recordType = record => String(record?.issueType || record?.issue?.type || "").trim().toLowerCase();
const resultFindingSource = (item, result) => item?.sourceUrl || item?.url || item?.targetUrl || result?.url || "";

function auditCovers(record, resultType, result) {
  const wanted = urlKey(record?.sourceUrl);
  if (!wanted || !result) return false;
  if (resultType === "page") return urlKey(result.url) === wanted;
  if (resultType !== "site") return false;
  return (Array.isArray(result.pages) ? result.pages : []).some(page => urlKey(page?.url) === wanted && page?.ok !== false);
}

function findingStillPresent(record, result) {
  const wantedType = recordType(record);
  if (!wantedType) return true;
  return [
    ...(Array.isArray(result?.issues) ? result.issues : []),
    ...(Array.isArray(result?.reviewItems) ? result.reviewItems : []),
  ].some(item => findingType(item) === wantedType && urlKey(resultFindingSource(item, result)) === urlKey(record.sourceUrl));
}

const verificationNote = record => {
  const text = `${record?.issueType || ""} ${record?.issueLabel || ""}`.toLowerCase();
  if (/description-serp-width|larghezza serp|920\s*px/.test(text)) {
    return "Audit di conferma superato: la meta description pubblica è stata ricontrollata e il finding di larghezza SERP non è più presente.";
  }
  if (requiresDuplicateAudit(record)) {
    return "Audit di conferma superato: il nuovo crawl non rileva più il duplicato collegato a questa correzione.";
  }
  return "Audit di conferma superato: il finding originale non è più presente sulla pagina ricontrollata.";
};

export async function reconcileCorrectionsAfterAudit({ clientId, resultType, result } = {}) {
  const scope = normalizeClientId(clientId);
  if (!scope || !result) return [];
  const rows = await listCorrections({ clientId: scope });
  const completed = [];
  for (const record of rows) {
    if (!record?.id || record.frontendConfirmed !== true) continue;
    if (!["Applicato", "Da verificare"].includes(record.status)) continue;
    if (requiresDuplicateAudit(record) && resultType !== "site") continue;
    if (!auditCovers(record, resultType, result)) continue;
    const checkedAt = auditAt(result);
    if (!checkedAt || Date.parse(checkedAt) <= Date.parse(record.appliedAt || 0)) continue;
    if (findingStillPresent(record, result)) continue;

    const updated = await updateCorrection(record.id, {
      status: "Verificato",
      verifiedAt: checkedAt,
      frontendConfirmed: true,
      frontendFailure: false,
      lastVerificationAttemptAt: checkedAt,
      verificationNote: verificationNote(record),
      auditVerification: { type: resultType, url: result.url || "", analyzedAt: checkedAt },
    }, { expectedRecord: record });
    if (updated) {
      removeVerifiedTask(updated);
      completed.push(updated);
    }
  }
  return completed;
}

const selectedClientId = () => {
  try { return normalizeClientId(JSON.parse(workspaceStorage.getItem(SELECTED_CLIENT_KEY) || "null")); }
  catch { return null; }
};

const latestFromStore = (key, raw) => {
  try {
    const store = JSON.parse(raw ?? workspaceStorage.getItem(key) ?? "{}");
    const scope = selectedClientId();
    const rows = scope ? store?.[scope] ?? store?.[String(scope)] : null;
    return { scope, result: Array.isArray(rows) ? rows[0] || null : rows || null };
  } catch {
    return { scope: null, result: null };
  }
};

const reconcileFromStorageEvent = event => {
  const key = event?.key || event?.detail?.key;
  if (![PAGE_HISTORY_KEY, SITE_HISTORY_KEY].includes(key)) return;
  const raw = event?.newValue ?? event?.detail?.newValue;
  const { scope, result } = latestFromStore(key, raw);
  if (!scope || !result) return;
  const resultType = key === PAGE_HISTORY_KEY ? "page" : "site";
  void reconcileCorrectionsAfterAudit({ clientId: scope, resultType, result }).catch(error =>
    console.warn("Riconciliazione correzioni dopo audit non completata:", error),
  );
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", reconcileFromStorageEvent);
  window.addEventListener("seogrow-storage-ok", reconcileFromStorageEvent);
}
