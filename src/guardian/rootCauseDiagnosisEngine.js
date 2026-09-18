const CONFIDENCE = Object.freeze({ LOW: "low", MEDIUM: "medium", HIGH: "high" });

const RULES = Object.freeze([
  {
    id: "persistence-reconciliation",
    match: (incident) => ["workspace", "persistence", "tasks", "problems"].includes(String(incident.source || "").toLowerCase())
      || /WRITE_FAILED|REOPENED|RECONCILIATION/i.test(String(incident.code || "")),
    cause: "Incoerenza di persistenza o riconciliazione dello stato canonico.",
    evidence: ["stato workspace", "ledger problema", "riconciliazione Task/Problemi/Correzioni"],
    confidence: CONFIDENCE.HIGH,
  },
  {
    id: "integration-health",
    match: (incident) => /integration|api/i.test(String(incident.source || ""))
      || /API|INTEGRATION/i.test(String(incident.code || "")),
    cause: "Dipendenza o integrazione non disponibile/coerente durante l'operazione.",
    evidence: ["health endpoint", "stato integrazione", "errore runtime associato"],
    confidence: CONFIDENCE.MEDIUM,
  },
  {
    id: "ui-no-effect",
    match: (incident) => /UI_ACTION_NO_EFFECT/i.test(String(incident.code || "")),
    cause: "L'azione UI non ha prodotto un effetto osservabile nel tempo previsto.",
    evidence: ["azione invocata", "mutazioni DOM", "eventi di completamento/navigazione"],
    confidence: CONFIDENCE.MEDIUM,
  },
  {
    id: "audit-recurrence",
    match: (incident) => String(incident.source || "").toLowerCase() === "audit",
    cause: "La condizione SEO rilevata dall'Audit è ancora presente o è ricomparsa dopo una precedente verifica.",
    evidence: ["fingerprint Audit", "URL/elemento", "storico scansioni", "verifica post-fix"],
    confidence: CONFIDENCE.MEDIUM,
  },
]);

export function diagnoseRootCause(incident = {}, history = []) {
  const rule = RULES.find((candidate) => candidate.match(incident));
  const same = history.filter((item) => item?.fingerprint && item.fingerprint === incident.fingerprint);
  const recurrence = Math.max(Number(incident.occurrences || 1), same.reduce((n, item) => n + Number(item?.occurrences || 0), 0));
  if (!rule) return {
    diagnosisId: "unknown",
    cause: "Causa non determinata automaticamente.",
    confidence: CONFIDENCE.LOW,
    evidence: ["fingerprint", "messaggio", "storico incidente"],
    recurrence,
    requiresHumanReview: true,
  };
  const repeatedAfterResolution = same.some((item) => item?.state === "resolved");
  return {
    diagnosisId: rule.id,
    cause: rule.cause,
    confidence: repeatedAfterResolution || recurrence >= 3 ? CONFIDENCE.HIGH : rule.confidence,
    evidence: rule.evidence,
    recurrence,
    requiresHumanReview: repeatedAfterResolution || recurrence >= 5 || incident.state === "blocked",
  };
}

export { CONFIDENCE };
