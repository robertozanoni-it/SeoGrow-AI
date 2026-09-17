import { issueIdentity } from "../../reliabilityModel.js";

const issueSourceUrl = (issue, analysis, client) => {
  const type = String(issue?.type || "").toLowerCase();
  const broken = /broken-(?:external-)?link/.test(type);
  return issue?.sourceUrl || issue?.url || (!broken ? issue?.targetUrl : "") || analysis?.url || client?.url || "";
};

const issueProblemKey = (issue, analysis, client) => {
  const type = String(issue?.type || "").toLowerCase();
  const broken = /broken-(?:external-)?link/.test(type);
  return issueIdentity({
    issueType: issue?.type,
    issueLabel: issue?.label,
    sourceUrl: issueSourceUrl(issue, analysis, client),
    targetUrl: broken ? (issue?.targetUrl || issue?.brokenUrl || issue?.destinationUrl || issue?.href || "") : "",
    issue,
  });
};

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
    origin: "audit",
    automatic: true,
    taskLinks: { problemKey: issueProblemKey(issue, analysis, client) },
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
      origin: "audit",
      automatic: true,
      taskLinks: {},
      createdAt: new Date().toISOString(),
    });
  return tasks;
}
