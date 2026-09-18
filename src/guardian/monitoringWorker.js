import { markGuardianMonitored, runDueGuardianMonitoring } from "./guardianEngine.js";

const inFlight = new Set();

export function createGuardianMonitoringWorker({
  intervalMs = 60_000,
  dispatch = (detail) => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("seogrow-monitoring-request", { detail }));
  },
  now = () => Date.now(),
} = {}) {
  let timer = null;

  const tick = () => {
    const due = runDueGuardianMonitoring(now());
    for (const { incident, plan } of due) {
      const key = `${incident.clientId || "unknown"}::${incident.fingerprint}`;
      if (inFlight.has(key)) continue;
      inFlight.add(key);
      dispatch({
        key,
        clientId: incident.clientId,
        fingerprint: incident.fingerprint,
        mode: plan.fullAuditRequired ? "full-audit" : "targeted-audit",
        sourceUrl: incident.auditIssue?.sourceUrl || incident.auditIssue?.url || "",
        complete(result = {}) {
          inFlight.delete(key);
          return markGuardianMonitored(incident.fingerprint, result, new Date(now()).toISOString());
        },
        fail(error) {
          inFlight.delete(key);
          return markGuardianMonitored(incident.fingerprint, { ok: false, error: String(error?.message || error || "monitoring-failed") }, new Date(now()).toISOString());
        },
      });
    }
    return due.length;
  };

  return {
    start() {
      if (timer) return;
      tick();
      timer = setInterval(tick, Math.max(30_000, intervalMs));
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
    tick,
    inFlightCount: () => inFlight.size,
  };
}
