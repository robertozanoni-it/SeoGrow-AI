export const GEO_SCOPE = Object.freeze({
  title: "GEO evidence & readiness",
  measures: Object.freeze([
    "accesso dichiarato in robots.txt per crawler rilevanti",
    "schema JSON-LD ed entità esplicitamente presenti nelle pagine analizzate",
    "segnali editoriali osservabili: pagina identità, contatti, autore/revisore, data di aggiornamento",
    "contenuto disponibile, fonti esterne osservate e lacune informative nel materiale del progetto",
    "diagnostica OpenAI sulle domande usando esclusivamente il contesto fornito dal progetto",
    "presenza del dominio/brand nelle SERP Google osservate tramite DataForSEO",
  ]),
  doesNotMeasure: Object.freeze([
    "citazioni reali o ranking in ChatGPT, Gemini, Perplexity o altri motori generativi",
    "share of voice AI",
    "autorevolezza del brand come punteggio numerico",
    "probabilità futura di essere citati da un modello AI",
  ]),
});

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const numberOrNull = (value) => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const normalizeKey = (value) => text(value).toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);

const evidence = ({ id, label, value, state, source, detail = "", url = "" }) => ({
  id,
  label,
  value,
  state,
  source,
  detail: text(detail),
  url: text(url),
});

const issueCategory = (issue = {}) => {
  const value = `${issue.id || ""} ${issue.title || ""} ${issue.detail || ""}`.toLocaleLowerCase("it");
  if (/robot|crawler|crawl|access/.test(value)) return "accessibility";
  if (/schema|json-ld|entity|entit|organization|localbusiness|person/.test(value)) return "entity-schema";
  if (/author|autore|revisor|fresh|aggiornat|date|fonte|source|citab/.test(value)) return "citability-authority";
  return "content";
};

const mainEntityType = (types) => list(types).find((type) => /^(?:Organization|LocalBusiness|Person)$/i.test(String(type))) || "";

export function buildGeoEvidenceModel({ audit = null, simulation = null, observation = null } = {}) {
  const signals = audit?.signals && typeof audit.signals === "object" ? audit.signals : {};
  const crawler = audit?.crawlerAccess && typeof audit.crawlerAccess === "object" ? audit.crawlerAccess : {};
  const schemaTypes = list(audit?.schemaTypes).map(String).filter(Boolean);
  const wordCounts = list(signals.pageWordCounts).map((item) => ({ url: text(item?.url), words: numberOrNull(item?.words) })).filter((item) => item.url);
  const externalSources = list(signals.pageExternalSources).map((item) => ({ url: text(item?.url), count: numberOrNull(item?.count) })).filter((item) => item.url);
  const externalSourceLinks = externalSources.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const entityType = mainEntityType(schemaTypes);
  const simulationResults = list(simulation?.results);
  const observedQueries = list(observation?.queries);

  const facets = [
    {
      key: "accessibility",
      label: "Accesso e leggibilità tecnica",
      evidence: audit ? [
        evidence({ id: "oai-searchbot", label: "OAI-SearchBot in robots.txt", value: crawler.oaiSearchBot ? "Non bloccato" : "Bloccato", state: crawler.oaiSearchBot ? "observed-pass" : "observed-gap", source: "robots.txt", detail: "Verifica della regola dichiarata in robots.txt; non prova una scansione reale." }),
        evidence({ id: "googlebot", label: "Googlebot in robots.txt", value: crawler.googlebot ? "Non bloccato" : "Bloccato", state: crawler.googlebot ? "observed-pass" : "observed-gap", source: "robots.txt", detail: "Verifica della regola dichiarata in robots.txt; non misura le funzioni AI di Google." }),
        evidence({ id: "pages-audited", label: "Pagine lette dall'audit GEO", value: list(audit.pagesAudited).length, state: "observed", source: "Audit GEO" }),
      ] : [],
    },
    {
      key: "entity-schema",
      label: "Entità e schema",
      evidence: audit ? [
        evidence({ id: "entity-type", label: "Entità principale esplicita", value: entityType || "Non rilevata", state: entityType ? "observed-pass" : "observed-gap", source: "JSON-LD", detail: schemaTypes.length ? `Tipi rilevati: ${schemaTypes.join(", ")}` : "Nessun tipo schema rilevato nelle pagine analizzate." }),
        evidence({ id: "schema-types", label: "Tipi schema rilevati", value: schemaTypes.length, state: schemaTypes.length ? "observed" : "observed-gap", source: "JSON-LD", detail: schemaTypes.join(", ") }),
        evidence({ id: "about", label: "Pagina/segnale identità", value: signals.hasAbout ? "Rilevato" : "Non rilevato", state: signals.hasAbout ? "observed-pass" : "observed-gap", source: "Audit GEO" }),
        evidence({ id: "contact", label: "Contatti", value: signals.hasContact ? "Rilevati" : "Non rilevati", state: signals.hasContact ? "observed-pass" : "observed-gap", source: "Audit GEO" }),
      ] : [],
    },
    {
      key: "citability-authority",
      label: "Citabilità e segnali di autorevolezza",
      evidence: audit ? [
        evidence({ id: "author", label: "Autore/revisore", value: signals.hasAuthor ? "Rilevato" : "Non rilevato", state: signals.hasAuthor ? "observed-pass" : "observed-gap", source: "Audit GEO", detail: "Segnale editoriale osservato; non è un punteggio di autorevolezza." }),
        evidence({ id: "updated", label: "Data di aggiornamento", value: signals.hasUpdatedDate ? "Rilevata" : "Non rilevata", state: signals.hasUpdatedDate ? "observed-pass" : "observed-gap", source: "Audit GEO" }),
        evidence({ id: "external-sources", label: "Link a fonti esterne osservati", value: externalSourceLinks, state: "observed", source: "Audit GEO", detail: `${externalSources.filter((item) => (item.count ?? 0) > 0).length} pagina/e con almeno una fonte esterna.` }),
      ] : [],
    },
    {
      key: "content",
      label: "Contenuto e answerability",
      evidence: [
        ...(audit ? [
          evidence({ id: "word-counts", label: "Pagine con conteggio testo", value: wordCounts.length, state: "observed", source: "Audit GEO", detail: "Il conteggio parole è evidenza quantitativa grezza, non un indice GEO." }),
        ] : []),
        ...(simulation ? [
          evidence({ id: "openai-diagnostic", label: "Domande diagnosticate con OpenAI", value: simulationResults.length, state: "diagnostic", source: "OpenAI", detail: "Test sul materiale fornito dal progetto; non misura presenza o citazioni reali nei motori AI." }),
        ] : []),
      ],
    },
    {
      key: "presence",
      label: "Presenza osservabile",
      evidence: observation ? [
        evidence({ id: "serp-observed", label: "Query Google osservate", value: observedQueries.length, state: "observed", source: "DataForSEO SERP", detail: "Osservazione Google SERP; non è presenza nei motori generativi." }),
        evidence({ id: "domain-presence", label: "Query con dominio nei risultati osservati", value: Number(observation?.summary?.ownedPresence || 0), state: "observed", source: "DataForSEO SERP" }),
        evidence({ id: "brand-text-presence", label: "Query con brand testuale nei risultati osservati", value: Number(observation?.summary?.brandTextPresence || 0), state: "observed", source: "DataForSEO SERP" }),
      ] : [],
    },
  ];

  return {
    scope: GEO_SCOPE,
    facets,
    counts: {
      auditIssues: list(audit?.issues).length,
      pagesAudited: list(audit?.pagesAudited).length,
      schemaTypes: schemaTypes.length,
      externalSourceLinks,
      diagnosticQuestions: simulationResults.length,
      serpQueriesObserved: observedQueries.length,
    },
    hasEvidence: Boolean(audit || simulation || observation),
  };
}

