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

const guidance = {
  canonical: {
    interpretation: "L’audit ha rilevato una canonical diversa dall’URL analizzato. Serve una decisione di intent: la differenza non è automaticamente un errore.",
    recommendation: "Riesegui l’audit della singola URL e confronta URL analizzato, URL finale e canonical. Se confermi che questa pagina deve essere canonica verso se stessa, SeoGrow può preparare il cambio da approvare; altrimenti mantieni la canonical intenzionale.",
  },
  indexability: {
    interpretation: "Il finding riguarda robots/noindex e non autorizza da solo a rendere indicizzabile la pagina.",
    recommendation: "Conferma che la pagina debba essere indicizzabile. Dopo la conferma SeoGrow può preparare la rimozione del noindex e mostrarti il Prima/Dopo prima dell’approvazione.",
  },
  metadata: {
    interpretation: "Il problema riguarda un metadato SEO modificabile e può essere affrontato con una proposta controllata quando ownership e sorgente sono verificabili.",
    recommendation: "Fai preparare a SeoGrow il nuovo valore, confronta Prima/Dopo e approva solo una proposta che supera i quality gate; poi riverifica il frontend e l’audit.",
  },
  h1: {
    interpretation: "Il finding riguarda la struttura H1. La modifica è sicura solo se SeoGrow identifica con certezza il widget o il campo che genera il frontend.",
    recommendation: "Verifica l’ownership del blocco H1; se è univoca, prepara la modifica e approvala. Se più widget possono generare l’H1, scegli esplicitamente il candidato prima della scrittura.",
  },
  content: {
    interpretation: "Il finding riguarda contenuto o profondità editoriale e richiede ownership del campo o widget prima di generare una patch.",
    recommendation: "Individua il blocco modificabile corretto, prepara l’integrazione di contenuto con il contesto reale della pagina, controlla Prima/Dopo e approva solo dopo il quality gate.",
  },
  externalLink: {
    interpretation: "Il link esterno può essere corretto solo quando SeoGrow conferma una singola occorrenza locale e la destinazione effettivamente problematica.",
    recommendation: "Prepara la rimozione o lo scollegamento del link mantenendo il testo quando opportuno; se esistono più occorrenze, scegli quale intervenire prima dell’approvazione.",
  },
  internalLink: {
    interpretation: "Il link interno richiede una destinazione corretta verificabile; SeoGrow non deve inventare una URL sostitutiva.",
    recommendation: "Verifica la pagina di destinazione corretta e poi prepara la sostituzione o rimozione. Se la destinazione non è determinabile, usa la soluzione guidata e riesegui l’audit dopo l’intervento.",
  },
  image: {
    interpretation: "Il finding immagine/alt può richiedere contesto visivo o ownership del media/widget prima di una modifica affidabile.",
    recommendation: "Identifica l’immagine esatta e il suo ruolo nella pagina; prepara alt o intervento tecnico solo con il media corretto e verifica poi il frontend.",
  },
  performance: {
    interpretation: "Il finding prestazionale descrive un effetto misurato, ma la causa tecnica può dipendere da tema, plugin, immagini, cache o rete.",
    recommendation: "Prepara una diagnosi causale con evidenze recenti, applica una modifica alla volta e confronta la misurazione prima/dopo; non modificare configurazioni non attribuite con certezza.",
  },
  urlAlias: {
    interpretation: "Due URL simili possono essere alias, redirect o varianti della stessa risorsa. Serve confermare la risorsa canonica prima di modificare routing o canonical.",
    recommendation: "Confronta URL finali, redirect, canonical, sitemap e risorsa WordPress. Scegli la URL principale solo dopo la verifica, quindi prepara redirect/canonical come intervento separato.",
  },
  generic: {
    interpretation: "SeoGrow ha evidenza del finding ma non dispone ancora di una scrittura automatica sicura per questo tipo o contesto.",
    recommendation: "Prepara una soluzione guidata basata sulle evidenze disponibili, esplicita ciò che richiede una decisione umana e verifica il risultato con frontend/audit recente.",
  },
};

