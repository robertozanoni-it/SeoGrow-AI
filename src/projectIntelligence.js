import {
  buildPositioningRows,
  comparableRankingRuns,
  opportunityGroups,
  validRankingRuns,
} from "./modules/rank/index.js";

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value) => String(value || "").trim();
const activeTask = (task) => task && !task.stale && task.status !== "Completato";
const clientTask = (task, client) => task?.sourceClientId === client?.id || (!task?.sourceClientId && text(task?.client) === text(client?.name));
const hasOwn = (value, key) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));

const action = ({ id, title, detail, page, level = "Medio", impact = 50, urgency = 50, confidence = 80, effort = 40, reason = "", source = "" }) => ({
  id, title, detail, page, level, impact, urgency, confidence, effort, reason, source,
  score: Math.round(impact * .4 + urgency * .3 + confidence * .2 - effort * .1),
});

export function buildProjectIntelligence({
  client,
  dataset,
  analysis,
  tasks = [],
  problemSummary = {},
  wordpressConnected = false,
  opportunityCount = 0,
  rankings = [],
  geo = null,
  now = Date.now(),
} = {}) {
  const projectTasks = tasks.filter((task) => clientTask(task, client));
  const openTasks = projectTasks.filter(activeTask);
  const highTasks = openTasks.filter((task) => task.priority === "Alta");
  const today = new Date(now).toISOString().slice(0, 10);
  const overdueTasks = openTasks.filter((task) => /^\d{4}-\d{2}-\d{2}$/.test(String(task?.due || "")) && task.due < today);

  const issues = Array.isArray(analysis?.issues) ? analysis.issues : [];
  const activeIssues = hasOwn(problemSummary, "active") ? number(problemSummary.active) : issues.length;
  const criticalIssues = hasOwn(problemSummary, "high")
    ? number(problemSummary.high)
    : issues.filter((issue) => String(issue?.severity || "").toLowerCase() === "high").length;
  const verificationPending = number(problemSummary.verify);
  const contentSignals = issues.filter((issue) => /content|contenut|meta|title|image|immagin/i.test(`${issue?.type || ""} ${issue?.label || ""} ${issue?.title || ""}`)).length;

  const organicOpportunityCount = dataset
    ? opportunityGroups(dataset).quickWins.length
    : number(opportunityCount);
  const top10 = (dataset?.queries || []).filter((row) => number(row.position) > 0 && number(row.position) <= 10).length;

  const ageDays = (value) => {
    const time = Date.parse(value || "");
    return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / 86_400_000)) : null;
  };
  const auditAgeDays = ageDays(analysis?.analyzedAt || analysis?.startedAt);
  const gscAgeDays = ageDays(dataset?.importedAt || dataset?.dateTo);

  const rankingRuns = validRankingRuns(rankings);
  const latestRanking = rankingRuns[0] || null;
  const previousRanking = latestRanking ? comparableRankingRuns(latestRanking, rankingRuns)[0] || null : null;
  const rankingRows = latestRanking ? buildPositioningRows(latestRanking, previousRanking, rankingRuns) : [];
  const rankingDeclines = rankingRows.filter((row) => Number(row?.delta) < 0);
  const materialRankingDeclines = rankingDeclines.filter((row) => Number(row?.delta) <= -2);
  const severeRankingDeclines = rankingDeclines.filter((row) => Number(row?.delta) <= -5);
  const rankingAgeDays = ageDays(latestRanking?.checkedAt);

  const geoHigh = (geo?.audit?.issues || []).filter((issue) => issue.severity === "Alta").length;
  const geoScore = Number.isFinite(Number(geo?.audit?.score)) ? Number(geo.audit.score) : null;
  const candidates = [];

  if (!analysis) candidates.push(action({
    id: "audit",
    title: "Esegui un audit SEO",
    detail: "Serve una baseline tecnica aggiornata prima di decidere gli interventi.",
    page: "Audit SEO",
    level: "Alto",
    impact: 95,
    urgency: 90,
    confidence: 100,
    effort: 25,
    reason: "audit_missing",
    source: "Audit SEO",
  }));
  else if (auditAgeDays > 30) candidates.push(action({
    id: "audit-refresh",
    title: "Aggiorna l’audit SEO",
    detail: `L’ultimo audit risale a ${auditAgeDays} giorni fa: aggiorna la baseline prima di nuove decisioni tecniche.`,
    page: "Audit SEO",
    level: "Medio",
    impact: 76,
    urgency: 70,
    confidence: 98,
    effort: 25,
    reason: "audit_stale",
    source: "Audit SEO",
  }));

  if (!dataset) candidates.push(action({
    id: "gsc",
    title: "Collega Search Console",
    detail: "Mancano query, pagine e andamento organico verificabili.",
    page: "Integrazioni",
    level: "Alto",
    impact: 92,
    urgency: 85,
    confidence: 100,
    effort: 30,
    reason: "gsc_missing",
    source: "Search Console",
  }));
  else if (gscAgeDays > 14) candidates.push(action({
    id: "gsc-refresh",
    title: "Aggiorna Search Console",
    detail: `I dati organici risalgono a ${gscAgeDays} giorni fa: aggiorna query e pagine prima di valutare la crescita.`,
    page: "Integrazioni",
    level: "Medio",
    impact: 74,
    urgency: 68,
    confidence: 98,
    effort: 20,
    reason: "gsc_stale",
    source: "Search Console",
  }));

  if (criticalIssues) candidates.push(action({
    id: "critical",
    title: `Risolvi ${criticalIssues} problemi critici`,
    detail: `${activeIssues} problemi SEO ancora attivi nel progetto; parti da quelli ad alto impatto.`,
    page: "Problemi",
    level: "Alto",
    impact: 100,
    urgency: 95,
    confidence: 92,
    effort: 55,
    reason: "critical_issues",
    source: "Problemi",
  }));
  if (verificationPending) candidates.push(action({
    id: "verify",
    title: `Verifica ${verificationPending} correzioni`,
    detail: "Esistono interventi applicati che non vanno considerati risolti finché il controllo non li conferma.",
    page: "Correzioni",
    level: "Alto",
    impact: 88,
    urgency: 92,
    confidence: 96,
    effort: 20,
    reason: "verification_pending",
    source: "Problemi",
  }));
  if (activeIssues > 0 && criticalIssues === 0 && verificationPending === 0) candidates.push(action({
    id: "problems",
    title: `Affronta ${activeIssues} problemi SEO aperti`,
    detail: "L’audit contiene finding ancora attivi: apri Problemi e lavora dalla priorità più alta.",
    page: "Problemi",
    level: "Medio",
    impact: 78,
    urgency: 70,
    confidence: 90,
    effort: 50,
    reason: "active_issues",
    source: "Problemi",
  }));

  if (dataset && !latestRanking) candidates.push(action({
    id: "rankings-missing",
    title: "Aggiorna i posizionamenti",
    detail: "Hai dati Search Console ma nessun controllo DataForSEO salvato: crea una baseline delle keyword monitorate.",
    page: "Posizionamenti",
    level: "Medio",
    impact: 72,
    urgency: 58,
    confidence: 100,
    effort: 30,
    reason: "rankings_missing",
    source: "Posizionamenti",
  }));
  else if (rankingAgeDays > 14) candidates.push(action({
    id: "rankings-refresh",
    title: "Aggiorna i posizionamenti",
    detail: `L’ultimo controllo DataForSEO risale a ${rankingAgeDays} giorni fa: aggiorna le posizioni prima di reagire ai trend.`,
    page: "Posizionamenti",
    level: "Medio",
    impact: 73,
    urgency: 66,
    confidence: 98,
    effort: 25,
    reason: "rankings_stale",
    source: "Posizionamenti",
  }));

  if (materialRankingDeclines.length > 0 && rankingAgeDays !== null && rankingAgeDays <= 14) candidates.push(action({
    id: "rankings-decline",
    title: `Controlla ${materialRankingDeclines.length} keyword in calo`,
    detail: severeRankingDeclines.length
      ? `${severeRankingDeclines.length} hanno perso almeno 5 posizioni nell’ultimo confronto DataForSEO.`
      : "Il confronto DataForSEO mostra cali di almeno 2 posizioni: verifica query e URL prima di intervenire.",
    page: "Posizionamenti",
    level: severeRankingDeclines.length ? "Alto" : "Medio",
    impact: severeRankingDeclines.length ? 92 : 82,
    urgency: severeRankingDeclines.length ? 86 : 74,
    confidence: 98,
    effort: 25,
    reason: "ranking_decline",
    source: "Posizionamenti",
  }));

  if (overdueTasks.length) candidates.push(action({
    id: "tasks-overdue",
    title: `Chiudi ${overdueTasks.length} task scadute`,
    detail: `${openTasks.length} task operative sono aperte; quelle scadute hanno precedenza sulle nuove attività.`,
    page: "Task",
    level: "Alto",
    impact: 86,
    urgency: 90,
    confidence: 95,
    effort: 45,
    reason: "overdue_tasks",
    source: "Task",
  }));
  if (highTasks.length) candidates.push(action({
    id: "tasks",
    title: `Completa ${highTasks.length} task ad alta priorità`,
    detail: `${openTasks.length} task operative ancora aperte per questo progetto.`,
    page: "Task",
    level: "Alto",
    impact: 84,
    urgency: 82,
    confidence: 95,
    effort: 50,
    reason: "high_priority_tasks",
    source: "Task",
  }));
  if (organicOpportunityCount > 0) candidates.push(action({
    id: "opportunities",
    title: `Valuta ${organicOpportunityCount} opportunità di crescita`,
    detail: "Query Search Console con visibilità reale e margine SEO disponibile.",
    page: "Opportunità",
    level: "Medio",
    impact: 82,
    urgency: 62,
    confidence: 88,
    effort: 45,
    reason: "organic_opportunities",
    source: "Opportunità",
  }));

  if (contentSignals > 0) candidates.push(action({
    id: "content",
    title: `Migliora ${contentSignals} contenuti`,
    detail: "L’audit segnala elementi editoriali o on-page da riesaminare.",
    page: "Piano editoriale",
    level: "Medio",
    impact: 72,
    urgency: 58,
    confidence: 82,
    effort: 55,
    reason: "content_signals",
    source: "Piano editoriale",
  }));
  if (geoHigh > 0 || (geoScore !== null && geoScore < 70)) candidates.push(action({
    id: "geo",
    title: geoHigh ? `Risolvi ${geoHigh} priorità GEO` : `Migliora il GEO score (${geoScore}/100)`,
    detail: "Il modulo GEO ha rilevato segnali tecnici, di entità o answerability da migliorare.",
    page: "GEO AI",
    level: "Medio",
    impact: 74,
    urgency: 56,
    confidence: 84,
    effort: 45,
    reason: "geo_readiness",
    source: "GEO AI",
  }));
  if (analysis && criticalIssues > 0 && !wordpressConnected) candidates.push(action({
    id: "wordpress",
    title: "Verifica la connessione WordPress",
    detail: "Prima delle remediation controllate serve una connessione WordPress verificabile.",
    page: "Integrazioni",
    level: "Medio",
    impact: 65,
    urgency: 70,
    confidence: 100,
    effort: 20,
    reason: "wordpress_needed",
    source: "Integrazioni",
  }));

  const actions = candidates
    .toSorted((a, b) => b.score - a.score || b.impact - a.impact)
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
    .slice(0, 7);

  const coverage = [Boolean(analysis), Boolean(dataset), Boolean(wordpressConnected)].filter(Boolean).length;
  const operationalSignals = [
    {
      id: "problems",
      label: "Problemi",
      value: activeIssues,
      detail: `${criticalIssues} critici · ${verificationPending} da verificare`,
      page: "Problemi",
    },
    {
      id: "opportunities",
      label: "Opportunità",
      value: organicOpportunityCount,
      detail: "da Search Console",
      page: "Opportunità",
    },
    {
      id: "rankings",
      label: "Posizionamenti",
      value: latestRanking ? materialRankingDeclines.length : "—",
      detail: latestRanking ? `${rankingRows.length} keyword controllate · ${materialRankingDeclines.length} in calo ≥2` : "baseline DataForSEO assente",
      page: "Posizionamenti",
    },
    {
      id: "tasks",
      label: "Task",
      value: openTasks.length,
      detail: `${overdueTasks.length} scadute · ${highTasks.length} alta priorità`,
      page: "Task",
    },
  ];

  return {
    facts: {
      activeIssues,
      criticalIssues,
      verificationPending,
      openTasks: openTasks.length,
      highTasks: highTasks.length,
      overdueTasks: overdueTasks.length,
      opportunityCount: organicOpportunityCount,
      contentSignals,
      top10,
      auditAgeDays,
      gscAgeDays,
      rankingAgeDays,
      rankingKeywords: rankingRows.length,
      rankingDeclines: rankingDeclines.length,
      materialRankingDeclines: materialRankingDeclines.length,
      severeRankingDeclines: severeRankingDeclines.length,
      geoHigh,
      geoScore,
    },
    readiness: Math.round((coverage / 3) * 100),
    operationalSignals,
    actions,
    nextAction: actions[0] || null,
  };
}
