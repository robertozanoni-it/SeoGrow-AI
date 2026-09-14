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

const setReactValue = (element, value) => {
  if (!element) return false;
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) return false;
  setter.call(element, String(value));
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  return true;
};

export function launchVerificationAudit(plan, navigatePage) {
  if (!plan || typeof window === "undefined" || typeof document === "undefined" || typeof navigatePage !== "function") return false;
  if (!queueVerificationAudit(plan)) return false;
  navigatePage("Audit SEO");

  const deadline = Date.now() + 6000;
  const tryLaunch = () => {
    if (Date.now() > deadline) return;
    const root = document.querySelector(".audit-enhancer-root");
    const launcher = root?.querySelector(".reference-audit-launcher");
    const form = launcher?.querySelector("form.site-analysis-form");
    if (!launcher || !form) {
      window.setTimeout(tryLaunch, 80);
      return;
    }

    const modeCards = [...launcher.querySelectorAll(".audit-mode-card")];
    const wantedLabel = plan.mode === "site" ? "Analizza tutto il sito" : "Analizza questa pagina";
    const wantedCard = modeCards.find(card => card.textContent?.includes(wantedLabel));
    if (wantedCard && !wantedCard.classList.contains("active")) wantedCard.click();

    window.setTimeout(() => {
      const liveForm = document.querySelector(".reference-audit-launcher form.site-analysis-form");
      const input = liveForm?.querySelector('input[type="url"]');
      if (!liveForm || !input || !setReactValue(input, plan.url)) {
        window.setTimeout(tryLaunch, 80);
        return;
      }
      if (plan.mode === "site") {
        const select = liveForm.querySelector("select");
        if (select) setReactValue(select, plan.maxPages || 75);
      }
      try { sessionStorage.removeItem(CONFIRMATION_AUDIT_KEY); } catch { /* optional */ }
      liveForm.requestSubmit();
    }, 80);
  };
  window.setTimeout(tryLaunch, 80);
  return true;
}
