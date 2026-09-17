const IMPACT_WEIGHT = Object.freeze({ Alto: 3, Medio: 2, Basso: 1 });
const EFFORT_WEIGHT = Object.freeze({ Basso: 1, Medio: 2, Alto: 3 });
const ACTION_WEIGHT = Object.freeze({ correction: 3, content: 2, task: 1 });
const ACTION_PAGES = Object.freeze({ task: new Set(["Task"]), content: new Set(["Piano editoriale"]), correction: new Set(["Correzioni", "Link interni"]) });

const text = (value) => String(value || "").trim();
const normalizedText = (value) => text(value).toLocaleLowerCase("it").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 120);
const normalizedUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch { return ""; }
};
const finite = (value) => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const impactFromSeverity = (value) => ({ high: "Alto", medium: "Medio", low: "Basso" })[String(value || "").toLowerCase()] || "Medio";
const impactFromPlanPriority = (value) => ({ alta: "Alto", media: "Medio", bassa: "Basso" })[String(value || "").toLowerCase()] || "Medio";
const effortFromCorrectability = (value) => value === "automatic" ? "Basso" : value === "assisted" ? "Medio" : "Alto";
const actionable = (action) => Boolean(action && ACTION_PAGES[action.kind]?.has(action.page) && text(action.label));
const source = (type, label, evidence = "") => ({ type, label, evidence: text(evidence) });

const candidate = ({ dedupeKey, title, reason, url = "", targetUrl = "", impact = "Medio", effort = "Medio", action, sourceInfo, raw = null, regression = false }) => ({
  dedupeKey: text(dedupeKey),
  title: text(title),
  reason: text(reason),
  url: normalizedUrl(url),
  targetUrl: normalizedUrl(targetUrl),
  impact: IMPACT_WEIGHT[impact] ? impact : "Medio",
  effort: EFFORT_WEIGHT[effort] ? effort : "Medio",
  action,
  sources: sourceInfo ? [sourceInfo] : [],
  raw,
  regression: regression === true,
});

const auditCandidates = (problems) => (Array.isArray(problems) ? problems : []).flatMap((problem) => {
  if (!problem || ["resolved", "intentional"].includes(problem.problemState) || problem.disposition === "do_not_modify") return [];
  const url = problem.sourceUrl || "";
  const title = problem.title || problem.issueType || "Problema SEO";
  const canCorrect = ["automatic", "assisted"].includes(problem.correctability) && problem.reviewOnly !== true && problem.confidence !== "needs_confirmation";
  const action = canCorrect
    ? { kind: "correction", page: "Correzioni", label: "Apri correzione", problemKey: problem.key }
    : { kind: "task", page: "Task", label: "Crea task", task: { title, kind: problem.issueType || "audit", sourceUrl: url, detail: problem.detail || title } };
  return [candidate({
    dedupeKey: `issue|${normalizedUrl(url)}|${normalizedText(title)}`,
    title,
    reason: problem.detail || `Problema attivo rilevato dall’Audit SEO (${problem.issueType || "tipo non specificato"}).`,
    url,
    impact: impactFromSeverity(problem.severity),
    effort: effortFromCorrectability(problem.correctability),
    action,
    sourceInfo: source("audit", "Audit SEO", `${problem.severity || "gravità non classificata"} · ${problem.correctability || "intervento da definire"}`),
    raw: { problem },
    regression: problem.regression === true,
  })];
});

