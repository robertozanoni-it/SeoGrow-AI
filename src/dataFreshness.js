const DAY_MS = 86_400_000;

export const FRESHNESS_STATE = Object.freeze({
  FRESH: "fresh",
  AGING: "aging",
  STALE: "stale",
  UNAVAILABLE: "unavailable",
});

const parsedTime = (value) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : null;
};

export function classifyFreshness(value, { staleAfterDays, agingAfterDays = Math.max(1, Math.floor(staleAfterDays * 0.7)), now = Date.now() } = {}) {
  const time = parsedTime(value);
  if (time === null) return { state: FRESHNESS_STATE.UNAVAILABLE, ageDays: null, observedAt: null };
  const ageDays = Math.max(0, Math.floor((now - time) / DAY_MS));
  const state = ageDays > staleAfterDays
    ? FRESHNESS_STATE.STALE
    : ageDays >= agingAfterDays
      ? FRESHNESS_STATE.AGING
      : FRESHNESS_STATE.FRESH;
  return { state, ageDays, observedAt: new Date(time).toISOString() };
}

export function buildProjectFreshness({ dataset, analysis, rankings = [], geo, policy = {}, now = Date.now() } = {}) {
  const projectDays = Math.max(1, Number(policy.freshnessDays) || 7);
  const latestRanking = rankings.find((item) => item?.checkedAt) || null;
  const geoRows = Array.isArray(geo?.history) ? geo.history : [];
  const latestGeo = geoRows[0]?.at || geoRows[0]?.createdAt || geo?.audit?.analyzedAt || geo?.audit?.checkedAt || null;
  const sources = [
    { id: "audit", label: "Audit SEO", page: "Audit SEO", action: "Aggiorna audit SEO", timestamp: analysis?.analyzedAt || analysis?.startedAt, staleAfterDays: Math.max(projectDays, 30) },
    { id: "gsc", label: "Search Console", page: "Integrazioni", action: "Aggiorna Search Console", timestamp: dataset?.importedAt || dataset?.dateTo, staleAfterDays: Math.max(projectDays, 14) },
    { id: "rankings", label: "Posizionamenti", page: "Posizionamenti", action: "Aggiorna posizionamenti", timestamp: latestRanking?.checkedAt, staleAfterDays: Math.max(projectDays, 14) },
    { id: "geo", label: "GEO AI", page: "GEO AI", action: "Aggiorna evidenze GEO", timestamp: latestGeo, staleAfterDays: Math.max(projectDays, 30) },
  ].map((source) => ({ ...source, ...classifyFreshness(source.timestamp, { staleAfterDays: source.staleAfterDays, now }) }));

  const refreshActions = sources
    .filter((source) => source.state === FRESHNESS_STATE.STALE || source.state === FRESHNESS_STATE.UNAVAILABLE)
    .map((source) => ({ id: `refresh-${source.id}`, source: source.id, title: source.action, page: source.page, state: source.state, ageDays: source.ageDays }));

  return {
    sources,
    refreshActions,
    stale: sources.filter((source) => source.state === FRESHNESS_STATE.STALE).length,
    unavailable: sources.filter((source) => source.state === FRESHNESS_STATE.UNAVAILABLE).length,
    healthy: sources.every((source) => source.state === FRESHNESS_STATE.FRESH || source.state === FRESHNESS_STATE.AGING),
  };
}
