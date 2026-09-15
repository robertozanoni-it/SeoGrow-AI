const time = value => { const parsed = Date.parse(value || ""); return Number.isFinite(parsed) ? parsed : 0; };
export function buildProjectHistory({ audits = [], tasks = [], corrections = [] } = {}) {
  const events = [];
  audits.forEach((item, index) => events.push({ id:`audit-${item.analyzedAt || index}`, date:item.analyzedAt || "", type:"Audit", title:index === 0 ? "Audit completo" : "Audit SEO", score:item.score, detail:`${item.pagesChecked || 0} pagine · ${(item.issues || []).length} problemi` }));
  corrections.forEach((item, index) => events.push({ id:`correction-${item.id || index}`, date:item.verifiedAt || item.appliedAt || "", type:"Correzione", title:item.issueLabel || "Correzione SEO", detail:item.status || "", url:item.sourceUrl || "" }));
  tasks.filter(item => item.status === "Completato").forEach((item, index) => events.push({ id:`task-${item.id || index}`, date:item.completedAt || item.updatedAt || "", type:item.workflowResult ? "Contenuto" : "Task", title:item.title || "Task completata", detail:item.completionReason || "Completata", url:item.workflowUrl || item.sourceUrl || item.targetUrl || "" }));
  return events.filter(item => time(item.date) > 0).toSorted((a,b) => time(b.date) - time(a.date));
}
