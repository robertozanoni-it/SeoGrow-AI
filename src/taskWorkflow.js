const CONTENT_KINDS = new Set(["search", "cannibalization", "content", "editorial"]);
const CORRECTION_KINDS = new Set(["broken-link", "internal-link", "audit", "technical", "remediation"]);

export function taskWorkflowTarget(task = {}) {
  const kind = String(task.kind || "manual").toLowerCase();
  const text = `${task.title || ""} ${task.detail || ""}`.toLowerCase();
  if (CONTENT_KINDS.has(kind) || /contenut|articol|keyword|cannibali|meta title|meta description/.test(text))
    return { page: "Piano editoriale", label: "Apri nel Piano editoriale" };
  if (CORRECTION_KINDS.has(kind) || /corregg|errore|broken|interrott|redirect|canonical|robots|sitemap/.test(text))
    return { page: "Correzioni", label: "Apri in Correzioni" };
  return null;
}

export function taskWorkflowContext(task = {}) {
  return {
    taskId: task.id || "",
    sourceUrl: task.sourceUrl || "",
    targetUrl: task.targetUrl || "",
    query: task.query || "",
    title: task.title || "",
    kind: task.kind || "manual",
  };
}
