import { archiveLegalSeoTasks } from "./taskScope.js";
import { issueIdentity } from "./reliabilityModel.js";
import {
  opportunityGroups,
  queryChanges,
  queryTaskDetail,
} from "./modules/rank/opportunityAnalysis.js";
import { contentPlan } from "./modules/content/contentPlan.js";

export { opportunityGroups, queryChanges, queryTaskDetail, contentPlan };

const day = 86_400_000;

const taskPriorities = new Set(["Alta", "Media", "Bassa"]);
const taskStatuses = new Set([
  "Da fare",
  "In corso",
  "In revisione",
  "Completato",
]);

export function normalizeStoredTasks(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set();
  const normalized = [];
  for (const task of value) {
    const normalizedId =
      typeof task?.id === "string" ? task.id.trim() : "";
    if (
      !task ||
      typeof task !== "object" ||
      !normalizedId ||
      seen.has(normalizedId) ||
      typeof task.title !== "string" ||
      !task.title.trim()
    )
      return fallback;
    seen.add(normalizedId);
    normalized.push({
      ...task,
      id: normalizedId,
      title: task.title.trim(),
      priority: taskPriorities.has(task.priority) ? task.priority : "Media",
      status: taskStatuses.has(task.status) ? task.status : "Da fare",
      due: typeof task.due === "string" ? task.due : "",
      kind: typeof task.kind === "string" && task.kind ? task.kind : "manual",
      client: typeof task.client === "string" ? task.client : "",
      sourceClientId:
        Number.isSafeInteger(task.sourceClientId) && task.sourceClientId > 0
          ? task.sourceClientId
          : null,
      sourceUrl: typeof task.sourceUrl === "string" ? task.sourceUrl : "",
      targetUrl: typeof task.targetUrl === "string" ? task.targetUrl : "",
      detail: typeof task.detail === "string" ? task.detail : "",
      notes: typeof task.notes === "string" ? task.notes : "",
      query: typeof task.query === "string" ? task.query : "",
      stale: task.stale === true,
    });
  }
  return archiveLegalSeoTasks(normalized);
}

export const latestOf = (value) =>
  Array.isArray(value) ? value[0] || null : value || null;

export function normalizeAnalysisHistory(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

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

export function tasksFromAnalysis(analysis, client) {
  const issues = Array.isArray(analysis?.issues) ? analysis.issues : [];
  const tasks = issues.slice(0, 300).map((issue, index) => ({
    id: `analysis-${client.id}-${analysis.analyzedAt}-${index}`,
    title: issue.label,
    client: client.name,
    sourceClientId: client.id,
    priority:
      issue.severity === "alta"
        ? "Alta"
        : issue.severity === "bassa"
          ? "Bassa"
          : "Media",
    due: "Da pianificare",
    status: "Da fare",
    kind: issue.type || "audit",
    targetUrl: issue.targetUrl || issue.url || client.url,
    sourceUrl: issue.sourceUrl || "",
    linkLabel: issue.targetUrl ? "Apri destinazione" : "Apri pagina",
    detail: issue.detail || "",
    notes: "",
    createdAt: new Date().toISOString(),
  }));
  if (issues.length > tasks.length)
    tasks.push({
      id: `analysis-${client.id}-${analysis.analyzedAt}-summary`,
      title: `Rivedi ${issues.length - tasks.length} problemi aggiuntivi dell’audit`,
      client: client.name,
      sourceClientId: client.id,
      priority: "Media",
      due: "Da pianificare",
      status: "Da fare",
      kind: "audit-summary",
      targetUrl: client.url,
      sourceUrl: "",
      detail: `L’audit ha rilevato ${issues.length} problemi. Sono state create task dettagliate per i primi ${tasks.length}; consulta il report cliente per l’elenco completo.`,
      createdAt: new Date().toISOString(),
    });
  return tasks;
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

export function analysisDiff(current, previous) {
  if (!current || !previous) return { newIssues: [], resolvedIssues: [] };
  const key = (issue) => issueIdentity({ issueType: issue.type, issueLabel: issue.label, sourceUrl: issue.sourceUrl || issue.url, issue });
  const reviewKeys = new Set((Array.isArray(current.reviewItems) ? current.reviewItems : []).map(key));
  const pages = Array.isArray(current.pages) ? current.pages : [];
  const verifiableFields = { title: "titleLength", description: "descriptionLength", h1: "h1", image: "missingAlt", thin: "words", performance: "responseMs", depth: "depth" };
  const wasRechecked = issue => {
    const field = verifiableFields[issue.type];
    if (!field || reviewKeys.has(key(issue))) return false;
    return pages.some(page => page.url === (issue.sourceUrl || issue.url) && Number(page.status) >= 200 && Number(page.status) < 300 && Number.isFinite(page[field]));
  };
  const old = new Map(
    (Array.isArray(previous.issues) ? previous.issues : []).map((issue) => [
      key(issue),
      issue,
    ]),
  );
  const now = new Map(
    (Array.isArray(current.issues) ? current.issues : []).map((issue) => [
      key(issue),
      issue,
    ]),
  );
  return {
    newIssues: [...now]
      .filter(([id]) => !old.has(id))
      .map(([, issue]) => issue),
    resolvedIssues: [...old]
      .filter(([id, issue]) => !now.has(id) && wasRechecked(issue))
      .map(([, issue]) => issue),
  };
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
