const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const uniq = (values) => [...new Set(values.filter(Boolean))];

export function geoPageScores(audit) {
  if (!audit?.pagesAudited?.length) return [];
  const issues = Array.isArray(audit.issues) ? audit.issues : [];
  const wordMap = new Map((audit.signals?.pageWordCounts || []).map((item) => [item.url, num(item.words)]));
  const sourceMap = new Map((audit.signals?.pageExternalSources || []).map((item) => [item.url, num(item.count)]));
  return audit.pagesAudited.map((url) => {
    const pageIssues = issues.filter((issue) => issue.url === url);
    const penalty = pageIssues.reduce((sum, issue) => sum + ({ Alta: 22, Media: 10, Bassa: 4, Info: 0 }[issue.severity] || 6), 0);
    const words = wordMap.get(url) || 0;
    const sources = sourceMap.get(url) || 0;
    const answerability = Math.max(0, Math.min(100,
      (words >= 700 ? 55 : words >= 350 ? 42 : words >= 220 ? 30 : 15) +
      (sources > 0 ? 15 : 0) +
      (audit.signals?.hasAuthor ? 10 : 0) +
      (audit.signals?.hasUpdatedDate ? 10 : 0) +
      (pageIssues.some((issue) => /schema|entit/i.test(issue.id || issue.title)) ? 0 : 10),
    ));
    return { url, score: Math.max(0, 100 - penalty), answerability, words, sources, issues: pageIssues.length };
  }).sort((a, b) => a.score - b.score || a.answerability - b.answerability);
}

export function geoEntityProfile(audit) {
  const types = Array.isArray(audit?.schemaTypes) ? audit.schemaTypes : [];
  const entityType = types.find((type) => /Organization|LocalBusiness|Person/i.test(type)) || "Non rilevata";
  const checks = [
    ["Entità principale", entityType !== "Non rilevata"],
    ["Pagina identità", Boolean(audit?.signals?.hasAbout)],
    ["Contatti", Boolean(audit?.signals?.hasContact)],
    ["Autore/revisore", Boolean(audit?.signals?.hasAuthor)],
    ["Freshness", Boolean(audit?.signals?.hasUpdatedDate)],
  ];
  const passed = checks.filter(([, ok]) => ok).length;
  return { entityType, score: Math.round((passed / checks.length) * 100), checks: checks.map(([label, ok]) => ({ label, ok })) };
}

export function geoQueryMonitor({ questions = [], simulation, history = [] } = {}) {
  const current = new Map((simulation?.results || []).map((item) => [String(item.question || '').toLowerCase(), item]));
  return uniq(questions).map((question) => {
    const item = current.get(String(question).toLowerCase());
    const prior = history.toReversed().flatMap((entry) => entry.simulation?.results || []).find((row) => String(row.question || '').toLowerCase() === String(question).toLowerCase());
    return {
      question,
      coverage: item?.coverage || "Da verificare",
      bestUrl: item?.bestUrl || "",
      gap: item?.gap || "",
      previousCoverage: prior?.coverage || "",
      changed: Boolean(item && prior && item.coverage !== prior.coverage),
    };
  });
}

export function geoStrategies({ audit, simulation, observation } = {}) {
  const strategies = [];
  for (const issue of audit?.issues || []) {
    strategies.push({ id:`audit:${issue.id}`, title:issue.title, detail:issue.recommendation, url:issue.url || audit.url || "", priority:issue.severity === "Alta" ? 92 : issue.severity === "Media" ? 72 : 52, source:"Audit GEO", kind:"geo" });
  }
  for (const item of simulation?.results || []) {
    if (item.coverage === "Coperta") continue;
    strategies.push({ id:`question:${item.question}`, title:`Migliora la risposta: ${item.question}`, detail:item.gap || "Rendi la risposta più completa e verificabile.", url:item.bestUrl || "", priority:item.coverage === "Scoperta" ? 88 : 68, source:"Simulazione OpenAI", kind:"geo-content" });
  }
  for (const query of observation?.queries || []) {
    if (query.ownedPresence) continue;
    strategies.push({ id:`serp:${query.query}`, title:`Rafforza la presenza per: ${query.query}`, detail:`Il dominio non compare nei primi risultati osservati. Competitor principali: ${(query.competitors || []).slice(0, 3).join(", ") || "non disponibili"}.`, url:"", priority:64, source:"DataForSEO SERP", kind:"geo-serp" });
  }
  return strategies.sort((a,b) => b.priority - a.priority).filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index);
}

export function appendGeoHistory(history = [], entry = {}, limit = 24) {
  const next = { ...entry, capturedAt: entry.capturedAt || new Date().toISOString() };
  return [next, ...(Array.isArray(history) ? history : [])].slice(0, limit);
}
