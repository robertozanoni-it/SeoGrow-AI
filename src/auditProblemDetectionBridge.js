import { issueIdentity } from "./reliabilityModel.js";

const bounded = (value, max = 300) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function auditIssueFingerprint({ clientId, issue } = {}) {
  if (!issue) return "";
  const identity = issueIdentity({
    issueType: issue.type,
    issueLabel: issue.label,
    sourceUrl: issue.sourceUrl || issue.url,
    issue,
  });
  return `audit:${Number(clientId) || 0}:${identity}`;
}

export function auditIssueSignal({ clientId, issue } = {}) {
  const fingerprint = auditIssueFingerprint({ clientId, issue });
  if (!fingerprint) return null;
  const severity = ["critical", "error", "warning", "info"].includes(issue.severity)
    ? issue.severity
    : (issue.priority === "Alta" ? "error" : "warning");
  return {
    fingerprint,
    code: `AUDIT_${String(issue.type || "ISSUE").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
    source: "audit",
    severity,
    message: bounded(issue.label || issue.title || issue.message || "Problema rilevato dall'Audit SEO"),
    detail: bounded([issue.sourceUrl || issue.url || "", issue.detail || issue.reason || ""].filter(Boolean).join(" · ")),
    autoFixEligible: issue.autoFixEligible === true,
    auditIssue: issue,
    clientId: Number(clientId) || 0,
  };
}

export function auditSignals({ clientId, analysis } = {}) {
  const issues = Array.isArray(analysis?.issues) ? analysis.issues : [];
  return issues.map((issue) => auditIssueSignal({ clientId, issue })).filter(Boolean);
}

export function dispatchAuditProblemSignals({ clientId, analysis } = {}) {
  if (typeof window === "undefined") return 0;
  const signals = auditSignals({ clientId, analysis });
  for (const signal of signals) {
    window.dispatchEvent(new CustomEvent("seogrow-audit-problem-detected", { detail: signal }));
  }
  return signals.length;
}
