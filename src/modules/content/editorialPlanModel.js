import { contentPlan } from "./contentPlan.js";

export const EDITORIAL_STATUSES = Object.freeze([
  "Idea",
  "Pianificato",
  "In lavorazione",
  "Bozza pronta",
  "Completato",
]);

const text = (value) => String(value ?? "").trim();
const normalize = (value) => text(value).toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const exactText = (value) => text(value).toLocaleLowerCase("it").replace(/\s+/g, " ");
const validStatus = (value) => EDITORIAL_STATUSES.includes(value) ? value : "";

const scheduleMap = (saved) => new Map(
  (Array.isArray(saved) ? saved : [])
    .filter((item) => item && typeof item.id === "string")
    .map((item) => [item.id, text(item.date)]),
);

const topicalIndex = (topicalMap) => new Map(
  (Array.isArray(topicalMap?.ideas) ? topicalMap.ideas : [])
    .filter((item) => text(item?.keyword))
    .map((item) => [exactText(item.keyword), item]),
);

const topicalPlanItems = (topicalMap) => (Array.isArray(topicalMap?.ideas) ? topicalMap.ideas : [])
  .filter((item) => !item?.covered && text(item?.keyword))
  .slice(0, 12)
  .map((item, index) => ({
    id: `topical-${text(item.keyword)}`,
    type: "Nuovo articolo",
    title: text(item.keyword),
    reason: `Volume ${Number(item.searchVolume || 0)} · intento ${text(item.intent) || "non classificato"}`,
    url: "",
    association: "Argomento mancante secondo DataForSEO",
    objective: `Coprire il cluster ${text(item.coreKeyword) || text(item.keyword)}`,
    format: "Articolo editoriale",
    slot: `Settimana ${Math.floor(index / 3) + 1}`,
    priority: Number(item.searchVolume || 0) >= 100 ? "Alta" : "Media",
    keyword: text(item.keyword),
    intent: text(item.intent),
    cluster: text(item.coreKeyword),
  }));

const initialItems = (dataset, analysis, topicalMap) => {
  const base = contentPlan(dataset, analysis);
  const topical = topicalPlanItems(topicalMap);
  const topicalQuota = Math.min(4, topical.length);
  const selected = [...base.slice(0, 12 - topicalQuota), ...topical.slice(0, topicalQuota)];
  const byTopic = new Map();
  for (const item of selected) {
    const key = exactText(item.title);
    const existing = byTopic.get(key);
    if (!existing) {
      byTopic.set(key, item);
      continue;
    }
    byTopic.set(key, {
      ...existing,
      keyword: existing.keyword || item.keyword,
      intent: existing.intent || item.intent,
      cluster: existing.cluster || item.cluster,
      reason: existing.reason || item.reason,
      objective: existing.objective || item.objective,
    });
  }
  return [...byTopic.values()].slice(0, 12).map((item, index) => ({
    ...item,
    slot: `Settimana ${Math.floor(index / 3) + 1}`,
  }));
};

const rankingByKeyword = (rows) => new Map(
  (Array.isArray(rows) ? rows : [])
    .filter((row) => text(row?.keyword))
    .map((row) => [exactText(row.keyword), row]),
);

const opportunityByKeyword = (rows) => {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const query = text(row?.action?.task?.query || row?.raw?.ranking?.keyword || row?.raw?.gsc?.dimension || row?.raw?.gsc?.query);
    if (query) map.set(exactText(query), row);
    if (String(row?.dedupeKey || "").startsWith("query|")) {
      const key = String(row.dedupeKey).slice(6).replace(/-/g, " ");
      if (key) map.set(exactText(key), row);
    }
  }
  return map;
};

const deterministicBrief = (item) => [
  text(item.reason),
  text(item.objective) ? `Obiettivo: ${text(item.objective)}` : "",
  text(item.association) ? `Evidenza: ${text(item.association)}` : "",
].filter(Boolean).join(" · ");

