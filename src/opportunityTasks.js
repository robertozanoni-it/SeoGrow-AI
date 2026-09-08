import { suggestPageForQuery } from "./seoHelpers.js";

const normalizedQuery = value => String(value || "").trim().toLocaleLowerCase("it");

export function opportunityTask(row, dataset, tab = "quickWins") {
  const query = row.dimension || row.query || "";
  const relation = dataset?.queryPages?.find(item =>
    normalizedQuery(item.dimension || item.query) === normalizedQuery(query));
  const exact = row.page || row.pages?.[0] || relation?.pages?.[0] || "";
  const sourceUrl = exact || suggestPageForQuery(query, dataset?.pages || [])?.url || "";
  const cannibalization = tab === "cannibalizations";
  return {
    title: `${cannibalization ? "Verifica cannibalizzazione" : "Ottimizza"} “${query}”`,
    query,
    kind: cannibalization ? "cannibalization" : "search",
    sourceUrl,
    targetUrl: "",
    associationStatus: exact ? "verified" : "suggested",
    linkLabel: exact ? "Pagina associata" : "Pagina suggerita",
    priority: row.position <= 10 ? "Alta" : "Media",
    detail: row.pages?.length
      ? `URL coinvolti: ${row.pages.join(", ")}`
      : `${Number(row.impressions || 0)} impressioni · posizione ${Number(row.position).toFixed(1)}`,
  };
}

export function findExistingTask(tasks, values, clientId) {
  return tasks.find(item => {
    if (item.sourceClientId !== clientId || item.stale || item.status === "Completato") return false;
    if (values.kind === "search" && item.kind === "search" && values.query &&
        normalizedQuery(item.query) === normalizedQuery(values.query)) return true;
    if (normalizedQuery(item.title) !== normalizedQuery(values.title)) return false;
    if ((item.sourceUrl || "") === (values.sourceUrl || "") &&
        (item.targetUrl || "") === (values.targetUrl || "")) return true;
    // Recognize earlier opportunity tasks saved as manual destinations.
    return values.kind === "search" && item.kind === "manual" &&
      !item.sourceUrl && Boolean(values.sourceUrl) &&
      item.targetUrl === values.sourceUrl && !values.targetUrl;
  });
}
