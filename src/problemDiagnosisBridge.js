import { auditIssueFingerprint } from "./auditProblemDetectionBridge.js";
import { listGuardianIncidents } from "./guardian/guardianEngine.js";

export function guardianDecisionForProblem(problem, clientId, incidents = listGuardianIncidents()) {
  if (!problem) return null;
  const issue = {
    type: problem.issueType,
    label: problem.title,
    sourceUrl: problem.sourceUrl,
    url: problem.sourceUrl,
  };
  const fingerprint = auditIssueFingerprint({ clientId, issue });
  const exact = incidents.find((item) => item?.fingerprint === fingerprint && item?.diagnosis);
  if (exact) return { diagnosis: exact.diagnosis, resolution: exact.resolution || null, incident: exact };

  // Fallback only to an unambiguous Audit incident with same type + URL.
  const candidates = incidents.filter((item) =>
    item?.source === "audit" &&
    item?.diagnosis &&
    String(item?.code || "").includes(String(problem.issueType || "").toUpperCase()) &&
    String(item?.detail || "").includes(String(problem.sourceUrl || "")),
  );
  return candidates.length === 1 ? { diagnosis: candidates[0].diagnosis, resolution: candidates[0].resolution || null, incident: candidates[0] } : null;
}

export function diagnosisForProblem(problem, clientId, incidents = listGuardianIncidents()) {
  return guardianDecisionForProblem(problem, clientId, incidents)?.diagnosis || null;
}