const rankingCandidates = (rows, gscDataset) => {
  const gsc = new Map((gscDataset?.queries || []).map((row) => [normalizedText(row.dimension || row.query), row]));
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const keyword = text(row?.keyword);
    const position = finite(row?.position);
    const delta = finite(row?.delta);
    if (!keyword || position == null || position <= 0) return [];
    const gscRow = gsc.get(normalizedText(keyword));
    const impressions = finite(gscRow?.impressions) || 0;
    const nearPageOne = position >= 4 && position <= 20;
    const materialDrop = delta != null && delta <= -2;
    const demandBackedDeepRank = position > 20 && position <= 50 && impressions >= 10;
    if (!nearPageOne && !materialDrop && !demandBackedDeepRank) return [];
    const impact = impressions >= 100 || (delta != null && delta <= -5)
      ? "Alto"
      : impressions >= 30 || position <= 10 || materialDrop ? "Medio" : "Basso";
    const url = row.url || gscRow?.page || "";
    const facts = [`DataForSEO: posizione ${position.toFixed(1)}`];
    if (delta != null) facts.push(`delta ${delta > 0 ? "+" : ""}${delta.toFixed(1)}`);
    if (impressions > 0) facts.push(`Search Console: ${Math.round(impressions)} impressioni`);
    const action = url
      ? { kind: "content", page: "Piano editoriale", label: "Apri contenuto", task: { title: `Ottimizza “${keyword}”`, kind: "search", query: keyword, sourceUrl: url, detail: facts.join(" · ") } }
      : { kind: "task", page: "Task", label: "Crea task", task: { title: `Associa e ottimizza “${keyword}”`, kind: "search", query: keyword, detail: `${facts.join(" · ")} · URL non associata: verificare la pagina prima di intervenire.` } };
    return [candidate({
      dedupeKey: `query|${normalizedText(keyword)}`,
      title: `Opportunità ranking · ${keyword}`,
      reason: facts.join(" · "),
      url,
      impact,
      effort: url ? "Medio" : "Alto",
      action,
      sourceInfo: source("ranking", "DataForSEO", row.checkedAt ? `Controllo ${row.checkedAt}` : "Posizione osservata"),
      raw: { ranking: row, gsc: gscRow || null },
    })];
  });
};

const contentCandidates = (items) => (Array.isArray(items) ? items : []).flatMap((item) => {
  if (!item?.title || !item?.reason) return [];
  const architecture = String(item.type || "").toLowerCase() === "architettura";
  const dedupeKey = architecture
    ? `issue|${normalizedUrl(item.url)}|${normalizedText(item.title)}`
    : `query|${normalizedText(item.title)}`;
  const format = String(item.format || "").toLowerCase();
  const effort = /title|meta description|snippet/.test(format) ? "Basso" : /pagina esistente|intervento tecnico/.test(format) ? "Medio" : "Alto";
  return [candidate({
    dedupeKey,
    title: item.title,
    reason: item.reason,
    url: item.url,
    impact: impactFromPlanPriority(item.priority),
    effort,
    action: { kind: "content", page: "Piano editoriale", label: "Apri contenuto", task: { title: item.title, kind: architecture ? "content" : "search", sourceUrl: item.url || "", detail: `${item.reason}${item.objective ? ` · Obiettivo: ${item.objective}` : ""}` } },
    sourceInfo: source("content", "Contenuti", `${item.type || "Piano editoriale"}${item.association ? ` · ${item.association}` : ""}`),
    raw: { content: item },
  })];
});

const linkCandidates = (items) => (Array.isArray(items) ? items : []).flatMap((item) => {
  if (!item?.sourceUrl || !item?.targetUrl || !item?.anchor || !item?.reason || !item?.key) return [];
  return [candidate({
    dedupeKey: `link|${item.key}`,
    title: `Link interno · ${item.anchor}`,
    reason: item.reason,
    url: item.sourceUrl,
    targetUrl: item.targetUrl,
    impact: "Medio",
    effort: "Basso",
    action: { kind: "correction", page: "Link interni", label: "Apri correzione link", linkKey: item.key },
    sourceInfo: source("links", "Link interni", `${item.sourceUrl} → ${item.targetUrl}`),
    raw: { link: item },
  })];
});

const chooseActionCandidate = (left, right) => {
  const leftWeight = ACTION_WEIGHT[left.action?.kind] || 0;
  const rightWeight = ACTION_WEIGHT[right.action?.kind] || 0;
  if (rightWeight > leftWeight) return right;
  if (rightWeight < leftWeight) return left;
  return (EFFORT_WEIGHT[right.effort] || 9) < (EFFORT_WEIGHT[left.effort] || 9) ? right : left;
};

