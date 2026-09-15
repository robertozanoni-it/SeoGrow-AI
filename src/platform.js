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
import { buildNotifications } from "./experience/hub/notifications.js";

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
  buildNotifications,
};

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
