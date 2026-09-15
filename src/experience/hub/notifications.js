import { compareDatasets } from "../../modules/rank/data.js";

export function buildNotifications({
  tasks,
  dataset,
  previousDataset,
  analysis,
}) {
  const items = [];
  const overdue = tasks.filter(
    (task) =>
      task.status !== "Completato" &&
      task.due &&
      /^\d{4}-\d{2}-\d{2}$/.test(task.due) &&
      new Date(`${task.due}T23:59:59`).getTime() < Date.now(),
  ).length;
  if (overdue)
    items.push({
      tone: "red",
      title: `${overdue} task scadute`,
      text: "Aggiorna scadenza o stato delle attività.",
    });
  const comparison = compareDatasets(dataset, previousDataset);
  if (comparison?.clicks < -10)
    items.push({
      tone: "red",
      title: `Clic in calo del ${Math.abs(comparison.clicks).toFixed(1)}%`,
      text: "Confronto con l’importazione precedente.",
    });
  if (comparison?.impressions > 15)
    items.push({
      tone: "green",
      title: `Impressioni in crescita del ${comparison.impressions.toFixed(1)}%`,
      text: "Valuta le query con maggiore potenziale.",
    });
  if (analysis?.newIssues?.length)
    items.push({
      tone: "red",
      title: `${analysis.newIssues.length} nuovi problemi tecnici`,
      text: "Rilevati rispetto all’analisi precedente.",
    });
  if (analysis?.resolvedIssues?.length)
    items.push({
      tone: "green",
      title: `${analysis.resolvedIssues.length} problemi risolti`,
      text: "Confermati dall’ultima scansione.",
    });
  return items;
}
