const day = 86_400_000;

export function datasetKey(dataset) {
  let hash = 2166136261;
  const add = (value) => {
    const text = String(value ?? "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  };
  for (const section of ["graph", "queries", "pages", "countries", "devices", "queryPages"]) {
    add(section);
    for (const row of dataset?.[section] || []) {
      add(row.dimension || row.query || row.date);
      add(row.clicks);
      add(row.impressions);
      add(row.ctr);
      add(row.position);
      if (row.pages) row.pages.forEach(add);
    }
  }
  return [
    dataset?.property?.host,
    dataset?.dateFrom,
    dataset?.dateTo,
    dataset?.totals?.clicks,
    dataset?.totals?.impressions,
    (dataset?.queries || []).length,
    (hash >>> 0).toString(36),
  ].join("|");
}

export function addDatasetToHistory(history, clientId, dataset) {
  const current = Array.isArray(history?.[clientId]) ? history[clientId] : [];
  const next = [
    dataset,
    ...current.filter((item) => datasetKey(item) !== datasetKey(dataset)),
  ]
    .toSorted(
      (a, b) =>
        String(b.dateTo || b.importedAt).localeCompare(
          String(a.dateTo || a.importedAt),
        ) || String(b.importedAt).localeCompare(String(a.importedAt)),
    )
    .slice(0, 24);
  return { ...(history || {}), [clientId]: next };
}

export function compareDatasets(current, previous) {
  if (!current || !previous) return null;
  const duration = (dataset) => {
    const start = Date.parse(`${dataset.dateFrom}T00:00:00Z`);
    const end = Date.parse(`${dataset.dateTo}T00:00:00Z`);
    return Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(1, Math.round((end - start) / day) + 1)
      : null;
  };
  const currentDays = duration(current);
  const previousDays = duration(previous);
  if (
    currentDays &&
    previousDays &&
    Math.abs(currentDays - previousDays) / Math.max(currentDays, previousDays) >
      0.1
  )
    return null;
  const currentStart = Date.parse(`${current.dateFrom}T00:00:00Z`);
  const previousEnd = Date.parse(`${previous.dateTo}T00:00:00Z`);
  if (
    Number.isFinite(currentStart) &&
    Number.isFinite(previousEnd) &&
    (previousEnd >= currentStart || currentStart - previousEnd > 8 * day)
  )
    return null;
  const change = (now, before) =>
    before ? ((now - before) / before) * 100 : null;
  return {
    clicks: change(current.totals.clicks, previous.totals.clicks),
    impressions: change(
      current.totals.impressions,
      previous.totals.impressions,
    ),
    ctr: current.totals.ctr - previous.totals.ctr,
    position: current.totals.position - previous.totals.position,
  };
}