export function buildEditorialPlanRows({
  dataset = null,
  analysis = null,
  topicalMap = null,
  schedule = [],
  draft = null,
  rankingRows = [],
  opportunities = [],
  state = {},
} = {}) {
  const items = initialItems(dataset, analysis, topicalMap);
  const dates = scheduleMap(schedule);
  const topical = topicalIndex(topicalMap);
  const rankings = rankingByKeyword(rankingRows);
  const opportunityIndex = opportunityByKeyword(opportunities);
  const persisted = state && typeof state === "object" && !Array.isArray(state) ? state : {};
  const draftTopic = exactText(draft?.topic);
  const draftHasContent = Boolean(text(draft?.content));

  return items.map((item) => {
    const topicalMatch = topical.get(exactText(item.keyword || item.title));
    const technical = String(item.type || "").toLocaleLowerCase("it") === "architettura";
    const topic = text(item.title);
    const keyword = text(item.keyword || topicalMatch?.keyword || (technical ? "" : item.title));
    const intent = text(item.intent || topicalMatch?.intent);
    const cluster = text(item.cluster || topicalMatch?.coreKeyword);
    const date = dates.get(item.id) || "";
    const stored = persisted[item.id] && typeof persisted[item.id] === "object" ? persisted[item.id] : {};
    const draftMatches = Boolean(draftTopic && exactText(topic) === draftTopic);
    const status = validStatus(stored.status) || (draftMatches ? (draftHasContent ? "Bozza pronta" : "In lavorazione") : date ? "Pianificato" : "Idea");
    const ranking = keyword ? rankings.get(exactText(keyword)) || null : null;
    const opportunity = keyword ? opportunityIndex.get(exactText(keyword)) || null : null;
    return {
      id: item.id,
      topic,
      keyword,
      intent,
      cluster,
      status,
      brief: text(stored.brief) || deterministicBrief(item),
      date,
      priority: text(item.priority) || "Media",
      type: text(item.type),
      format: text(item.format),
      sourceUrl: text(item.url),
      reason: text(item.reason),
      objective: text(item.objective),
      association: text(item.association),
      source: String(item.id || "").startsWith("topical-") ? "Topical Map" : technical ? "Audit SEO" : "Search Console / Piano",
      ranking: ranking ? {
        keyword: text(ranking.keyword),
        position: Number.isFinite(Number(ranking.position)) ? Number(ranking.position) : null,
        delta: Number.isFinite(Number(ranking.delta)) ? Number(ranking.delta) : null,
        url: text(ranking.url),
        checkedAt: text(ranking.checkedAt),
      } : null,
      opportunity: opportunity ? {
        id: text(opportunity.id),
        dedupeKey: text(opportunity.dedupeKey),
        priority: text(opportunity.priority),
        impact: text(opportunity.impact),
        effort: text(opportunity.effort),
      } : null,
    };
  });
}

export function patchEditorialPlanState(state, itemId, patch = {}) {
  if (!text(itemId)) throw new Error("Voce editoriale non valida.");
  const current = state && typeof state === "object" && !Array.isArray(state) ? state : {};
  const previous = current[itemId] && typeof current[itemId] === "object" ? current[itemId] : {};
  const next = { ...previous };
  if (Object.hasOwn(patch, "status")) {
    if (!validStatus(patch.status)) throw new Error("Stato editoriale non valido.");
    next.status = patch.status;
  }
  if (Object.hasOwn(patch, "brief")) next.brief = text(patch.brief).slice(0, 4000);
  return { ...current, [itemId]: next };
}

export function editorialPlanEvidence(row = {}) {
  return {
    hasKeyword: Boolean(text(row.keyword)),
    hasIntent: Boolean(text(row.intent)),
    hasCluster: Boolean(text(row.cluster)),
    hasRanking: Boolean(row.ranking),
    hasOpportunity: Boolean(row.opportunity),
  };
}

export const editorialPlanIdentity = (row = {}) => `${normalize(row.topic)}|${normalize(row.keyword)}`;
