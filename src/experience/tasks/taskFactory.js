const priorities = new Set(["Alta", "Media", "Bassa"]);

export function createTaskDraft(values = {}, { client, clientId, now = () => new Date(), idFactory } = {}) {
  const title = String(values.title || "").trim();
  if (!title) throw new Error("Task senza titolo.");
  if (!Number.isSafeInteger(Number(clientId)) || Number(clientId) <= 0) throw new Error("Cliente task non valido.");
  const createdAt = now().toISOString();
  const id = idFactory ? idFactory() : `manual-${Date.parse(createdAt)}-${Math.random().toString(36).slice(2, 7)}`;
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
    createdAt,
  };
}
