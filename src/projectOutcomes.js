const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const projectTask = (task, client) => task?.sourceClientId === client?.id || (!task?.sourceClientId && String(task?.client || "").trim() === String(client?.name || "").trim());

export function buildProjectOutcomes({ client, tasks = [], dataset, previousDataset, problemSummary = {}, geo } = {}) {
  const scoped = tasks.filter((task) => projectTask(task, client) && !task.stale);
  const completedTasks = scoped.filter((task) => task.status === "Completato").length;
  const wordpressResults = scoped.filter((task) => task.status === "Completato" && /wordpress|draft|bozza/i.test(`${task.workflowResult || ""} ${task.completionReason || ""}`)).length;
  const currentClicks = number(dataset?.totals?.clicks);
  const previousClicks = number(previousDataset?.totals?.clicks);
  const clickDeltaPct = previousClicks > 0 ? ((currentClicks - previousClicks) / previousClicks) * 100 : null;
  const resolvedProblems = number(problemSummary.resolved);
  const verifiedCorrections = number(problemSummary.verifiedCorrections);
  const geoScore = Number.isFinite(Number(geo?.audit?.score)) ? Number(geo.audit.score) : null;
  const evidence = [completedTasks > 0, resolvedProblems > 0, verifiedCorrections > 0, clickDeltaPct !== null, geoScore !== null].filter(Boolean).length;
  return {
    completedTasks,
    wordpressResults,
    resolvedProblems,
    verifiedCorrections,
    clickDeltaPct,
    geoScore,
    evidence,
    note: "Variazioni osservate sul progetto: non implicano causalità SEO senza un confronto controllato per URL/query e periodo.",
  };
}
