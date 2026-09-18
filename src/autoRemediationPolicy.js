import { batchCapability, batchRiskGroup } from "./batchRemediationModel.js";

export const AUTO_REMEDIATION_DECISION = Object.freeze({
  AUTO: "auto",
  APPROVAL: "approval",
  ASSISTED: "assisted",
  SKIP: "skip",
});

const AUTO_KINDS = new Set(["title", "meta_description", "excerpt"]);

export function autoRemediationDecision(problem = {}) {
  const capability = batchCapability(problem);
  const riskGroup = batchRiskGroup(problem);
  if (capability.state === "SKIPPED") return { decision: AUTO_REMEDIATION_DECISION.SKIP, capability, riskGroup, reason: capability.reason };
  if (capability.batchMode === "assisted_task" || riskGroup === "assisted") return { decision: AUTO_REMEDIATION_DECISION.ASSISTED, capability, riskGroup, reason: capability.reason };
  const safeAutomatic = capability.batchMode === "direct_preflight" &&
    riskGroup === "standard" &&
    AUTO_KINDS.has(capability.kind) &&
    problem.correctability === "automatic" &&
    problem.ownershipBlocked !== true &&
    problem.interventionState !== "applied";
  if (safeAutomatic) return {
    decision: AUTO_REMEDIATION_DECISION.AUTO,
    capability,
    riskGroup,
    reason: "Candidato Auto-Remediation: adapter diretto, rischio ordinario, ownership disponibile e verifica/rollback obbligatori.",
  };
  return {
    decision: AUTO_REMEDIATION_DECISION.APPROVAL,
    capability,
    riskGroup,
    reason: "La correzione può essere preparata, ma rischio, intento o capability richiedono approvazione esplicita prima della write.",
  };
}

export function buildAutoRemediationPlan(problems = []) {
  const entries = problems.map((problem) => ({ problem, ...autoRemediationDecision(problem) }));
  return {
    entries,
    automatic: entries.filter((entry) => entry.decision === AUTO_REMEDIATION_DECISION.AUTO),
    approvalRequired: entries.filter((entry) => entry.decision === AUTO_REMEDIATION_DECISION.APPROVAL),
    assisted: entries.filter((entry) => entry.decision === AUTO_REMEDIATION_DECISION.ASSISTED),
    skipped: entries.filter((entry) => entry.decision === AUTO_REMEDIATION_DECISION.SKIP),
  };
}
