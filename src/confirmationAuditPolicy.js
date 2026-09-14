import { normalizeHttpUrl, safeHttpHref } from "./reliabilityModel.js";

export const CONFIRMATION_AUDIT_KEY = "seogrow-confirmation-audit-v1";
export const CONFIRMATION_AUDIT_EVENT = "seogrow-confirmation-audit";

const issueText = (record = {}) => `${record.issueType || ""} ${record.issueLabel || ""} ${record.issue?.type || ""} ${record.issue?.label || ""}`.toLowerCase();
const normalizedUrl = (value) => normalizeHttpUrl(value || "", { stripSlash: true });
const duplicateFinding = (text) => /duplicate[-_ ](?:title|description)|(?:title|titolo|meta description|descrizione)\s+duplicat/i.test(text);

export function confirmationAuditPolicy(record = {}) {
  const text = issueText(record);
  if (/description-serp-width|meta description.*(?:larga|snippet)|920\s*px/.test(text)) return {
    mode: "page",
    maxPages: 1,
    label: "Esegui audit di conferma",
    frontendMatchedNote: "Il valore di meta description nel codice HTML pubblico coincide con quello inviato a WordPress. SeoGrow deve ora eseguire un audit mirato della pagina per verificare che la larghezza SERP stimata non superi 920px.",
    runningNote: "Audit mirato della pagina in corso: SeoGrow verifica nuovamente la larghezza SERP stimata della meta description.",
    successNote: "Audit di conferma completato: il finding sulla larghezza SERP della meta description non è più presente.",
    stillPresentNote: "L’audit di conferma rileva ancora la meta description oltre la larghezza SERP stimata prevista. La correzione resta Da verificare.",
    help: "Per chiudere questo finding SeoGrow deve verificare la larghezza SERP stimata della meta description; non serve un controllo duplicati se il finding originale riguarda solo la larghezza dello snippet.",
  };
  if (duplicateFinding(text)) return {
    mode: "site",
    maxPages: 200,
    label: "Esegui crawl di conferma",
    frontendMatchedNote: "Il valore pubblicato coincide con quello inviato a WordPress. Per confermare la risoluzione del duplicato serve un nuovo crawl che confronti le pagine del sito.",
    runningNote: "Crawl di conferma in corso: SeoGrow verifica che il duplicato non sia più presente nel sito.",
    successNote: "Crawl di conferma completato: il duplicato non è più presente nelle pagine controllate.",
    stillPresentNote: "Il crawl di conferma rileva ancora il duplicato. La correzione resta Da verificare.",
    help: "I duplicati richiedono un crawl del sito: la sola corrispondenza del valore sul frontend non dimostra l’unicità tra pagine diverse.",
  };
  if (/canonical/.test(text)) return {
    mode: "page",
    maxPages: 1,
    label: "Esegui audit canonical",
    frontendMatchedNote: "La canonical pubblica coincide con il valore applicato. SeoGrow deve ora rieseguire l’audit della pagina per confermare URL finale, canonical e stato di indicizzazione.",
    runningNote: "Audit canonical in corso: SeoGrow confronta URL finale e canonical pubblica.",
    successNote: "Audit canonical completato: il finding originale non è più presente.",
    stillPresentNote: "L’audit rileva ancora il finding canonical. La correzione resta Da verificare.",
    help: "La canonical viene chiusa solo dopo un audit recente della stessa URL; una vecchia osservazione non autorizza una nuova scrittura.",
  };
  if (/noindex|indexability|robots|indicizz/.test(text)) return {
    mode: "page",
    maxPages: 1,
    label: "Verifica indicizzazione",
    frontendMatchedNote: "La direttiva pubblica coincide con il valore applicato. SeoGrow deve ora rieseguire l’audit della pagina per confermare lo stato di indicizzazione.",
    runningNote: "Audit di indicizzazione in corso: SeoGrow ricontrolla robots, noindex, canonical e URL finale.",
    successNote: "Audit di indicizzazione completato: il finding originale non è più presente.",
    stillPresentNote: "L’audit rileva ancora il finding di indicizzazione. La correzione resta Da verificare.",
    help: "Le direttive di indicizzazione richiedono un audit recente della stessa URL dopo la modifica.",
  };
  if (/\bh1\b/.test(text)) return {
    mode: "page",
    maxPages: 1,
    label: "Esegui audit H1",
    frontendMatchedNote: "Il frontend mostra la struttura H1 attesa. SeoGrow deve ora rieseguire l’audit della pagina per confermare il finding SEO.",
    runningNote: "Audit H1 in corso: SeoGrow ricontrolla la struttura della pagina.",
    successNote: "Audit H1 completato: il finding originale non è più presente.",
    stillPresentNote: "L’audit rileva ancora il finding H1. La correzione resta Da verificare.",
    help: "La verifica frontend e l’audit restano separati: il finding H1 viene chiuso solo con evidenza recente.",
  };
  return {
    mode: "page",
    maxPages: 1,
    label: "Esegui audit di conferma",
    frontendMatchedNote: "Il valore pubblicato coincide con quello applicato. SeoGrow deve ora rieseguire un audit mirato per confermare che il finding originale non sia più presente.",
    runningNote: "Audit di conferma in corso: SeoGrow ricontrolla il finding originale sulla pagina.",
    successNote: "Audit di conferma completato: il finding originale non è più presente.",
    stillPresentNote: "L’audit di conferma rileva ancora il finding originale. La correzione resta Da verificare.",
    help: "La scrittura e la risoluzione SEO sono stati distinti: un nuovo audit deve confermare che il finding originale non sia più presente.",
  };
}

