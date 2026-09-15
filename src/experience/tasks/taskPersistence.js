import { archiveLegalSeoTasks } from "./taskScope.js";

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
