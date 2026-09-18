import { buildGrowthMonitoring } from "../../modules/rank/data.js";

export function buildNotifications({
  tasks = [],
  dataset,
  previousDataset,
  analysis,
  rankings = [],
  now = Date.now(),
}) {
  const items = [];
  const overdue = tasks.filter(
    (task) =>
      task.status !== "Completato" &&
      task.due &&
      /^\d{4}-\d{2}-\d{2}$/.test(task.due) &&
      new Date(`${task.due}T23:59:59`).getTime() < now,
  ).length;
  if (overdue)
    items.push({
      id: "tasks:overdue",
      source: "Task",
      tone: "red",
      title: `${overdue} task scadute`,
      text: "Aggiorna scadenza o stato delle attività.",
      page: "Task",
    });

  const monitoring = buildGrowthMonitoring({
    dataset,
    previousDataset,
    rankings,
  });
  items.push(...monitoring.alerts);

  if (analysis?.newIssues?.length)
    items.push({
      id: `audit:new-issues:${analysis.analyzedAt || analysis.startedAt || analysis.newIssues.length}`,
      source: "Audit SEO",
      tone: "red",
      title: `${analysis.newIssues.length} nuovi problemi tecnici`,
      text: "Rilevati rispetto all’analisi precedente. Apri Problemi per verificare le evidenze prima di intervenire.",
      page: "Problemi",
      evidence: { kind: "audit-new-issues", count: analysis.newIssues.length },
    });
  if (analysis?.resolvedIssues?.length)
    items.push({
      id: `audit:resolved-issues:${analysis.analyzedAt || analysis.startedAt || analysis.resolvedIssues.length}`,
      source: "Audit SEO",
      tone: "green",
      title: `${analysis.resolvedIssues.length} problemi risolti`,
      text: "Confermati dall’ultima scansione.",
      page: "Problemi",
      evidence: { kind: "audit-resolved-issues", count: analysis.resolvedIssues.length },
    });

  return items.filter((item, index, all) =>
    item?.id && all.findIndex((candidate) => candidate.id === item.id) === index,
  );
}
