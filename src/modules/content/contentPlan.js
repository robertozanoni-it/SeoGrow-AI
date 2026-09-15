import { opportunityGroups } from "../rank/data.js";

const planKey = (value) =>
  String(value || "item")
    .toLocaleLowerCase("it")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

export function contentPlan(dataset, analysis) {
  const groups = opportunityGroups(dataset);
  const exactPages = new Map(
    (dataset?.queryPages || []).map((row) => [
      row.dimension || row.query,
      row.pages?.[0] || "",
    ]),
  );
  const technicalSource = (analysis?.issues || [])
    .filter((issue) => ["orphan", "thin"].includes(issue.type))
    .slice(0, 4);
  const technical = technicalSource.map((issue, index) => ({
    id: `technical-${planKey(issue.url || issue.label || index)}`,
    type: "Architettura",
    title: issue.label,
    reason: issue.detail || "Problema rilevato dal crawl",
    url: issue.url,
    association: "Verificata dal crawl",
    objective: "Migliorare scansione e collegamenti",
    format: "Intervento tecnico",
    slot: `Settimana ${Math.floor(index / 3) + 1}`,
    priority: "Alta",
  }));
  const availableEditorial = Math.max(0, 12 - technical.length);
  const updateLimit = Math.min(8, Math.ceil(availableEditorial * 0.7));
  const update = groups.quickWins.slice(0, updateLimit).map((row, index) => ({
    id: `update-${row.dimension}`,
    type: "Aggiornamento",
    title: row.dimension,
    reason: `${row.impressions} impressioni · posizione ${row.position.toFixed(1)} · CTR ${row.ctr.toFixed(2)}%`,
    url: row.page || exactPages.get(row.dimension) || "",
    association:
      row.page || exactPages.get(row.dimension)
        ? "Confermata da dati query–pagina"
        : "URL da verificare",
    objective:
      row.position <= 10
        ? "Consolidare la prima pagina"
        : "Entrare nella prima pagina",
    format: "Pagina esistente",
    slot: `Settimana ${Math.floor(index / 3) + 1}`,
    priority: row.position <= 10 ? "Alta" : "Media",
  }));
  const alreadyPlanned = new Set(update.map((item) => item.title));
  const create = groups.lowCtr
    .filter((row) => !alreadyPlanned.has(row.dimension))
    .slice(0, Math.max(0, availableEditorial - update.length))
    .map((row, index) => ({
      id: `create-${row.dimension}`,
      type: "Ottimizza snippet",
      title: row.dimension,
      reason: `${row.impressions} impressioni · CTR ${row.ctr.toFixed(2)}%`,
      url: row.page || exactPages.get(row.dimension) || "",
      association:
        row.page || exactPages.get(row.dimension)
          ? "Confermata da dati query–pagina"
          : "URL da verificare",
      objective: "Aumentare il CTR organico",
      format: "Title e meta description",
      slot: `Settimana ${Math.floor((technical.length + update.length + index) / 3) + 1}`,
      priority: "Media",
    }));
  const result = [...technical, ...update, ...create]
    .slice(0, 12)
    .map((item, index) => ({ ...item, slot: `Settimana ${Math.floor(index / 3) + 1}` }));
  if (result.length || !dataset?.queries?.length) return result;
  return dataset.queries.slice(0, 6).map((row, index) => ({
    id: `monitor-${row.dimension}`,
    type: "Valutazione",
    title: row.dimension,
    reason: `${row.impressions} impressioni · posizione ${row.position.toFixed(1)} · CTR ${row.ctr.toFixed(2)}%`,
    url: exactPages.get(row.dimension) || "",
    association: exactPages.has(row.dimension)
      ? "Confermata da dati query–pagina"
      : "URL da verificare",
    objective: "Valutare intento e pagina più adatta",
    format: "Analisi query",
    slot: `Settimana ${Math.floor(index / 3) + 1}`,
    priority: "Bassa",
  }));
}
