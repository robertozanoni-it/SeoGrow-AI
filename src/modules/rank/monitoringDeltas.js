import { compareDatasets, datasetKey } from "./datasetHistory.js";
import { queryChanges } from "./opportunityAnalysis.js";
import {
  buildPositioningRows,
  comparableRankingRuns,
  rankingRunIdentity,
  validRankingRuns,
} from "./positioningModel.js";

const text = (value) => String(value || "").trim();
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const queryName = (row) => text(row?.dimension || row?.query);
const percent = (value) => Number.isFinite(Number(value)) ? Math.abs(Number(value)).toFixed(1) : "0.0";

const alert = ({
  id,
  source,
  tone,
  title,
  text: detail,
  page,
  evidence = {},
  taskDraft = null,
}) => ({
  id,
  source,
  tone,
  title,
  text: detail,
  page,
  evidence,
  taskDraft,
});

const gscPairId = (current, previous) => {
  if (!current || !previous) return "";
  return `${datasetKey(previous)}→${datasetKey(current)}`;
};

const rankingPairId = (current, previous) => {
  if (!current || !previous) return "";
  return `${rankingRunIdentity(previous)}→${rankingRunIdentity(current)}`;
};

export function buildGscMonitoring({ dataset, previousDataset } = {}) {
  const comparison = compareDatasets(dataset, previousDataset);
  const baseline = !comparison;
  const result = {
    baseline,
    comparable: Boolean(comparison),
    comparison,
    queryChanges: [],
    alerts: [],
  };
  if (!comparison) return result;

  const changes = queryChanges(dataset, previousDataset);
  result.queryChanges = changes;
  const pairId = gscPairId(dataset, previousDataset);

  const previousClicks = number(previousDataset?.totals?.clicks);
  const previousImpressions = number(previousDataset?.totals?.impressions);
  if (comparison.clicks != null && comparison.clicks <= -15 && previousClicks >= 10) {
    result.alerts.push(alert({
      id: `monitor:gsc:clicks-drop:${pairId}`,
      source: "Search Console",
      tone: comparison.clicks <= -30 ? "red" : "orange",
      title: `Clic organici in calo del ${percent(comparison.clicks)}%`,
      text: `Confronto tra periodi compatibili: ${Math.round(previousClicks)} → ${Math.round(number(dataset?.totals?.clicks))} clic.`,
      page: "Opportunità",
      evidence: {
        kind: "gsc-total-clicks",
        previous: previousClicks,
        current: number(dataset?.totals?.clicks),
        deltaPercent: comparison.clicks,
        previousPeriod: [previousDataset?.dateFrom || "", previousDataset?.dateTo || ""],
        currentPeriod: [dataset?.dateFrom || "", dataset?.dateTo || ""],
      },
      taskDraft: {
        title: "Indaga il calo dei clic organici",
        kind: "monitoring-gsc",
        priority: comparison.clicks <= -30 ? "Alta" : "Media",
        detail: `Search Console mostra un calo del ${percent(comparison.clicks)}% dei clic tra due periodi compatibili. Verifica prima se la causa è domanda, SERP, snippet, ranking o problema tecnico. Periodo precedente: ${previousDataset?.dateFrom || "—"} → ${previousDataset?.dateTo || "—"}. Periodo attuale: ${dataset?.dateFrom || "—"} → ${dataset?.dateTo || "—"}.`,
      },
    }));
  }

  const lost = changes
    .filter((row) => row.changeType === "lost" && (number(row.impressions) >= 30 || number(row.clicks) >= 3))
    .toSorted((a, b) => number(b.clicks) - number(a.clicks) || number(b.impressions) - number(a.impressions));
  if (lost.length) {
    const top = lost[0];
    result.alerts.push(alert({
      id: `monitor:gsc:queries-lost:${pairId}`,
      source: "Search Console",
      tone: "red",
      title: `${lost.length} query rilevanti non compaiono più`,
      text: `Prima evidenza: “${queryName(top)}” aveva ${Math.round(number(top.impressions))} impressioni e ${Math.round(number(top.clicks))} clic.`,
      page: "Opportunità",
      evidence: {
        kind: "gsc-lost-queries",
        count: lost.length,
        queries: lost.slice(0, 10).map((row) => ({
          query: queryName(row),
          clicks: number(row.clicks),
          impressions: number(row.impressions),
          position: number(row.position),
        })),
      },
      taskDraft: {
        title: `Verifica query perse · ${queryName(top)}`,
        kind: "monitoring-gsc",
        query: queryName(top),
        priority: "Alta",
        sourceUrl: text(top.page),
        detail: `${lost.length} query con evidenza Search Console non compaiono nel periodo corrente. La prima è “${queryName(top)}”: ${Math.round(number(top.impressions))} impressioni e ${Math.round(number(top.clicks))} clic nel periodo precedente. Verifica intent, URL associata, ranking e stato tecnico prima di modificare.`,
      },
    }));
  }

  const drops = changes
    .filter((row) =>
      row.changeType === "retained" &&
      Number.isFinite(Number(row.positionDelta)) &&
      number(row.positionDelta) >= 3 &&
      number(row.impressions) >= 20,
    )
    .toSorted((a, b) => number(b.positionDelta) - number(a.positionDelta) || number(b.impressions) - number(a.impressions));
  if (drops.length) {
    const top = drops[0];
    result.alerts.push(alert({
      id: `monitor:gsc:position-drop:${pairId}`,
      source: "Search Console",
      tone: number(top.positionDelta) >= 5 ? "red" : "orange",
      title: `${drops.length} query hanno perso almeno 3 posizioni medie`,
      text: `Peggior calo: “${queryName(top)}” +${number(top.positionDelta).toFixed(1)} posizioni medie, con ${Math.round(number(top.impressions))} impressioni.`,
      page: "Opportunità",
      evidence: {
        kind: "gsc-position-drop",
        count: drops.length,
        queries: drops.slice(0, 10).map((row) => ({
          query: queryName(row),
          positionDelta: number(row.positionDelta),
          impressions: number(row.impressions),
          clickDelta: number(row.clickDelta),
        })),
      },
      taskDraft: {
        title: `Analizza calo Search Console · ${queryName(top)}`,
        kind: "monitoring-gsc",
        query: queryName(top),
        priority: number(top.positionDelta) >= 5 ? "Alta" : "Media",
        sourceUrl: text(top.page),
        detail: `La posizione media Search Console di “${queryName(top)}” è peggiorata di ${number(top.positionDelta).toFixed(1)} posizioni tra periodi compatibili. Impressioni attuali: ${Math.round(number(top.impressions))}. Verifica SERP, intent, URL associata e ranking DataForSEO prima di intervenire.`,
      },
    }));
  }

  if (
    comparison.impressions != null &&
    comparison.impressions >= 25 &&
    (comparison.clicks == null || comparison.clicks >= 0) &&
    previousImpressions >= 30
  ) {
    result.alerts.push(alert({
      id: `monitor:gsc:impressions-growth:${pairId}`,
      source: "Search Console",
      tone: "green",
      title: `Impressioni organiche in crescita del ${percent(comparison.impressions)}%`,
      text: "Crescita osservata su periodi compatibili; apri Opportunità per verificare dove convertire visibilità in clic.",
      page: "Opportunità",
      evidence: {
        kind: "gsc-impressions-growth",
        previous: previousImpressions,
        current: number(dataset?.totals?.impressions),
        deltaPercent: comparison.impressions,
      },
    }));
  }

  return result;
}

