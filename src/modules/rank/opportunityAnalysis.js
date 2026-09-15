export function queryChanges(current, previous) {
  if (!current?.queries?.length || !previous?.queries?.length) return [];
  const normalizedQuery = (value) => String(value || "").trim().toLocaleLowerCase("it");
  const before = new Map(previous.queries.map((row) => [normalizedQuery(row.dimension), row]));
  const after = new Map(current.queries.map((row) => [normalizedQuery(row.dimension), row]));
  const retainedAndNew = current.queries.map((row) => {
    const old = before.get(normalizedQuery(row.dimension));
    return {
      ...row,
      query: row.dimension,
      page: row.page || "",
      changeType: old ? "retained" : "appeared",
      clickDelta: row.clicks - (old?.clicks || 0),
      impressionDelta: row.impressions - (old?.impressions || 0),
      positionDelta: old ? row.position - old.position : null,
    };
  });
  const lost = previous.queries
    .filter((row) => !after.has(normalizedQuery(row.dimension)))
    .map((row) => ({
      ...row,
      query: row.dimension,
      changeType: "lost",
      clickDelta: -row.clicks,
      impressionDelta: -row.impressions,
      positionDelta: null,
    }));
  return [...retainedAndNew, ...lost];
}

export function opportunityGroups(dataset) {
  if (!dataset?.queries?.length)
    return { quickWins: [], lowCtr: [], losses: [], cannibalizations: [] };
  const quickWins = dataset.queries
    .filter(
      (row) => row.impressions >= 10 && row.position >= 4 && row.position <= 20,
    )
    .toSorted((a, b) => b.impressions - a.impressions)
    .slice(0, 50);
  const lowCtr = dataset.queries
    .filter((row) => row.impressions >= 30 && row.ctr < 1.5)
    .toSorted((a, b) => b.impressions - a.impressions)
    .slice(0, 50);
  const losses = (dataset.changes || [])
    .filter((row) => row.clickDelta < 0 || row.positionDelta > 2)
    .toSorted((a, b) => a.clickDelta - b.clickDelta)
    .slice(0, 50);
  const cannibalizations = (dataset.queryPages || [])
    .filter((row) => row.pages?.length > 1)
    .toSorted((a, b) => b.impressions - a.impressions)
    .slice(0, 50);
  return { quickWins, lowCtr, losses, cannibalizations };
}

export function queryTaskDetail(row, pageUrl = "", exactAssociation = false) {
  const metrics = `${row.impressions} impressioni · ${row.clicks} clic · CTR ${Number(row.ctr || 0).toFixed(2)}% · posizione media ${Number(row.position || 0).toFixed(1)}`;
  const association = pageUrl
    ? exactAssociation
      ? `Pagina associata dai dati query–pagina: ${pageUrl}`
      : `Pagina suggerita dal percorso URL, da verificare: ${pageUrl}`
    : "Pagina non determinabile dallo ZIP: associare manualmente la query a una URL prima di intervenire.";
  return `EVIDENZA SEARCH CONSOLE\n${metrics}\n${association}\n\nAZIONI CONSIGLIATE\n1. Verifica che la pagina risponda allo stesso intento della query.\n2. Controlla title, H1 e primo paragrafo: devono spiegare subito il tema senza forzare la keyword.\n3. Confronta il contenuto con le pagine già posizionate e completa solo le informazioni realmente mancanti.\n4. Aggiungi 2–4 link interni pertinenti verso questa pagina e controlla quelli in uscita.\n5. Se le impressioni sono alte ma il CTR è basso, migliora title e meta description.\n6. Dopo la modifica annota la data e confronta clic, CTR e posizione alla prossima importazione.`;
}
