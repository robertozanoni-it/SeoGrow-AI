const TONE_BY_SEVERITY = Object.freeze({
  critical: "red",
  error: "red",
  warning: "amber",
  info: "blue",
});

const TITLE_BY_SEVERITY = Object.freeze({
  critical: "Problema critico rilevato",
  error: "Problema rilevato",
  warning: "Attenzione richiesta",
  info: "Informazione Guardian",
});

export function guardianIncidentNotification(incident) {
  if (!incident?.id || !incident?.fingerprint) return null;
  const resolved = incident.state === "resolved";
  return {
    id: `guardian:${incident.fingerprint}:${resolved ? "resolved" : "open"}`,
    source: "Guardian",
    tone: resolved ? "green" : (TONE_BY_SEVERITY[incident.severity] || "amber"),
    severity: incident.severity || "warning",
    title: resolved ? "Problema risolto automaticamente" : (TITLE_BY_SEVERITY[incident.severity] || TITLE_BY_SEVERITY.warning),
    text: resolved
      ? (incident.verification || incident.message || "Verifica post-fix completata.")
      : (incident.message || "Guardian ha rilevato un'anomalia."),
    page: "Problemi",
    guardianIncidentId: incident.id,
    guardianFingerprint: incident.fingerprint,
    evidence: {
      kind: "guardian-incident",
      code: incident.code || "UNKNOWN",
      state: incident.state || "open",
      action: incident.action || "",
    },
  };
}

export function automationStepNotification(step) {
  if (!step?.id || step.state === "ready") return null;
  const critical = ["blocked", "circuit_open"].includes(step.state);
  return {
    id: `automation:${step.id}:${step.state}`,
    source: "Automation Orchestrator",
    tone: critical ? "red" : "amber",
    severity: critical ? "error" : "warning",
    title: critical ? "Automazione interrotta" : "Automazione richiede attenzione",
    text: step.reason || `${step.id}: ${step.state}`,
    page: step.id === "integration-health" ? "Integrazioni" : "Problemi",
    automationId: step.id,
    evidence: { kind: "automation-step", state: step.state, risk: step.risk || "" },
  };
}

export function mergeAutomationNotifications(base = [], guardian = [], automationSteps = []) {
  const extra = [
    ...guardian.map(guardianIncidentNotification),
    ...automationSteps.map(automationStepNotification),
  ].filter(Boolean);
  return [...base, ...extra].filter((item, index, all) =>
    item?.id && all.findIndex((candidate) => candidate.id === item.id) === index,
  );
}