export function buildRankingMonitoring({ rankings = [] } = {}) {
  const runs = validRankingRuns(rankings);
  const current = runs[0] || null;
  const previous = current ? comparableRankingRuns(current, runs)[0] || null : null;
  const baseline = !current || !previous;
  const result = {
    baseline,
    comparable: Boolean(current && previous),
    current,
    previous,
    rows: [],
    alerts: [],
  };
  if (!current || !previous) return result;

  const rows = buildPositioningRows(current, previous, runs);
  result.rows = rows;
  const pairId = rankingPairId(current, previous);
  const declines = rows
    .filter((row) => !row.error && row.position != null && Number(row.delta) <= -3)
    .toSorted((a, b) => Number(a.delta) - Number(b.delta));
  if (declines.length) {
    const top = declines[0];
    const severe = declines.filter((row) => Number(row.delta) <= -5);
    result.alerts.push(alert({
      id: `monitor:dataforseo:decline:${pairId}`,
      source: "DataForSEO",
      tone: severe.length ? "red" : "orange",
      title: `${declines.length} keyword DataForSEO in calo`,
      text: severe.length
        ? `${severe.length} hanno perso almeno 5 posizioni. Peggior caso: “${top.keyword}” ${top.delta}.`
        : `Peggior caso: “${top.keyword}” ${top.delta} posizioni rispetto al controllo comparabile precedente.`,
      page: "Posizionamenti",
      evidence: {
        kind: "dataforseo-ranking-decline",
        count: declines.length,
        severe: severe.length,
        currentCheckedAt: current.checkedAt,
        previousCheckedAt: previous.checkedAt,
        keywords: declines.slice(0, 10).map((row) => ({
          keyword: row.keyword,
          position: row.position,
          delta: row.delta,
          url: row.url,
        })),
      },
      taskDraft: {
        title: `Analizza calo ranking · ${top.keyword}`,
        kind: "monitoring-ranking",
        query: top.keyword,
        priority: severe.length ? "Alta" : "Media",
        sourceUrl: top.url || "",
        detail: `DataForSEO: “${top.keyword}” è passata da ${Number(top.position) + Number(top.delta)} a ${top.position} (${top.delta} posizioni). Confronto tra controlli omogenei per device, profondità, località e lingua. Verifica SERP, contenuto, intent e stato tecnico prima di modificare.`,
      },
    }));
  }

  const improvements = rows.filter((row) => !row.error && row.position != null && Number(row.delta) >= 5);
  if (improvements.length) {
    result.alerts.push(alert({
      id: `monitor:dataforseo:growth:${pairId}`,
      source: "DataForSEO",
      tone: "green",
      title: `${improvements.length} keyword hanno guadagnato almeno 5 posizioni`,
      text: "Il confronto DataForSEO è omogeneo: controlla le keyword in crescita per consolidare i risultati.",
      page: "Posizionamenti",
      evidence: {
        kind: "dataforseo-ranking-growth",
        count: improvements.length,
        currentCheckedAt: current.checkedAt,
        previousCheckedAt: previous.checkedAt,
      },
    }));
  }

  return result;
}

export function buildGrowthMonitoring({ dataset, previousDataset, rankings = [] } = {}) {
  const gsc = buildGscMonitoring({ dataset, previousDataset });
  const dataForSeo = buildRankingMonitoring({ rankings });
  const alerts = [...gsc.alerts, ...dataForSeo.alerts]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
  return {
    baseline: { gsc: gsc.baseline, dataForSeo: dataForSeo.baseline },
    gsc,
    dataForSeo,
    alerts,
  };
}
