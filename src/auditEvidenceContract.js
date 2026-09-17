import { isLegalPage } from "./modules/audit/data.js";

const normalizeUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch { return String(value || "").trim(); }
};

const text = (value) => String(value || "").replace(/\s+/g, " ").trim();

const inferredType = (issue) => {
  const explicit = text(issue?.type).toLowerCase();
  if (explicit) return explicit;
  const value = `${issue?.label || ""} ${issue?.detail || ""}`.toLowerCase();
  if (/\bh2\b/.test(value)) return "h2";
  if (/\bh1\b/.test(value)) return "h1";
  if (/meta\s*description|metadescription/.test(value)) return "description";
  if (/\bcanonical\b/.test(value)) return "canonical";
  if (/noindex|indexabil/.test(value)) return "indexability";
  if (/\btitle\b|\btitolo\b/.test(value)) return "title";
  if (/link.*(?:404|410|interrott|raggiung)|(?:404|410).*link/.test(value)) return "broken-link";
  if (/\b(?:404|410)\b/.test(value)) return "http-status";
  if (/immagin.*\balt\b/.test(value)) return "image";
  return "seo-signal";
};

export const auditSeverity = (value, issue = {}) => {
  const severity = text(value).toLowerCase();
  if (["alta", "high", "critical", "critica", "error"].includes(severity)) return "alta";
  if (["media", "medium", "warning", "warn"].includes(severity)) return "media";
  if (["bassa", "low", "info", "opportunity", "opportunita", "opportunità"].includes(severity)) return "bassa";
  const type = inferredType(issue);
  if (/broken-(?:external-)?link|http-(?:404|410)|http-status|crawl-failure|server-error/.test(type)) return "alta";
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
  return [inferredType(issue), sourceUrl, targetUrl, text(issue?.label).toLowerCase()].join("::");
};

export const withAuditEvidence = (issue, { fallbackUrl = "", scope = "page", observedAt = "" } = {}) => {
  if (!issue || typeof issue !== "object" || Array.isArray(issue)) return issue;
  const sourceUrl = normalizeUrl(issue.sourceUrl || issue.url || fallbackUrl);
  const type = inferredType(issue);
  const field = fieldFromType(type);
  const targetUrl = normalizeUrl(targetUrlOf(issue));
  const sourceType = field === "http-status" || field === "link" ? "HTTP/crawl" : "HTML pubblico";
  return {
    ...issue,
    type,
    severity: auditSeverity(issue.severity, { ...issue, type }),
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

const failureIssues = (data) => (Array.isArray(data?.failures) ? data.failures : []).flatMap((failure) => {
  const status = Number(failure?.status);
  if (![404, 410].includes(status) || !failure?.url || isLegalPage(failure.url)) return [];
  return [{
    type: `http-${status}`,
    severity: "alta",
    label: `Pagina non raggiungibile (HTTP ${status})`,
    url: failure.url,
    sourceUrl: failure.url,
    status,
    observedValue: `HTTP ${status}`,
    detail: failure.reason || `HTTP ${status} osservato durante il crawl.`,
  }];
});

export function enforceAuditEvidence(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const scope = data.auditMode === "site" || Number(data.pagesChecked) > 1 ? "site" : "page";
  const observedAt = data.analyzedAt || data.fetchedAt || data.startedAt || "";
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
  data.issues = normalizeRows([...(Array.isArray(data.issues) ? data.issues : []), ...failureIssues(data)]);
  data.reviewItems = normalizeRows(data.reviewItems);
  data.issueEvidenceVersion = 1;
  data.issueEvidenceComplete = [...data.issues, ...data.reviewItems].every((issue) => issue?.evidence?.reproducible === true);
  return data;
}

export async function normalizeAuditEvidenceResponse(response) {
  if (!response?.ok) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  const normalized = enforceAuditEvidence(data);
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(normalized), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
