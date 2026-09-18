import { auditIssueFingerprint } from "./auditProblemDetectionBridge.js";
import { evaluatePostFixVerification } from "./guardian/verificationClosureEngine.js";

export function verifiedAuditClosures({ clientId, current, previous, corrections = [] } = {}) {
  const resolved = Array.isArray(current?.resolvedIssues) ? current.resolvedIssues : [];
  return resolved.map((issue) => {
    const fingerprint = auditIssueFingerprint({ clientId, issue });
    const correction = corrections
      .filter((item) => Number(item?.clientId) === Number(clientId))
      .filter((item) => String(item?.issueType || item?.issue?.type || "") === String(issue?.type || ""))
      .filter((item) => String(item?.sourceUrl || "") === String(issue?.sourceUrl || issue?.url || ""))
      .toSorted((a, b) => Date.parse(b.appliedAt || b.createdAt || 0) - Date.parse(a.appliedAt || a.createdAt || 0))[0];
    if (!correction) return null;
    const previousIssue = (previous?.issues || []).find((candidate) =>
      auditIssueFingerprint({ clientId, issue: candidate }) === fingerprint,
    );
    const verification = evaluatePostFixVerification({
      incident: { fingerprint },
      correction,
      evidenceBefore: previousIssue || issue,
      evidenceAfter: { auditAt: current.analyzedAt || current.createdAt || "", issueAbsent: true },
      recheck: {
        ok: true,
        problemPresent: false,
        fingerprint,
        source: "audit-recheck",
        at: current.analyzedAt || current.createdAt || new Date().toISOString(),
      },
    });
    return verification.canClose ? { fingerprint, issue, correction, verification } : null;
  }).filter(Boolean);
}

export function dispatchVerifiedAuditClosures(input) {
  const rows = verifiedAuditClosures(input);
  if (typeof window !== "undefined") for (const row of rows) {
    window.dispatchEvent(new CustomEvent("seogrow-post-fix-verified", { detail: row }));
  }
  return rows;
}
