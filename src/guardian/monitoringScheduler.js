export const MONITORING_CADENCE = Object.freeze({
  CRITICAL: 60 * 60_000,
  HIGH: 6 * 60 * 60_000,
  NORMAL: 24 * 60 * 60_000,
  LOW: 7 * 24 * 60 * 60_000,
});

const cadenceFor = ({ severity, recurrenceKind } = {}) => {
  if (recurrenceKind === "flapping" || recurrenceKind === "regression") return MONITORING_CADENCE.CRITICAL;
  if (severity === "critical" || severity === "error") return MONITORING_CADENCE.HIGH;
  if (severity === "info") return MONITORING_CADENCE.LOW;
  return MONITORING_CADENCE.NORMAL;
};

export function monitoringPlan({ incident = {}, now = Date.now() } = {}) {
  const intervalMs = cadenceFor({
    severity: incident.severity,
    recurrenceKind: incident.recurrence?.kind,
  });
  const last = Date.parse(incident.lastMonitoredAt || incident.lastSeenAt || incident.firstSeenAt || "") || now;
  return {
    fingerprint: incident.fingerprint || "",
    intervalMs,
    dueAt: new Date(last + intervalMs).toISOString(),
    targeted: true,
    fullAuditRequired: incident.recurrence?.kind === "flapping",
    autoFixAllowed: incident.recurrence?.autoFixAllowed !== false,
  };
}

export function dueMonitoringIncidents(incidents = [], now = Date.now()) {
  const seen = new Set();
  return incidents
    .filter(incident => {
      const key = `${incident.clientId || "unknown"}::${incident.fingerprint || ""}`;
      if (!incident.fingerprint || seen.has(key)) return false;
      seen.add(key);
      return Date.parse(monitoringPlan({ incident, now }).dueAt) <= now;
    })
    .map(incident => ({ incident, plan: monitoringPlan({ incident, now }) }));
}
