export const AUTOMATION_RISK = Object.freeze({ OBSERVE: "L0", DIAGNOSE: "L1", SAFE: "L2", APPROVAL: "L3" });

export const AUTOMATION_GRAPH = Object.freeze([
  Object.freeze({ id: "guardian", dependsOn: [], risk: AUTOMATION_RISK.OBSERVE, paid: false }),
  Object.freeze({ id: "data-freshness", dependsOn: ["guardian"], risk: AUTOMATION_RISK.OBSERVE, paid: false }),
  Object.freeze({ id: "integration-health", dependsOn: ["guardian"], risk: AUTOMATION_RISK.OBSERVE, paid: false }),
  Object.freeze({ id: "auto-remediation", dependsOn: ["guardian", "integration-health"], risk: AUTOMATION_RISK.SAFE, paid: false }),
  Object.freeze({ id: "visual-ux", dependsOn: ["guardian"], risk: AUTOMATION_RISK.OBSERVE, paid: false }),
  Object.freeze({ id: "capability-evolution", dependsOn: ["guardian", "visual-ux"], risk: AUTOMATION_RISK.DIAGNOSE, paid: false }),
]);

const graphMap = new Map(AUTOMATION_GRAPH.map((item) => [item.id, item]));

export function automationExecutionPlan({
  requested = AUTOMATION_GRAPH.map((item) => item.id),
  approvals = [],
  paidBudget = 0,
  failures = [],
  maxSteps = 12,
} = {}) {
  const wanted = new Set(requested);
  const approved = new Set(approvals);
  const failed = new Set(failures);
  const selected = AUTOMATION_GRAPH.filter((item) => wanted.has(item.id));
  const output = [];
  const completed = new Set();
  let paidUsed = 0;

  while (output.length < selected.length && output.length < maxSteps) {
    const ready = selected.find((item) => !completed.has(item.id) && item.dependsOn.every((id) => completed.has(id) || !wanted.has(id)));
    if (!ready) break;
    const blockedDependency = ready.dependsOn.find((id) => failed.has(id));
    let state = "ready", reason = "";
    if (blockedDependency) { state = "blocked"; reason = `Dipendenza fallita: ${blockedDependency}`; }
    else if (ready.risk === AUTOMATION_RISK.APPROVAL && !approved.has(ready.id)) { state = "approval_required"; reason = "Approvazione esplicita richiesta."; }
    else if (ready.paid && paidUsed >= paidBudget) { state = "budget_blocked"; reason = "Budget provider esaurito."; }
    else if (failed.has(ready.id)) { state = "circuit_open"; reason = "Circuit breaker: automazione già fallita in questo run."; }
    if (ready.paid && state === "ready") paidUsed += 1;
    output.push({ ...ready, state, reason });
    completed.add(ready.id);
  }

  const unresolved = selected.filter((item) => !completed.has(item.id)).map((item) => item.id);
  return {
    steps: output,
    unresolved,
    circuitOpen: failures.length > 0,
    paidUsed,
    safeToRun: unresolved.length === 0 && output.every((item) => !["approval_required", "budget_blocked"].includes(item.state)),
  };
}

export function validateAutomationGraph(graph = AUTOMATION_GRAPH) {
  const ids = new Set(graph.map((item) => item.id));
  const errors = [];
  if (ids.size !== graph.length) errors.push("Automation id duplicato.");
  for (const item of graph) for (const dependency of item.dependsOn) if (!ids.has(dependency)) errors.push(`Dipendenza mancante: ${item.id} -> ${dependency}`);
  for (const start of graph) {
    const visiting = new Set(), visited = new Set();
    const walk = (id) => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      for (const dependency of graphMap.get(id)?.dependsOn || []) if (walk(dependency)) return true;
      visiting.delete(id); visited.add(id); return false;
    };
    if (walk(start.id)) { errors.push("Dependency cycle rilevato."); break; }
  }
  return { ok: errors.length === 0, errors };
}