const operationalItem = ({ id, category, title, detail, recommendation, url = "", evidenceKind, source, severity = "", actionKind = "task", query = "" }) => ({
  id,
  category,
  title: text(title),
  detail: text(detail),
  recommendation: text(recommendation),
  url: text(url),
  evidenceKind,
  source,
  severity: text(severity),
  actionKind,
  query: text(query),
});

export function buildGeoOperationalItems({ audit = null, simulation = null, observation = null } = {}) {
  const rows = [];
  for (const issue of list(audit?.issues)) {
    rows.push(operationalItem({
      id: `geo-audit-${normalizeKey(issue.id || `${issue.title}-${issue.url}`)}`,
      category: issueCategory(issue),
      title: issue.title || "Segnale GEO da correggere",
      detail: issue.detail,
      recommendation: issue.recommendation || "Verifica il segnale e pianifica l'intervento nel modulo proprietario.",
      url: issue.url || audit?.url || "",
      evidenceKind: "observed",
      source: "Audit GEO",
      severity: issue.severity,
      actionKind: /contenut|answer|author|fresh|source|citab/i.test(`${issue.id || ""} ${issue.title || ""}`) ? "content" : "task",
    }));
  }

  for (const item of list(simulation?.results)) {
    if (item?.coverage === "Coperta") continue;
    rows.push(operationalItem({
      id: `geo-diagnostic-${normalizeKey(item.question)}`,
      category: "content",
      title: `Colma il gap informativo: ${item.question}`,
      detail: item.gap || "Il materiale fornito non consente una risposta completa alla domanda diagnostica.",
      recommendation: "Rivedi il contenuto pertinente usando fonti verificabili e una risposta più diretta; valida editorialmente prima della pubblicazione.",
      url: item.bestUrl || "",
      evidenceKind: "diagnostic",
      source: "Diagnostica OpenAI",
      actionKind: "content",
      query: item.question,
    }));
  }

  for (const item of list(observation?.queries)) {
    if (item?.ownedPresence) continue;
    rows.push(operationalItem({
      id: `geo-serp-${normalizeKey(item.query)}`,
      category: "presence",
      title: `Presenza Google da rafforzare: ${item.query}`,
      detail: `Il dominio non è stato rilevato nei risultati Google osservati per questa query. ${(item.competitors || []).length ? `Domini osservati: ${(item.competitors || []).slice(0, 3).join(", ")}.` : ""}`,
      recommendation: "Valuta il gap di contenuto, entità e fonti; non interpretare questo dato come assenza nei motori AI.",
      url: item.ownedUrl || "",
      evidenceKind: "observed-serp",
      source: "DataForSEO SERP",
      actionKind: "content",
      query: item.query,
    }));
  }

  const unique = new Map();
  for (const item of rows) if (!unique.has(item.id)) unique.set(item.id, item);
  return [...unique.values()];
}

export function geoOpportunityInputs(input = {}) {
  return buildGeoOperationalItems(input).map((item) => ({
    id: item.id,
    title: item.title,
    reason: `${item.detail}${item.recommendation ? ` · Intervento: ${item.recommendation}` : ""}`,
    url: item.url,
    severity: item.severity,
    evidenceKind: item.evidenceKind,
    source: item.source,
    category: item.category,
    query: item.query,
    actionKind: item.actionKind,
  }));
}
