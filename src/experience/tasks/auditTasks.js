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
