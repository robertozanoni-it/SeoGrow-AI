import { AUTOMATION_GRAPH } from "./automationOrchestrator.js";

export const AUTOMATION_LABELS = Object.freeze({
  guardian: "Guardian",
  "data-freshness": "Data Freshness",
  "integration-health": "Integration Health",
  "auto-remediation": "Auto Remediation",
  "visual-ux": "Visual UX Guardian",
  "capability-evolution": "Capability Evolution",
});

export function automationStatusRows({ guardian, plan, now = Date.now() } = {}) {
  const steps = new Map((plan?.steps || []).map((step) => [step.id, step]));
  const openBySource = (guardian?.open || []).reduce((map, incident) => {
    const source = String(incident?.source || "").toLowerCase();
    map.set(source, (map.get(source) || 0) + 1);
    return map;
  }, new Map());
  return AUTOMATION_GRAPH.map((item) => {
    const step = steps.get(item.id);
    const state = item.id === "guardian"
      ? (guardian?.installed ? (guardian?.approvalRequired?.length ? "attention" : "active") : "inactive")
      : step?.state === "ready" ? "active" : (step?.state || "waiting");
    const incidents = item.id === "guardian"
      ? Number(guardian?.open?.length || 0)
      : Number(openBySource.get(item.id) || 0);
    return {
      id: item.id,
      label: AUTOMATION_LABELS[item.id] || item.id,
      risk: item.risk,
      state,
      reason: step?.reason || "",
      incidents,
      autoResolved: item.id === "guardian" ? Number(guardian?.autoResolved?.length || 0) : 0,
      lastRun: item.id === "guardian" ? (guardian?.lastScan?.completedAt || "") : "",
      ageMs: item.id === "guardian" && guardian?.lastScan?.completedAt
        ? Math.max(0, now - Date.parse(guardian.lastScan.completedAt))
        : null,
    };
  });
}
