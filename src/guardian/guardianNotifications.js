const EVENT = "seogrow-guardian-notification";

export function guardianNotification({ kind = "info", title = "", message = "", fingerprint = "", clientId = 0 } = {}) {
  const detail = { kind, title, message, fingerprint, clientId, at: new Date().toISOString() };
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  return detail;
}

export function notifyGuardianLifecycle(incident = {}) {
  const recurrence = incident.recurrence?.kind;
  if (recurrence === "regression") return guardianNotification({
    kind: "error", title: "Problema ricomparso dopo una modifica", message: incident.message || "Guardian ha rilevato una regressione.", fingerprint: incident.fingerprint, clientId: incident.clientId,
  });
  if (recurrence === "flapping") return guardianNotification({
    kind: "warning", title: "Problema instabile", message: "Il problema compare e scompare ripetutamente. AutoFix è sospeso e serve analisi della causa radice.", fingerprint: incident.fingerprint, clientId: incident.clientId,
  });
  if (recurrence === "recurrent") return guardianNotification({
    kind: "warning", title: "Problema ricomparso", message: incident.message || "Un problema precedentemente risolto è stato rilevato di nuovo.", fingerprint: incident.fingerprint, clientId: incident.clientId,
  });
  if (recurrence === "new") return guardianNotification({
    kind: incident.severity === "critical" || incident.severity === "error" ? "error" : "info", title: "Nuovo problema rilevato", message: incident.message || "Guardian ha rilevato un nuovo problema.", fingerprint: incident.fingerprint, clientId: incident.clientId,
  });
  return null;
}

export function notifyGuardianMonitoringFailure(incident = {}, result = {}) {
  return guardianNotification({
    kind: "error",
    title: "Monitoraggio Guardian non riuscito",
    message: String(result.error || "Il controllo automatico non è stato completato."),
    fingerprint: incident.fingerprint,
    clientId: incident.clientId,
  });
}

export const GUARDIAN_NOTIFICATION_EVENT = EVENT;
