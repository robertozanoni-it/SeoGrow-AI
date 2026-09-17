import { isLegalPage } from "../src/modules/audit/data.js";
import { normalizeIssue, traceabilitySummary } from "./auditTraceabilityDecorator.js";

const INSTALLED = Symbol.for("seogrow.auditLegalLinkSourcePolicy");
const ROUTES = ["/api/audit", "/api/site-analysis"];

const routeStack = (app) => app?.router?.stack || app?._router?.stack || [];

const sourceList = (link, fallback = "") => {
  const values = [
    ...(Array.isArray(link?.sources) ? link.sources : []),
    link?.sourceUrl,
    link?.source,
    link?.pageUrl,
    fallback,
  ].filter(Boolean);
  return [...new Set(values)];
};

function restoreBrokenLegalTargets(payload = {}) {
  if (!payload || typeof payload !== "object" || payload.error || payload.legalOnly) return payload;
  const existing = Array.isArray(payload.issues) ? [...payload.issues] : [];
  const keys = new Set(existing.map((issue) => issue?.dedupeKey).filter(Boolean));
  const observedAt = payload.analyzedAt || payload.fetchedAt || new Date().toISOString();

  for (const [field, type] of [["brokenLinks", "broken-link"], ["brokenExternalLinks", "broken-external-link"]]) {
    for (const link of Array.isArray(payload[field]) ? payload[field] : []) {
      if (!link?.url || !isLegalPage(link.url)) continue;
      const sources = sourceList(link, payload.url).filter((url) => !isLegalPage(url));
      for (const sourceUrl of sources) {
        const issue = normalizeIssue({
          type,
          severity: link.temporary ? "media" : "alta",
          label: `${type === "broken-external-link" ? "Link esterno" : "Link interno"} non raggiungibile${link.status ? ` (${link.status})` : ""}`,
          sourceUrl,
          targetUrl: link.url,
          observedStatus: link.status ?? null,
          observedAt,
          detail: link.error || (link.status ? `HTTP ${link.status}` : "Nessuna risposta HTTP verificabile"),
        }, payload, null);
        if (keys.has(issue.dedupeKey)) continue;
        keys.add(issue.dedupeKey);
        existing.push(issue);
      }
    }
  }

  return {
    ...payload,
    issues: existing,
    summary: existing.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {}),
    traceability: traceabilitySummary(existing),
  };
}

function wrapRoute(app, path) {
  const layer = routeStack(app).find((item) => item?.route?.path === path && item?.route?.methods?.post);
  const target = [...(layer?.route?.stack || [])].reverse().find((item) => typeof item?.handle === "function");
  if (!target) throw new Error(`Route Audit non trovata per policy GDPR link: ${path}`);
  const original = target.handle;
  target.handle = function auditLegalLinkSourcePolicy(req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = (payload) => originalJson(restoreBrokenLegalTargets(payload));
    return original(req, res, next);
  };
}

export function installAuditLegalLinkSourcePolicy(app) {
  if (app[INSTALLED]) return;
  for (const route of ROUTES) wrapRoute(app, route);
  app[INSTALLED] = true;
}

export { restoreBrokenLegalTargets };
