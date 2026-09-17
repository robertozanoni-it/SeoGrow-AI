export const EDITORIAL_CONTEXT_SCHEMA = "seogrow-editorial-context-v1";

const text = (value) => String(value ?? "").trim();
const safeArray = (value) => Array.isArray(value) ? value : [];
const finiteOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

const safeHttpUrl = (value) => {
  try {
    const url = new URL(text(value));
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
};

const latestRankingRows = (value) => {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.rankings)) return value.rankings;
  return [];
};

const cleanQuery = (row = {}) => ({
  query: text(row.dimension || row.query),
  clicks: finiteOrNull(row.clicks),
  impressions: finiteOrNull(row.impressions),
  ctr: finiteOrNull(row.ctr),
  position: finiteOrNull(row.position),
  page: safeHttpUrl(row.page || row.url),
});

const cleanRanking = (row = {}) => ({
  keyword: text(row.keyword || row.query || row.dimension),
  position: finiteOrNull(row.position),
  delta: finiteOrNull(row.delta),
  url: safeHttpUrl(row.url || row.page),
  checkedAt: text(row.checkedAt),
});

export function buildEditorialProjectContext({
  client,
  dataset,
  analysis,
  rankings,
  topicalMap,
  workflowContext,
  planItem,
} = {}) {
  const queries = safeArray(dataset?.queries).slice(0, 20).map(cleanQuery).filter((row) => row.query);
  const pages = safeArray(dataset?.pages).slice(0, 12).map((row) => safeHttpUrl(row.dimension || row.url)).filter(Boolean);
  const issues = safeArray(analysis?.issues).slice(0, 15).map((issue) => ({
    type: text(issue?.type),
    label: text(issue?.label),
    url: safeHttpUrl(issue?.sourceUrl || issue?.url),
    detail: text(issue?.detail),
    severity: text(issue?.severity),
  })).filter((issue) => issue.type || issue.label || issue.detail);
  const auditPages = safeArray(analysis?.pages).slice(0, 12).map((page) => ({
    url: safeHttpUrl(page?.url),
    title: text(page?.title),
  })).filter((page) => page.url || page.title);
  const rankingRows = latestRankingRows(rankings).slice(0, 30).map(cleanRanking).filter((row) => row.keyword && row.position != null);
  const topicalIdeas = safeArray(topicalMap?.ideas).slice(0, 20).map((item) => ({
    keyword: text(item?.keyword),
    cluster: text(item?.coreKeyword),
    intent: text(item?.intent),
    searchVolume: finiteOrNull(item?.searchVolume),
    covered: item?.covered === true,
  })).filter((item) => item.keyword);
  const workflow = workflowContext ? {
    taskId: text(workflowContext.taskId || workflowContext.id),
    title: text(workflowContext.title),
    query: text(workflowContext.query),
    sourceUrl: safeHttpUrl(workflowContext.sourceUrl),
    targetUrl: safeHttpUrl(workflowContext.targetUrl),
  } : null;
  const selected = planItem ? {
    id: text(planItem.id),
    topic: text(planItem.topic || planItem.title),
    keyword: text(planItem.keyword || planItem.title),
    intent: text(planItem.intent),
    cluster: text(planItem.cluster),
    objective: text(planItem.objective),
    sourceUrl: safeHttpUrl(planItem.url),
  } : null;

  const sources = [];
  if (queries.length || pages.length) sources.push("search-console");
  if (issues.length || auditPages.length) sources.push("audit");
  if (rankingRows.length) sources.push("ranking");
  if (topicalIdeas.length) sources.push("topical-map");
  if (workflow?.taskId && (workflow.title || workflow.query || workflow.sourceUrl)) sources.push("workflow-task");

  return {
    schema: EDITORIAL_CONTEXT_SCHEMA,
    project: {
      id: Number.isSafeInteger(Number(client?.id)) && Number(client?.id) > 0 ? Number(client.id) : null,
      name: text(client?.name),
      siteUrl: safeHttpUrl(client?.url),
    },
    selected,
    workflow,
    searchConsole: { queries, pages },
    audit: {
      analyzedAt: text(analysis?.analyzedAt || analysis?.startedAt),
      issues,
      pages: auditPages,
    },
    rankings: rankingRows,
    topicalMap: { ideas: topicalIdeas },
    sources,
  };
}

export function validateEditorialProjectContext(context) {
  const errors = [];
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return { ok: false, errors: ["Contesto progetto mancante o non valido."], evidenceSources: [] };
  }
  if (context.schema !== EDITORIAL_CONTEXT_SCHEMA) errors.push("Schema contesto editoriale non riconosciuto.");
  if (!Number.isSafeInteger(Number(context.project?.id)) || Number(context.project.id) <= 0) errors.push("ID progetto mancante.");
  if (!text(context.project?.name)) errors.push("Nome progetto mancante.");
  if (!safeHttpUrl(context.project?.siteUrl)) errors.push("URL progetto mancante o non valido.");

  const evidenceSources = [];
  if (safeArray(context.searchConsole?.queries).length || safeArray(context.searchConsole?.pages).length) evidenceSources.push("search-console");
  if (safeArray(context.audit?.issues).length || safeArray(context.audit?.pages).length) evidenceSources.push("audit");
  if (safeArray(context.rankings).length) evidenceSources.push("ranking");
  if (safeArray(context.topicalMap?.ideas).length) evidenceSources.push("topical-map");
  if (text(context.workflow?.taskId) && (text(context.workflow?.title) || text(context.workflow?.query) || safeHttpUrl(context.workflow?.sourceUrl))) evidenceSources.push("workflow-task");
  if (!evidenceSources.length) errors.push("Manca un’evidenza SEO del progetto: Search Console, audit, ranking, Topical Map o task collegata.");

  return { ok: errors.length === 0, errors, evidenceSources };
}

export function parseEditorialProjectContext(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeEditorialProjectContext(context) {
  const validation = validateEditorialProjectContext(context);
  if (!validation.ok) {
    const error = new Error(validation.errors.join(" "));
    error.code = "PROJECT_CONTEXT_REQUIRED";
    throw error;
  }
  return JSON.stringify(context);
}