const guidanceFor = (detail, finding) => {
  const text = `${detail?.issueType || ""} ${detail?.title || ""} ${finding?.item?.type || ""} ${findingTitle(finding?.item)}`.toLowerCase();
  if (/canonical/.test(text)) return guidance.canonical;
  if (/noindex|robots|indexability|indicizz/.test(text)) return guidance.indexability;
  if (/url-alias|redirect/.test(text)) return guidance.urlAlias;
  if (/broken-external-link|link esterno/.test(text)) return guidance.externalLink;
  if (/broken-link|link interno/.test(text)) return guidance.internalLink;
  if (/meta\s*description|description-serp-width|title|titolo seo/.test(text)) return guidance.metadata;
  if (/\bh1\b/.test(text)) return guidance.h1;
  if (/thin|contenuto|content|parole|word/.test(text)) return guidance.content;
  if (/image|immagin|\balt\b/.test(text)) return guidance.image;
  if (/performance|lento|response|speed|tempo di risposta/.test(text)) return guidance.performance;
  return guidance.generic;
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
  const selectedGuidance = guidanceFor(detail, finding);
  const page = detail?.sourceUrl || detail?.url || findingUrl(finding?.item, analysis?.url);
  const query = detail?.title || detail?.issueLabel || findingTitle(finding?.item) || "Problema SEO da verificare";
  const hasEvidence = evidence.length > 0;
  const status = hasEvidence ? "COMPLETED" : "PARTIAL";
  const random = globalThis.crypto?.randomUUID?.() || String(Date.now());
  const runId = `problem-${random}`;
  const issueType = String(detail?.issueType || finding?.item?.type || "").trim();
  const reviewOnly = detail?.reviewOnly === true || finding?.kind === "review";

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
      issueType,
      issueKey: detail?.issueKey || "",
      reviewOnly,
      problemStateCode: detail?.problemStateCode || (reviewOnly ? "needs_verification" : "open"),
      interventionStateCode: detail?.interventionStateCode || "not_prepared",
      correctability: detail?.correctability || (reviewOnly ? "not_supported" : "manual"),
      ownershipBlocked: detail?.ownershipBlocked === true,
      stale: detail?.stale === true,
      targetUrls: Array.isArray(detail?.targetUrls) ? detail.targetUrls : [],
      evidence,
      interpretation: selectedGuidance.interpretation,
      recommendation: selectedGuidance.recommendation,
      sources: [finding?.kind === "review" ? "Audit SeoGrow · Da confermare" : "Audit SeoGrow"],
      confidence: finding?.kind === "review" ? 70 : 82,
      priority: finding?.kind === "review" ? "Da verificare" : "Media",
      priorityScore: finding?.kind === "review" ? 50 : 65,
    }] : [],
    errors: hasEvidence ? [] : ["Il finding non è presente nell’ultimo audit disponibile e non contiene evidenze sufficienti. Riesegui l’audit della pagina prima di intervenire."],
  };
}

export function problemNeedsFreshAudit(analysis, detail = {}) {
  return Boolean((detail?.sourceUrl || detail?.url) && !findProblemFinding(analysis, detail));
}

export function retireObsoleteProblemTasks(tasks, detail = {}, clientId, now = new Date().toISOString()) {
  const source = normalizeUrl(detail?.sourceUrl || detail?.url || "");
  const title = String(detail?.title || detail?.issueLabel || "").trim().toLowerCase();
  const type = String(detail?.issueType || "").trim().toLowerCase();
  let changed = false;
  const next = (Array.isArray(tasks) ? tasks : []).map((task) => {
    if (Number(task?.sourceClientId) !== Number(clientId)) return task;
    if (task?.status === "Completato" && task?.excludedFromSeo && task?.stale) return task;
    const taskSource = normalizeUrl(task?.sourceUrl || task?.targetUrl || "");
    const taskTitle = String(task?.title || "").trim().toLowerCase();
    const taskKind = String(task?.kind || "").trim().toLowerCase();
    const normalizedTaskTitle = taskTitle.replace(/^intervento seo:\s*/i, "");
    const sourceMatches = Boolean(source && taskSource === source);
    const identityMatches = (type && taskKind === type) || (title && (taskTitle.includes(title) || title.includes(normalizedTaskTitle)));
    if (!sourceMatches || !identityMatches) return task;
    changed = true;
    return { ...task, status: "Completato", stale: true, excludedFromSeo: true, completedAt: now, updatedAt: now,
      completionReason: "Finding non più presente dopo verifica automatica aggiornata.",
      staleReason: "Finding obsoleto: audit recente non lo rileva più." };
  });
  return { tasks: next, changed };
}
