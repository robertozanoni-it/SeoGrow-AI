import {
  opportunityGroups,
  queryChanges,
  queryTaskDetail,
} from "./modules/rank/opportunityAnalysis.js";
import {
  datasetKey,
  addDatasetToHistory,
  compareDatasets,
} from "./modules/rank/datasetHistory.js";
import { contentPlan } from "./modules/content/contentPlan.js";
import { normalizeStoredTasks } from "./experience/tasks/taskPersistence.js";
import { tasksFromAnalysis } from "./experience/tasks/auditTasks.js";
import {
  latestOf,
  normalizeAnalysisHistory,
  analysisDiff,
} from "./modules/audit/history.js";

export {
  opportunityGroups,
  queryChanges,
  queryTaskDetail,
  datasetKey,
  addDatasetToHistory,
  compareDatasets,
  contentPlan,
  normalizeStoredTasks,
  tasksFromAnalysis,
  latestOf,
  normalizeAnalysisHistory,
  analysisDiff,
};

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

export function downloadCsv(rows, fileName) {
  if (!rows.length) return;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => {
    let text =
      value && typeof value === "object"
        ? JSON.stringify(value)
        : String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [
    columns.map(escape).join(","),
    ...rows.map((row) =>
      columns.map((column) => escape(row[column])).join(","),
    ),
  ].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
