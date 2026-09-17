const severityRank = Object.freeze({ bassa: 1, media: 2, alta: 3 });

export const normalizeAuditSeverity = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["critical", "critica", "high", "alta"].includes(normalized)) return "alta";
  if (["low", "bassa"].includes(normalized)) return "bassa";
  return "media";
};

const inferType = (issue = {}) => {
  if (issue.type) return String(issue.type);
  const text = `${issue.label || ""} ${issue.detail || ""}`.toLowerCase();
  if (/h1/.test(text)) return "h1";
  if (/h2/.test(text)) return "h2";
  if (/meta description/.test(text)) return "description";
  if (/title/.test(text)) return "title";
  if (/canonical/.test(text)) return "canonical";
  if (/noindex|robots/.test(text)) return "indexability";
  if (/404|410|http/.test(text)) return "http-status";
  if (/link/.test(text)) return "link";
  return "audit";
};

const normalizeUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return String(value || "").trim();
  }
};

export const auditDataSource = (issue = {}) => {
  const type = inferType(issue).toLowerCase();
  if (/broken|http-status|crawl/.test(type)) return "Controllo HTTP riproducibile";
  if (/x-robots/.test(type)) return "Header HTTP X-Robots-Tag";
  if (/orphan/.test(type)) return "Sitemap + grafo link interni";
  if (/performance/.test(type)) return "Tempo risposta HTTP";
  return "HTML osservato dal crawler";
};

export function auditIssuesForDisplay(input, resultUrl = "") {
  const byIdentity = new Map();
  for (const [auditIndex, raw] of (Array.isArray(input) ? input : []).entries()) {
    if (!raw || typeof raw !== "object") continue;
    const type = inferType(raw);
    const sourceUrl = raw.sourceUrl || raw.url || resultUrl || "";
    const targetUrl = raw.targetUrl || "";
    const severity = normalizeAuditSeverity(raw.severity);
    const dataSource = raw.dataSource || auditDataSource({ ...raw, type });
    const issue = {
      ...raw,
      type,
      severity,
      sourceUrl,
      dataSource,
      auditIndex,
      evidence: raw.evidence || {
        source: dataSource,
        sourceUrl,
        targetUrl,
        observed: raw.detail || raw.label || "Segnale rilevato dall’audit.",
      },
    };
    const identity = [type.toLowerCase(), normalizeUrl(sourceUrl), normalizeUrl(targetUrl)].join("::");
    const previous = byIdentity.get(identity);
    if (!previous || severityRank[severity] > severityRank[previous.severity] || String(issue.detail || "").length > String(previous.detail || "").length) {
      byIdentity.set(identity, issue);
    }
  }
  return [...byIdentity.values()];
}
