import {
  opportunityGroups,
  queryChanges,
  queryTaskDetail,
} from "./modules/rank/opportunityAnalysis.js";
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
  contentPlan,
  normalizeStoredTasks,
  tasksFromAnalysis,
  latestOf,
  normalizeAnalysisHistory,
  analysisDiff,
};

const day = 86_400_000;

export function datasetKey(dataset) {
  let hash = 2166136261;
  const add = (value) => {
    const text = String(value ?? "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  };
  for (const section of ["graph", "queries", "pages", "countries", "devices", "queryPages"]) {
    add(section);
    for (const row of dataset?.[section] || []) {
      add(row.dimension || row.query || row.date);
      add(row.clicks);
      add(row.impressions);
      add(row.ctr);
      add(row.position);
      if (row.pages) row.pages.forEach(add);
    }
  }
  return [
    dataset?.property?.host,
    dataset?.dateFrom,
    dataset?.dateTo,
    dataset?.totals?.clicks,
    dataset?.totals?.impressions,
    (dataset?.queries || []).length,
    (hash >>> 0).toString(36),
  ].join("|");
}

export function addDatasetToHistory(history, clientId, dataset) {
  const current = Array.isArray(history?.[clientId]) ? history[clientId] : [];
  const next = [
    dataset,
    ...current.filter((item) => datasetKey(item) !== datasetKey(dataset)),
  ]
    .toSorted(
      (a, b) =>
        String(b.dateTo || b.importedAt).localeCompare(
          String(a.dateTo || a.importedAt),
        ) || String(b.importedAt).localeCompare(String(a.importedAt)),
    )
    .slice(0, 24);
  return { ...(history || {}), [clientId]: next };
}

export function compareDatasets(current, previous) {
  if (!current || !previous) return null;
  const duration = (dataset) => {
    const start = Date.parse(`${dataset.dateFrom}T00:00:00Z`);
    const end = Date.parse(`${dataset.dateTo}T00:00:00Z`);
    return Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(1, Math.round((end - start) / day) + 1)
      : null;
  };
  const currentDays = duration(current);
  const previousDays = duration(previous);
  if (
    currentDays &&
    previousDays &&
    Math.abs(currentDays - previousDays) / Math.max(currentDays, previousDays) >
      0.1
  )
    return null;
  const currentStart = Date.parse(`${current.dateFrom}T00:00:00Z`);
  const previousEnd = Date.parse(`${previous.dateTo}T00:00:00Z`);
  if (
    Number.isFinite(currentStart) &&
    Number.isFinite(previousEnd) &&
    (previousEnd >= currentStart || currentStart - previousEnd > 8 * day)
  )
    return null;
  const change = (now, before) =>
    before ? ((now - before) / before) * 100 : null;
  return {
    clicks: change(current.totals.clicks, previous.totals.clicks),
    impressions: change(
      current.totals.impressions,
      previous.totals.impressions,
    ),
    ctr: current.totals.ctr - previous.totals.ctr,
    position: current.totals.position - previous.totals.position,
  };
}

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
