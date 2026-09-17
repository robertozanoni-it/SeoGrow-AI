import { isLegalPage } from "./modules/audit/data.js";

const normalizeUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return String(value || "").trim();
  }
};

const text = (value) => String(value || "").replace(/\s+/g, " ").trim();

export const auditSeverity = (value, issue = {}) => {
  const severity = text(value).toLowerCase();
  if (["alta", "high", "critical", "critica", "error"].includes(severity)) return "alta";
  if (["media", "medium", "warning", "warn"].includes(severity)) return "media";
  if (["bassa", "low", "info", "opportunity", "opportunita", "opportunità"].includes(severity)) return "bassa";
  const type = text(issue?.type).toLowerCase();
  if (/broken-(?:external-)?link|http-(?:404|410)|crawl-failure|server-error/.test(type)) return "alta";
  if (/title|description|meta|h1|indexability/.test(type)) return "media";
  if (/h2|canonical|image|thin|link/.test(type)) return "bassa";
  return "media";
};

const fieldFromType = (type) => {
  const value = text(type).toLowerCase();
  if (/broken-(?:external-)?link|link/.test(value)) return "link";
  if (/404|410|status|http|crawl/.test(value)) return "http-status";
  if (/canonical/.test(value)) return "canonical";
  if (/noindex|indexability|robots/.test(value)) return "robots";
  if (/meta|description/.test(value)) return "meta-description";
  if (/\bh1\b/.test(value) || value === "h1") return "h1";
  if (/\bh2\b/.test(value) || value === "h2") return "h2";
  if (/title/.test(value)) return "title";
  return value || "seo-signal";
};

const targetUrlOf = (issue) => issue?.targetUrl || issue?.brokenUrl || issue?.href || "";

const observedValue = (issue, field) => {
  const direct = issue?.observedValue ?? issue?.observed ?? issue?.value;
  if (direct !== undefined && direct !== null && direct !== "") return text(direct);
  if (field === "link") {
    const target = targetUrlOf(issue);
    const status = Number(issue?.status || issue?.statusCode);
    return [target, Number.isFinite(status) ? `HTTP ${status}` : ""].filter(Boolean).join(" · ");
  }
  if (field === "http-status") {
    const status = Number(issue?.status || issue?.statusCode);
    if (Number.isFinite(status)) return `HTTP ${status}`;
  }
  return text(issue?.detail || issue?.label);
};

export const auditIssueIdentity = (issue, fallbackUrl = "") => {
  const sourceUrl = normalizeUrl(issue?.sourceUrl || issue?.url || fallbackUrl);
  const targetUrl = normalizeUrl(targetUrlOf(issue));
  return [
    text(issue?.type).toLowerCase(),
    sourceUrl,
    targetUrl,
    text(issue?.label).toLowerCase(),
  ].join("::");
};

export const withAuditEvidence = (issue, { fallbackUrl = "", scope = "page", observedAt = "" } = {}) => {
  if (!issue || typeof issue !== "object" || Array.isArray(issue)) return issue;
  const sourceUrl = normalizeUrl(issue.sourceUrl || issue.url || fallbackUrl);
  const type = text(issue.type).toLowerCase();
  const field = fieldFromType(type);
  const targetUrl = normalizeUrl(targetUrlOf(issue));
  const sourceType = field === "http-status" || field === "link" ? "HTTP/crawl" : "HTML pubblico";
  return {
    ...issue,
    severity: auditSeverity(issue.severity, issue),
    ...(sourceUrl ? { sourceUrl, url: issue.url || sourceUrl } : {}),
    ...(targetUrl ? { targetUrl } : {}),
    evidence: {
      sourceType,
      scope,
      url: sourceUrl,
      field,
      observed: observedValue(issue, field),
      observedAt: observedAt || issue.observedAt || issue.checkedAt || "",
      reproducible: Boolean(sourceUrl && field),
    },
  };
};

export function enforceAuditEvidence(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const scope = data.auditMode === "site" || Number(data.pagesChecked) > 1 ? "site" : "page";
  const observedAt = data.analyzedAt || data.startedAt || "";
  const normalizeRows = (rows) => {
    const seen = new Set();
    const output = [];
    for (const raw of Array.isArray(rows) ? rows : []) {
      const issue = withAuditEvidence(raw, { fallbackUrl: data.url, scope, observedAt });
      if (!issue?.sourceUrl || isLegalPage(issue.sourceUrl)) continue;
      const key = auditIssueIdentity(issue, data.url);
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(issue);
    }
    return output;
  };
  data.issues = normalizeRows(data.issues);
  data.reviewItems = normalizeRows(data.reviewItems);
  data.issueEvidenceVersion = 1;
  data.issueEvidenceComplete = [...data.issues, ...data.reviewItems].every((issue) => issue?.evidence?.reproducible === true);
  return data;
}