const mergedOpportunity = (entries) => {
  const actionCandidate = entries.reduce(chooseActionCandidate);
  const impact = entries.map((item) => item.impact).toSorted((a, b) => IMPACT_WEIGHT[b] - IMPACT_WEIGHT[a])[0] || "Medio";
  const sources = [...new Map(entries.flatMap((item) => item.sources).map((item) => [`${item.type}:${item.label}:${item.evidence}`, item])).values()];
  const reasons = [...new Set(entries.map((item) => item.reason).filter(Boolean))];
  const regression = entries.some((item) => item.regression);
  const impactWeight = IMPACT_WEIGHT[impact] || 2;
  const effortWeight = EFFORT_WEIGHT[actionCandidate.effort] || 2;
  const corroboration = Math.min(2, Math.max(0, sources.length - 1));
  const score = impactWeight * 3 + (4 - effortWeight) + corroboration + (regression ? 2 : 0);
  const priority = score >= 10 ? "Alta" : score >= 7 ? "Media" : "Bassa";
  return {
    id: `seo-opportunity-${normalizedText(entries[0].dedupeKey) || "item"}`,
    dedupeKey: entries[0].dedupeKey,
    title: actionCandidate.title,
    reason: reasons.join(" · "),
    url: actionCandidate.url || entries.find((item) => item.url)?.url || "",
    targetUrl: actionCandidate.targetUrl || entries.find((item) => item.targetUrl)?.targetUrl || "",
    sources,
    sourceTypes: [...new Set(sources.map((item) => item.type))],
    priority,
    impact,
    effort: actionCandidate.effort,
    priorityEvidence: `Impatto ${impact.toLowerCase()} · sforzo ${actionCandidate.effort.toLowerCase()} · ${sources.length} fonte/i${regression ? " · regressione osservata" : ""}`,
    action: actionCandidate.action,
    raw: actionCandidate.raw,
    regression,
  };
};

export function validateSeoOpportunityActionability(item) {
  if (!item?.id || !item?.title || !item?.dedupeKey) return { ok: false, reason: "Identità opportunità incompleta." };
  if (!actionable(item.action)) return { ok: false, reason: "CTA operativa mancante o non supportata." };
  if (item.action.kind === "correction" && item.action.page === "Correzioni" && !item.action.problemKey) return { ok: false, reason: "Correzione senza problema audit associato." };
  if (item.action.kind === "correction" && item.action.page === "Link interni" && !item.action.linkKey) return { ok: false, reason: "Correzione link senza opportunità associata." };
  if (["task", "content"].includes(item.action.kind) && !item.action.task?.title) return { ok: false, reason: "Azione senza task/contesto operativo." };
  return { ok: true, reason: "Opportunità azionabile." };
}

export function buildSeoOpportunities({ auditProblems = [], rankingRows = [], contentItems = [], linkSuggestions = [], gscDataset = null } = {}) {
  const candidates = [
    ...auditCandidates(auditProblems),
    ...rankingCandidates(rankingRows, gscDataset),
    ...contentCandidates(contentItems),
    ...linkCandidates(linkSuggestions),
  ];
  const grouped = new Map();
  const rejected = [];
  for (const item of candidates) {
    if (!item.dedupeKey || !item.title || !actionable(item.action)) {
      rejected.push({ item, reason: "Candidato non azionabile o senza identità stabile." });
      continue;
    }
    const list = grouped.get(item.dedupeKey) || [];
    list.push(item);
    grouped.set(item.dedupeKey, list);
  }
  const opportunities = [...grouped.values()].map(mergedOpportunity).filter((item) => {
    const gate = validateSeoOpportunityActionability(item);
    if (!gate.ok) rejected.push({ item, reason: gate.reason });
    return gate.ok;
  }).toSorted((left, right) => {
    const priority = { Alta: 0, Media: 1, Bassa: 2 };
    const impact = { Alto: 0, Medio: 1, Basso: 2 };
    const effort = { Basso: 0, Medio: 1, Alto: 2 };
    return (priority[left.priority] ?? 9) - (priority[right.priority] ?? 9) ||
      (impact[left.impact] ?? 9) - (impact[right.impact] ?? 9) ||
      (effort[left.effort] ?? 9) - (effort[right.effort] ?? 9) ||
      left.title.localeCompare(right.title, "it");
  });
  return { opportunities, rejected, candidates: candidates.length };
}
