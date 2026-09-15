const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value) => String(value || "").trim();
const activeTask = (task) => task && !task.stale && task.status !== "Completato";
const clientTask = (task, client) => task?.sourceClientId === client?.id || (!task?.sourceClientId && text(task?.client) === text(client?.name));

const action = ({ id, title, detail, page, level = "Medio", impact = 50, urgency = 50, confidence = 80, effort = 40, reason = "" }) => ({
  id, title, detail, page, level, impact, urgency, confidence, effort, reason,
  score: Math.round(impact * .4 + urgency * .3 + confidence * .2 - effort * .1),
});

export function buildProjectIntelligence({ client, dataset, analysis, tasks = [], problemSummary = {}, wordpressConnected = false, opportunityCount = 0, geo = null, now = Date.now() } = {}) {
  const projectTasks = tasks.filter((task) => clientTask(task, client));
  const openTasks = projectTasks.filter(activeTask);
  const highTasks = openTasks.filter((task) => task.priority === "Alta");
  const issues = Array.isArray(analysis?.issues) ? analysis.issues : [];
  const criticalIssues = Math.max(number(problemSummary.high), issues.filter((issue) => String(issue?.severity || "").toLowerCase() === "high").length);
  const verificationPending = number(problemSummary.verify);
  const contentSignals = issues.filter((issue) => /content|contenut|meta|title|image|immagin/i.test(`${issue?.type || ""} ${issue?.label || ""} ${issue?.title || ""}`)).length;
  const top10 = (dataset?.queries || []).filter((row) => number(row.position) > 0 && number(row.position) <= 10).length;
  const ageDays = (value) => { const time = Date.parse(value || ""); return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / 86_400_000)) : null; };
  const auditAgeDays = ageDays(analysis?.analyzedAt || analysis?.startedAt);
  const gscAgeDays = ageDays(dataset?.importedAt || dataset?.dateTo);
  const geoHigh = (geo?.audit?.issues || []).filter((issue) => issue.severity === "Alta").length;
  const geoScore = Number.isFinite(Number(geo?.audit?.score)) ? Number(geo.audit.score) : null;
  const candidates = [];

  if (!analysis) candidates.push(action({ id:"audit", title:"Esegui un audit SEO", detail:"Serve una baseline tecnica aggiornata prima di decidere gli interventi.", page:"Audit SEO", level:"Alto", impact:95, urgency:90, confidence:100, effort:25, reason:"audit_missing" }));
  else if (auditAgeDays > 30) candidates.push(action({ id:"audit-refresh", title:"Aggiorna l’audit SEO", detail:`L’ultimo audit risale a ${auditAgeDays} giorni fa: aggiorna la baseline prima di nuove decisioni tecniche.`, page:"Audit SEO", level:"Medio", impact:76, urgency:70, confidence:98, effort:25, reason:"audit_stale" }));
  if (!dataset) candidates.push(action({ id:"gsc", title:"Collega Search Console", detail:"Mancano query, pagine e andamento organico verificabili.", page:"Integrazioni", level:"Alto", impact:92, urgency:85, confidence:100, effort:30, reason:"gsc_missing" }));
  else if (gscAgeDays > 14) candidates.push(action({ id:"gsc-refresh", title:"Aggiorna Search Console", detail:`I dati organici risalgono a ${gscAgeDays} giorni fa: aggiorna query e pagine prima di valutare la crescita.`, page:"Integrazioni", level:"Medio", impact:74, urgency:68, confidence:98, effort:20, reason:"gsc_stale" }));
  if (criticalIssues) candidates.push(action({ id:"critical", title:`Risolvi ${criticalIssues} problemi critici`, detail:`${issues.length || number(problemSummary.active)} problemi rilevati nel progetto; parti da quelli ad alto impatto.`, page:"Problemi", level:"Alto", impact:100, urgency:95, confidence:92, effort:55, reason:"critical_issues" }));
  if (verificationPending) candidates.push(action({ id:"verify", title:`Verifica ${verificationPending} correzioni`, detail:"Esistono interventi applicati che non vanno considerati risolti finché il controllo non li conferma.", page:"Correzioni", level:"Alto", impact:88, urgency:92, confidence:96, effort:20, reason:"verification_pending" }));
  if (highTasks.length) candidates.push(action({ id:"tasks", title:`Completa ${highTasks.length} task ad alta priorità`, detail:`${openTasks.length} task operative ancora aperte per questo progetto.`, page:"Task", level:"Alto", impact:84, urgency:82, confidence:95, effort:50, reason:"high_priority_tasks" }));
  if (opportunityCount > 0) candidates.push(action({ id:"opportunities", title:`Valuta ${opportunityCount} opportunità di crescita`, detail:"Query e pagine con visibilità reale e margine SEO disponibile.", page:"Opportunità", level:"Medio", impact:82, urgency:62, confidence:88, effort:45, reason:"organic_opportunities" }));
  if (contentSignals > 0) candidates.push(action({ id:"content", title:`Migliora ${contentSignals} contenuti`, detail:"L’audit segnala elementi editoriali o on-page da riesaminare.", page:"Piano editoriale", level:"Medio", impact:72, urgency:58, confidence:82, effort:55, reason:"content_signals" }));
  if (geoHigh > 0 || (geoScore !== null && geoScore < 70)) candidates.push(action({ id:"geo", title:geoHigh ? `Risolvi ${geoHigh} priorità GEO` : `Migliora il GEO score (${geoScore}/100)`, detail:"Il modulo GEO ha rilevato segnali tecnici, di entità o answerability da migliorare.", page:"GEO AI", level:"Medio", impact:74, urgency:56, confidence:84, effort:45, reason:"geo_readiness" }));
  if (analysis && criticalIssues > 0 && !wordpressConnected) candidates.push(action({ id:"wordpress", title:"Verifica la connessione WordPress", detail:"Prima delle remediation controllate serve una connessione WordPress verificabile.", page:"Integrazioni", level:"Medio", impact:65, urgency:70, confidence:100, effort:20, reason:"wordpress_needed" }));

  const actions = candidates.toSorted((a, b) => b.score - a.score || b.impact - a.impact).filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index).slice(0, 5);
  const coverage = [Boolean(analysis), Boolean(dataset), Boolean(wordpressConnected)].filter(Boolean).length;
  return {
    facts: { criticalIssues, verificationPending, openTasks: openTasks.length, highTasks: highTasks.length, opportunityCount, contentSignals, top10, auditAgeDays, gscAgeDays, geoHigh, geoScore },
    readiness: Math.round((coverage / 3) * 100),
    actions,
    nextAction: actions[0] || null,
  };
}
