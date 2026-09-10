import { excludeLegalSeo } from "./legalPageScope.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
const SITE_HISTORY_KEY = "seogrow-analyses-v2";
const HISTORY_MIGRATION_KEY = "seogrow-seo-response-integrity-v7";
const SCORE_POLICY_VERSION = 4;

const normalizeUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return String(value || "");
  }
};

const confirmedBroken = (link) => [404, 410].includes(Number(link?.status));

const robotsExclusion = (failure) =>
  /(?:esclus[ao]\s+da\s+robots\.txt|robots\.txt.*esclus)/i.test(
    String(failure?.reason || failure?.error || ""),
  );

const normalizedSeverity = (value) => {
  const severity = String(value || "").trim().toLowerCase();
  if (["alta", "high", "critical", "critica", "error"].includes(severity)) return "alta";
  if (["media", "medium", "warning", "warn"].includes(severity)) return "media";
  if (["bassa", "low", "info", "opportunity", "opportunita", "opportunità"].includes(severity)) return "bassa";
  return severity || "unknown";
};

const normalizedIssue = (issue) => {
  if (!issue || typeof issue !== "object" || Array.isArray(issue)) return issue;
  const type = String(issue.type || "").toLowerCase();
  const brokenLink = /broken-(?:external-)?link/.test(type);
  const pageUrl = issue.url || issue.sourceUrl || (!brokenLink ? issue.targetUrl : "") || "";
  return {
    ...issue,
    severity: normalizedSeverity(issue.severity),
    ...(pageUrl && !issue.url ? { url: pageUrl } : {}),
  };
};

const severityPenalty = (value) => {
  const severity = normalizedSeverity(value);
  if (severity === "alta") return 5;
  if (severity === "media") return 2;
  return 1;
};

const scoreFromVerifiedEvidence = (data, issues, failedPages) => {
  const pages = Math.max(1, Number(data.pagesChecked || data.pages?.length || 1));
  const penalty = issues.reduce(
    (sum, issue) => sum + severityPenalty(issue?.severity),
    0,
  );
  const strongest = issues.reduce(
    (maximum, issue) => Math.max(maximum, severityPenalty(issue?.severity)),
    0,
  );
  const normalizedPenalty = Math.round(
    strongest + Math.max(0, penalty - strongest) / Math.sqrt(pages),
  );
  const failurePenalty = Math.min(
    40,
    Math.max(0, Number(failedPages || 0)) * 4 + (Number(data.pagesChecked || 0) ? 0 : 60),
  );
  return Math.max(0, Math.min(100, 100 - normalizedPenalty - failurePenalty));
};

const transientTargetSet = (links) =>
  new Set(
    links
      .filter((link) => !confirmedBroken(link))
      .map((link) => normalizeUrl(link?.url))
      .filter(Boolean),
  );

const issueLooksTransientLink = (issue) => {
  if (!["broken-link", "broken-external-link"].includes(issue?.type)) return false;
  const text = `${issue?.label || ""} ${issue?.detail || ""}`;
  const status = Number(text.match(/\b(?:HTTP\s*)?(\d{3})\b/i)?.[1]);
  return Number.isFinite(status) && ![404, 410].includes(status);
};

const reviewOnlyReason = (issue) => {
  const text = `${issue?.type || ""} ${issue?.label || ""} ${issue?.detail || ""}`.toLowerCase();
  if (/canonical/.test(text)) {
    if (/\b(?:404|410)\b|canonical.*(?:rotta|broken|irraggiungibile)/i.test(text)) return "";
    return "Una canonical differente o non rilevata non è automaticamente un errore. Verificare URL finale, HTML pubblico, sitemap, link interni e intenzione della pagina.";
  }
  if (/noindex|indexability|indicizzabil/.test(text)) {
    return "La direttiva noindex può essere intenzionale. Verificare tipo di pagina, strategia di indicizzazione e coerenza con sitemap/link interni prima di correggere.";
  }
  return "";
};

const toReviewItem = (issue, reason) => ({
  ...issue,
  severity: "bassa",
  diagnosisState: "needs-confirmation",
  evidenceNature: "observed-signal",
  reviewReason: reason,
});

