import { normalizeClientId, safeHttpHref } from "./reliabilityModel.js";
import { requiresDuplicateAudit } from "./metadataCorrectionVerification.js";

export const CONFIRMATION_AUDIT_KEY = "seogrow-confirmation-audit-v1";

const issueText = (record = {}) => `${record.issueType || ""} ${record.issueLabel || ""} ${record.issue?.type || ""} ${record.issue?.label || ""}`.toLowerCase();

export function verificationAuditPlan(record = {}, clientUrl = "") {
  const clientId = normalizeClientId(record.clientId);
  const sourceUrl = safeHttpHref(record.sourceUrl);
  if (!clientId || !sourceUrl || record.frontendConfirmed !== true || ["Verificato", "Ripristinato", "Bloccato"].includes(record.status)) return null;

  const text = issueText(record);
  const duplicate = requiresDuplicateAudit(record);
  const serpWidth = /description-serp-width|larghezza serp|920\s*px/.test(text);
  const mode = duplicate ? "site" : "page";
  const siteUrl = safeHttpHref(clientUrl) || (() => { try { return new URL(sourceUrl).origin + "/"; } catch { return ""; } })();

  return {
    clientId,
    correctionId: record.id || "",
    issueType: record.issueType || record.issue?.type || "",
    sourceUrl,
    mode,
    url: mode === "site" ? siteUrl : sourceUrl,
    maxPages: mode === "site" ? 75 : 1,
    label: "Esegui audit di conferma",
    reason: duplicate
      ? "La correzione è visibile nel frontend, ma un duplicato si chiude solo con un nuovo crawl che confronti le pagine coinvolte."
      : serpWidth
        ? "La correzione è visibile nel frontend. Il nuovo audit deve confermare che la meta description non superi più la soglia SERP stimata di 920px."
        : "La correzione è visibile nel frontend. Un nuovo audit della pagina deve confermare che il finding originale non sia più presente.",
    createdAt: Date.now(),
  };
}

export function queueVerificationAudit(plan) {
  if (!plan || typeof sessionStorage === "undefined") return false;
  try {
    sessionStorage.setItem(CONFIRMATION_AUDIT_KEY, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}

export function consumeVerificationAudit(clientId) {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CONFIRMATION_AUDIT_KEY);
    if (!raw) return null;
    const plan = JSON.parse(raw);
    if (normalizeClientId(plan?.clientId) !== normalizeClientId(clientId) || Date.now() - Number(plan?.createdAt || 0) > 30 * 60 * 1000) {
      sessionStorage.removeItem(CONFIRMATION_AUDIT_KEY);
      return null;
    }
    sessionStorage.removeItem(CONFIRMATION_AUDIT_KEY);
    return plan;
  } catch {
    sessionStorage.removeItem(CONFIRMATION_AUDIT_KEY);
    return null;
  }
}
