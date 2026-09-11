export function filterProblemRows(rows, filters = {}) {
  return rows.filter((row) => {
    if (filters.state === "active" && ["resolved", "intentional"].includes(row.problemState)) return false;
    if (filters.state === "resolved" && row.problemState !== "resolved") return false;
    if (filters.state === "reappeared" && row.problemState !== "reappeared") return false;
    if (filters.query) {
      const haystack = `${row.title} ${row.sourceUrl} ${row.detail} ${(row.targetUrls || []).join(" ")}`.toLowerCase();
      if (!haystack.includes(filters.query.toLowerCase())) return false;
    }
    if (filters.severity && row.severity !== filters.severity) return false;
    if (filters.type && row.issueType !== filters.type) return false;
    if (filters.adapter && !row.adapters.includes(filters.adapter)) return false;
    if (filters.source && !row.sources.some((source) => source.kind === filters.source)) return false;
    if (filters.correctability && row.correctability !== filters.correctability) return false;
    if (filters.special === "ownership" && !row.ownershipBlocked) return false;
    if (filters.special === "regression" && !row.regression) return false;
    if (filters.special === "stale" && !row.stale) return false;
    if (filters.special === "error" && !row.technicalError) return false;
    return true;
  });
}
