export const RANKING_SOURCE = "DataForSEO";

const keywordKey = (value) => String(value || "").trim().toLocaleLowerCase("it");
const finitePositive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const validDate = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
};

export const rankingRunIdentity = (run) => [
  run?.checkedAt || "",
  run?.device || "",
  run?.depth ?? "",
  run?.locationCode ?? "",
  run?.languageCode || "",
].join("|");

export function validRankingRuns(history) {
  return (Array.isArray(history) ? history : [])
    .filter((run) => validDate(run?.checkedAt) && Array.isArray(run?.rankings))
    .toSorted((left, right) => Date.parse(right.checkedAt) - Date.parse(left.checkedAt));
}

export function comparableRankingRuns(current, history) {
  if (!current) return [];
  return validRankingRuns(history).filter((run) =>
    rankingRunIdentity(run) !== rankingRunIdentity(current) &&
    run.device === current.device &&
    Number(run.depth) === Number(current.depth) &&
    Number(run.locationCode) === Number(current.locationCode) &&
    run.languageCode === current.languageCode,
  );
}

export function rankingPositionLabel(ranking, run) {
  if (ranking?.error) return "Non verificata";
  const position = finitePositive(ranking?.position);
  if (position != null) return String(position);
  const depth = finitePositive(run?.depth);
  return depth != null ? `>${depth}` : "Non trovata";
}

const positionMap = (run) => new Map((run?.rankings || []).map((ranking) => [keywordKey(ranking.keyword), ranking]));

export function buildPositioningRows(current, comparison, history) {
  if (!current) return [];
  const comparisonMap = positionMap(comparison);
  const comparableHistory = [
    current,
    ...comparableRankingRuns(current, history),
  ].toSorted((left, right) => Date.parse(left.checkedAt) - Date.parse(right.checkedAt));

  return (current.rankings || []).map((ranking) => {
    const key = keywordKey(ranking.keyword);
    const currentPosition = finitePositive(ranking.position);
    const before = comparisonMap.get(key);
    const previousPosition = finitePositive(before?.position);
    const delta = currentPosition != null && previousPosition != null
      ? previousPosition - currentPosition
      : null;
    const historyPoints = comparableHistory.slice(-8).map((run) => {
      const observed = positionMap(run).get(key);
      return {
        checkedAt: validDate(run.checkedAt),
        position: finitePositive(observed?.position),
        label: observed ? rankingPositionLabel(observed, run) : "—",
        error: observed?.error || "",
      };
    });
    return {
      keyword: String(ranking.keyword || "").trim(),
      url: String(ranking.url || "").trim(),
      position: currentPosition,
      positionLabel: rankingPositionLabel(ranking, current),
      delta,
      error: ranking.error || "",
      checkedAt: validDate(current.checkedAt),
      source: RANKING_SOURCE,
      history: historyPoints,
    };
  });
}

export function opportunityEvidenceForKeyword(keyword, groups = {}) {
  const key = keywordKey(keyword);
  if (!key) return [];
  const definitions = [
    ["quickWins", "Quick win"],
    ["lowCtr", "CTR basso"],
    ["losses", "In calo"],
    ["cannibalizations", "Cannibalizzazione"],
  ];
  const evidence = [];
  for (const [group, label] of definitions) {
    for (const row of groups?.[group] || []) {
      const rowKey = keywordKey(row.dimension || row.query);
      if (rowKey === key) evidence.push({ group, label, row });
    }
  }
  return evidence;
}

export function positioningFilter(row, { query = "", view = "all" } = {}) {
  const text = `${row?.keyword || ""} ${row?.url || ""}`.toLocaleLowerCase("it");
  if (!text.includes(String(query || "").trim().toLocaleLowerCase("it"))) return false;
  if (view === "growth") return Number(row?.delta) > 0;
  if (view === "decline") return Number(row?.delta) < 0;
  if (view === "top10") return row?.position != null && row.position <= 10;
  if (view === "11-20") return row?.position != null && row.position >= 11 && row.position <= 20;
  if (view === "beyond") return !row?.error && row?.position == null;
  if (view === "errors") return Boolean(row?.error);
  return true;
}
