export function opportunityQueries(dataset, limit = 20) {
  if (!dataset?.queries?.length) return [];
  return dataset.queries
    .filter(
      (row) =>
        row.impressions > 0 &&
        ((row.position >= 4 && row.position <= 30) ||
          (row.position > 0 && row.position < 4 && row.ctr < 2)),
    )
    .toSorted(
      (a, b) =>
        b.impressions * Math.max(1, Math.min(30, b.position)) -
        a.impressions * Math.max(1, Math.min(30, a.position)),
    )
    .slice(0, limit);
}
