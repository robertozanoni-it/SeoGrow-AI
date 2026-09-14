const normalizeUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return String(value || "").trim();
  }
};

const findingUrl = (item, fallback = "") => item?.sourceUrl || item?.url || item?.targetUrl || fallback || "";
const findingTitle = (item) => String(item?.label || item?.title || item?.type || "").trim();

export function findProblemFinding(analysis, detail = {}) {
  const rows = [
    ...(Array.isArray(analysis?.issues) ? analysis.issues.map((item) => ({ item, kind: "issue" })) : []),
    ...(Array.isArray(analysis?.reviewItems) ? analysis.reviewItems.map((item) => ({ item, kind: "review" })) : []),
  ];
  const wantedTitle = String(detail?.title || detail?.issueLabel || "").trim().toLowerCase();
  const wantedType = String(detail?.issueType || "").trim().toLowerCase();
  const wantedUrl = normalizeUrl(detail?.sourceUrl || detail?.url || "");

  return rows.find(({ item }) => {
    const title = findingTitle(item).toLowerCase();
    const type = String(item?.type || "").trim().toLowerCase();
    const url = normalizeUrl(findingUrl(item, analysis?.url));
    const titleMatches = !wantedTitle || title === wantedTitle || title.includes(wantedTitle) || wantedTitle.includes(title);
    const typeMatches = !wantedType || type === wantedType;
    const urlMatches = !wantedUrl || url === wantedUrl;
    return titleMatches && typeMatches && urlMatches;
  }) || null;
}

const canonicalGuidance = {
  interpretation: "L’audit ha rilevato una canonical diversa dall’URL analizzato. Questo è un segnale da confermare, non una prova automatica di errore: la canonical può essere intenzionale per alias, slash, protocollo o consolidamento URL.",
  recommendation: "Riesegui l’audit della singola URL e confronta URL analizzato, URL finale e canonical dichiarata. Correggi la canonical solo se punta a una risorsa diversa da quella che vuoi indicizzare; se la differenza è intenzionale, mantienila e marca il caso come intenzionale.",
};

const indexabilityGuidance = {
  interpretation: "Il segnale riguarda indicizzazione o direttive robots e richiede una verifica contestuale recente prima di qualsiasi modifica.",
  recommendation: "Riesegui l’audit della pagina e verifica robots, noindex, canonical, redirect e URL finale. Modifica solo la direttiva che risulta realmente incoerente con l’obiettivo di indicizzazione della pagina.",
};

const genericGuidance = {
  interpretation: "Il finding è classificato come da confermare: i dati salvati descrivono un possibile problema ma non bastano per dichiararlo errore certo o risolto.",
  recommendation: "Riesegui un audit recente della URL interessata e confronta l’evidenza nuova con quella salvata. Intervieni solo dopo la conferma del problema e conserva lo storico della verifica.",
};

const guidanceFor = (detail, finding) => {
  const text = `${detail?.issueType || ""} ${detail?.title || ""} ${finding?.item?.type || ""} ${findingTitle(finding?.item)}`.toLowerCase();
  if (/canonical/.test(text)) return canonicalGuidance;
  if (/noindex|robots|indexability|indicizz|redirect/.test(text)) return indexabilityGuidance;
  return genericGuidance;
};

const evidenceRows = (detail, finding) => {
  const rows = [];
  if (finding?.item?.detail) rows.push({ metric: "audit", value: finding.item.detail });
  if (finding?.kind) rows.push({ metric: "stato", value: finding.kind === "review" ? "Da confermare" : "Problema rilevato" });
  for (const entry of Array.isArray(detail?.evidence) ? detail.evidence : []) {
    const value = typeof entry === "string" ? entry : entry?.detail || entry?.value || "";
    if (value) rows.push({ metric: entry?.source || entry?.label || "evidenza", value });
  }
  if (!rows.length && detail?.detail) rows.push({ metric: "evidenza", value: detail.detail });
  return rows.slice(0, 6);
};

export function buildProblemAgentRun({ goal, detail, analysis, projectId }) {
  const now = new Date().toISOString();
  const finding = findProblemFinding(analysis, detail);
  const evidence = evidenceRows(detail, finding);
  const guidance = guidanceFor(detail, finding);
  const page = detail?.sourceUrl || detail?.url || findingUrl(finding?.item, analysis?.url);
  const query = detail?.title || detail?.issueLabel || findingTitle(finding?.item) || "Problema SEO da verificare";
  const hasEvidence = evidence.length > 0;
  const status = hasEvidence ? "COMPLETED" : "PARTIAL";
  const random = globalThis.crypto?.randomUUID?.() || String(Date.now());
  const runId = `problem-${random}`;

  return {
    id: runId,
    projectId,
    goal: String(goal || "").trim(),
    status,
    decision: "COMPLETE",
    startedAt: now,
    completedAt: now,
    pendingApproval: null,
    approvalHistory: [],
    plan: {
      id: `plan-${runId}`,
      goal: String(goal || "").trim(),
      workflow: "PROBLEM_DIAGNOSIS",
      parameters: { maxResults: 1 },
      version: 1,
      editable: false,
      steps: [{ id: `step-${random}`, tool: "data.analysis", required: true, input: {}, status: hasEvidence ? "COMPLETED" : "EMPTY" }],
    },
    observations: [{
      id: `observation-${random}`,
      tool: "data.analysis",
      status: hasEvidence ? "COMPLETED" : "EMPTY",
      usable: hasEvidence,
      result: {
        data: finding?.item || detail || null,
        source: "LOCAL_DATA",
        freshness: "saved-data",
        observedAt: analysis?.analyzedAt || analysis?.startedAt || now,
        durationMs: 0,
        estimatedCost: 0,
        actualCost: 0,
      },
    }],
    recommendations: hasEvidence ? [{
      id: `recommendation-${random}`,
      page,
      query,
      evidence,
      interpretation: guidance.interpretation,
      recommendation: guidance.recommendation,
      sources: [finding?.kind === "review" ? "Audit SeoGrow · Da confermare" : "Audit SeoGrow"],
      confidence: finding?.kind === "review" ? 70 : 82,
      priority: finding?.kind === "review" ? "Da verificare" : "Media",
      priorityScore: finding?.kind === "review" ? 50 : 65,
    }] : [],
    errors: hasEvidence ? [] : ["Il finding non è presente nell’ultimo audit disponibile e non contiene evidenze sufficienti. Riesegui l’audit della pagina prima di intervenire."],
  };
}