const normalizeSiteAnalysis = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const currentPolicy =
    data.evidencePolicy === "confirmed-issues-only" &&
    data.scoreSource === "seogrow-derived" &&
    data.legalScopeVersion === 4 &&
    data.scorePolicyVersion === SCORE_POLICY_VERSION;
  if (currentPolicy) return data;

  const alreadyNormalized = data.evidencePolicy === "confirmed-issues-only" && data.scoreSource === "seogrow-derived";
  excludeLegalSeo(data);
  if (alreadyNormalized) {
    data.issues = (Array.isArray(data.issues) ? data.issues : []).map(normalizedIssue);
    data.reviewItems = (Array.isArray(data.reviewItems) ? data.reviewItems : []).map(normalizedIssue);
    data.pagesFailed = Array.isArray(data.failures)
      ? data.failures.filter((failure) => !robotsExclusion(failure)).length
      : Math.max(0, Number(data.pagesFailed || 0));
    data.score = data.legalOnly ? null : scoreFromVerifiedEvidence(data, data.issues || [], data.pagesFailed);
    data.summary = (data.issues || []).reduce((out, issue) => { out[issue.type] = (out[issue.type] || 0) + 1; return out; }, {});
    data.legalScopeVersion = 4;
    data.scorePolicyVersion = SCORE_POLICY_VERSION;
    return data;
  }

  const rawInternal = Array.isArray(data.brokenLinks) ? data.brokenLinks : [];
  const rawExternal = Array.isArray(data.brokenExternalLinks) ? data.brokenExternalLinks : [];
  const transientInternalTargets = transientTargetSet(rawInternal);
  const transientExternalTargets = transientTargetSet(rawExternal);

  const transientLinks = [
    ...rawInternal.filter((link) => !confirmedBroken(link)).map((link) => ({
      ...link,
      scope: "internal",
      verificationState: "temporarily-unverifiable",
    })),
    ...rawExternal.filter((link) => !confirmedBroken(link)).map((link) => ({
      ...link,
      scope: "external",
      verificationState: "temporarily-unverifiable",
    })),
  ];

  data.brokenLinks = rawInternal.filter(confirmedBroken);
  data.brokenExternalLinks = rawExternal.filter(confirmedBroken);
  data.linkVerificationWarnings = transientLinks;

  const rawFailures = Array.isArray(data.failures) ? data.failures : [];
  const exclusions = rawFailures.filter(robotsExclusion);
  const operationalFailures = rawFailures.filter((failure) => !robotsExclusion(failure));
  data.failures = operationalFailures;
  data.pagesFailed = operationalFailures.length;
  data.crawlExclusions = exclusions;

  const rawIssues = (Array.isArray(data.issues) ? data.issues : []).map(normalizedIssue);
  const filtered = rawIssues.filter((issue) => {
    if (issueLooksTransientLink(issue)) return false;
    const target = normalizeUrl(issue?.targetUrl || "");
    if (issue?.type === "broken-link" && transientInternalTargets.has(target)) return false;
    if (issue?.type === "broken-external-link" && transientExternalTargets.has(target)) return false;
    return true;
  });

  const confirmed = [];
  const reviewItems = [];
  for (const issue of filtered) {
    const reason = reviewOnlyReason(issue);
    if (reason) reviewItems.push(toReviewItem(issue, reason));
    else confirmed.push({ ...issue, diagnosisState: issue?.diagnosisState || "confirmed" });
  }

  const previousReviewItems = (Array.isArray(data.reviewItems) ? data.reviewItems : []).map(normalizedIssue);
  data.rawIssueCount = rawIssues.length;
  data.issues = confirmed;
  data.reviewItems = [...reviewItems, ...previousReviewItems].filter((item, index, rows) => {
    const key = `${item?.type || ""}|${item?.label || ""}|${normalizeUrl(item?.sourceUrl || item?.url || item?.targetUrl || "")}`;
    return rows.findIndex((candidate) =>
      `${candidate?.type || ""}|${candidate?.label || ""}|${normalizeUrl(candidate?.sourceUrl || candidate?.url || candidate?.targetUrl || "")}` === key,
    ) === index;
  });

  data.summary = data.issues.reduce((summary, issue) => {
    summary[issue.type] = (summary[issue.type] || 0) + 1;
    return summary;
  }, {});
  data.reviewSummary = data.reviewItems.reduce((summary, issue) => {
    summary[issue.type || "review"] = (summary[issue.type || "review"] || 0) + 1;
    return summary;
  }, {});

  data.rawScore = Number.isFinite(Number(data.score)) ? Number(data.score) : null;
  data.score = data.legalOnly ? null : scoreFromVerifiedEvidence(data, data.issues, operationalFailures.length);
  data.scoreSource = "seogrow-derived";
  data.scorePolicyVersion = SCORE_POLICY_VERSION;
  data.scoreLabel = "Indice di salute tecnica SeoGrow";
  data.scoreMethodology = "Indice interno derivato dai problemi confermati e dai fallimenti del crawl; non è un voto Google.";
  data.evidencePolicy = "confirmed-issues-only";
  return data;
};

export async function normalizeSiteAnalysisResponse(response) {
  if (!response?.ok) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  const normalized = normalizeSiteAnalysis(data);
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(normalized), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const normalizeStoredHistory = () => {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(HISTORY_MIGRATION_KEY) === "1") return;
    const raw = localStorage.getItem(SITE_HISTORY_KEY);
    if (!raw) {
      localStorage.setItem(HISTORY_MIGRATION_KEY, "1");
      return;
    }
    const history = JSON.parse(raw);
    if (!history || typeof history !== "object" || Array.isArray(history)) return;
    const normalized = Object.fromEntries(
      Object.entries(history).map(([clientId, value]) => [
        clientId,
        Array.isArray(value)
          ? value.map((item) => normalizeSiteAnalysis({ ...item }))
          : normalizeSiteAnalysis({ ...value }),
      ]),
    );
    localStorage.setItem(SITE_HISTORY_KEY, JSON.stringify(normalized));
    localStorage.setItem(HISTORY_MIGRATION_KEY, "1");
    window.dispatchEvent(new StorageEvent("storage", {
      key: SITE_HISTORY_KEY,
      newValue: JSON.stringify(normalized),
    }));
  } catch (error) {
    console.warn("Normalizzazione storico audit non completata:", error);
  }
};

if (typeof window !== "undefined") normalizeStoredHistory();

export { normalizeSiteAnalysis, reviewOnlyReason, scoreFromVerifiedEvidence };