export function confirmationAuditIntent(record = {}) {
  const policy = confirmationAuditPolicy(record);
  const sourceUrl = safeHttpHref(record.sourceUrl);
  if (!record.id || !record.clientId || !sourceUrl) return null;
  let startUrl = sourceUrl;
  if (policy.mode === "site") {
    try { startUrl = safeHttpHref(record.siteUrl) || new URL(sourceUrl).origin; } catch { return null; }
  }
  return {
    id: `confirm-${record.id}-${Date.now()}`,
    correctionId: record.id,
    clientId: Number(record.clientId),
    sourceUrl,
    startUrl,
    issueType: String(record.issueType || record.issue?.type || ""),
    issueLabel: String(record.issueLabel || record.issue?.label || ""),
    mode: policy.mode,
    maxPages: policy.maxPages,
    createdAt: Date.now(),
  };
}

export function confirmationAuditReady(record = {}) {
  if (!record.id || record.status !== "Da verificare" || record.confirmationAuditState === "running") return false;
  if (!record.lastVerificationAttemptAt || record.frontendFailure === true) return false;
  if (record.confirmationAuditVerifiedAt) return false;
  return Boolean(safeHttpHref(record.sourceUrl));
}

const findingSourceUrl = (finding, result) => finding?.sourceUrl || finding?.url || finding?.pageUrl || finding?.page || result?.url || "";
const findingTitle = (finding) => String(finding?.label || finding?.title || finding?.type || "").trim().toLowerCase();

export function confirmationAuditOutcome(record = {}, result = {}, mode = confirmationAuditPolicy(record).mode) {
  const source = normalizedUrl(record.sourceUrl);
  const resultUrl = normalizedUrl(result.url);
  const pages = Array.isArray(result.pages) ? result.pages : [];
  const pageUrls = pages.map((page) => normalizedUrl(page?.url)).filter(Boolean);
  const coverageConfirmed = mode === "page"
    ? Boolean(source && resultUrl && source === resultUrl)
    : pageUrls.length
      ? pageUrls.includes(source)
      : Number(result.pagesChecked || 0) > 0;
  if (!coverageConfirmed) return { confirmed: false, inconclusive: true, matching: [], reason: "L’audit non dimostra di aver ricontrollato la URL della correzione." };

  const wantedType = String(record.issueType || record.issue?.type || "").trim().toLowerCase();
  const wantedTitle = String(record.issueLabel || record.issue?.label || "").trim().toLowerCase();
  const rows = [
    ...(Array.isArray(result.issues) ? result.issues : []),
    ...(Array.isArray(result.reviewItems) ? result.reviewItems : []),
  ];
  const matching = rows.filter((finding) => {
    const type = String(finding?.type || "").trim().toLowerCase();
    const typeMatches = wantedType ? type === wantedType : findingTitle(finding) === wantedTitle;
    if (!typeMatches) return false;
    const findingUrl = normalizedUrl(findingSourceUrl(finding, result));
    if (!findingUrl && mode === "site") return true;
    return !source || findingUrl === source;
  });
  return { confirmed: matching.length === 0, inconclusive: false, matching, reason: "" };
}
