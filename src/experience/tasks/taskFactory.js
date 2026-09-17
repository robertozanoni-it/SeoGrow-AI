import { normalizeTaskLinks } from "./taskLinkage.js";

const priorities = new Set(["Alta", "Media", "Bassa"]);
const origins = new Set(["manual", "audit", "opportunity", "correction", "workflow"]);

export function createTaskDraft(values = {}, { client, clientId, now = () => new Date(), idFactory } = {}) {
  const title = String(values.title || "").trim();
  if (!title) throw new Error("Task senza titolo.");
  if (!Number.isSafeInteger(Number(clientId)) || Number(clientId) <= 0) throw new Error("Cliente task non valido.");
  const createdAt = now().toISOString();
  const origin = origins.has(String(values.origin || "").toLowerCase()) ? String(values.origin).toLowerCase() : "manual";
  const id = idFactory ? idFactory() : `${origin === "manual" ? "manual" : origin}-${Date.parse(createdAt)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    title,
    client: String(client?.name || values.client || "").trim(),
    sourceClientId: Number(clientId),
    priority: priorities.has(values.priority) ? values.priority : "Media",
    due: values.due || "Da pianificare",
    status: values.status || "Da fare",
    kind: String(values.kind || "manual"),
    targetUrl: String(values.targetUrl || ""),
    sourceUrl: String(values.sourceUrl || ""),
    linkLabel: values.linkLabel || (values.targetUrl ? "Apri risorsa" : "Apri pagina"),
    ...(values.query ? { query: String(values.query), associationStatus: values.associationStatus } : {}),
    detail: String(values.detail || ""),
    notes: String(values.notes || ""),
    origin,
    automatic: origin !== "manual" || values.automatic === true,
    taskLinks: normalizeTaskLinks(values.taskLinks),
    createdAt,
  };
}
