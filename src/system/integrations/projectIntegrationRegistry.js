export const INTEGRATION_KINDS = Object.freeze(["wordpress", "openai", "dataforseo", "search-console"]);

const text = (value) => String(value ?? "").trim();
const bool = (value) => value === true;
const safeUrl = (value) => {
  try {
    const url = new URL(text(value));
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
};

const readableError = (value, fallback = "Connessione non disponibile.") => {
  const message = text(value?.message || value?.error || value);
  return message || fallback;
};

export function buildProjectIntegrationRegistry({
  client,
  wordpressSession = null,
  wordpressProfile = null,
  openAiStatus = null,
  dataForSeoStatus = null,
  googleStatus = null,
  googleProperties = [],
  dataset = null,
} = {}) {
  const clientId = Number(client?.id);
  const siteUrl = safeUrl(client?.url);
  const wpUrl = safeUrl(wordpressSession?.url || wordpressProfile?.url || siteUrl);
  const googleRows = Array.isArray(googleProperties) ? googleProperties : [];
  const selectedProperty = googleRows.find((item) => {
    const propertyUrl = safeUrl(item?.url);
    if (!propertyUrl || !siteUrl) return false;
    try { return new URL(propertyUrl).hostname.replace(/^www\./, "") === new URL(siteUrl).hostname.replace(/^www\./, ""); }
    catch { return false; }
  }) || null;

  const connections = [
    {
      kind: "wordpress",
      label: "WordPress",
      scope: "project",
      configured: Boolean(wordpressProfile?.url && wordpressProfile?.username),
      connected: Boolean(wordpressSession?.verifiedAt),
      testedAt: text(wordpressSession?.verifiedAt),
      identity: wpUrl || siteUrl,
      detail: wordpressSession?.verifiedAt
        ? `Sessione verificata per ${wpUrl || siteUrl}. La password applicativa resta solo in memoria.`
        : wordpressProfile?.url
          ? "Profilo salvato senza segreto. Verifica la connessione per creare una sessione temporanea."
          : "WordPress non configurato per questo progetto.",
      error: "",
    },
    {
      kind: "openai",
      label: "OpenAI",
      scope: "shared-provider",
      configured: bool(openAiStatus?.configured ?? openAiStatus?.aiConfigured),
      connected: bool(openAiStatus?.configured ?? openAiStatus?.aiConfigured),
      testedAt: text(openAiStatus?.checkedAt),
      identity: text(openAiStatus?.model) || "Provider OpenAI ufficiale",
      detail: bool(openAiStatus?.configured ?? openAiStatus?.aiConfigured)
        ? `Provider disponibile${openAiStatus?.model ? ` · modello ${openAiStatus.model}` : ""}. Il progetto usa questa connessione condivisa senza duplicare la chiave.`
        : "OpenAI non configurato nel runtime.",
      error: text(openAiStatus?.error),
    },
    {
      kind: "dataforseo",
      label: "DataForSEO",
      scope: "shared-provider",
      configured: bool(dataForSeoStatus?.configured),
      connected: bool(dataForSeoStatus?.configured),
      testedAt: text(dataForSeoStatus?.checkedAt),
      identity: "Provider DataForSEO",
      detail: bool(dataForSeoStatus?.configured)
        ? "Provider disponibile. Tutti i moduli del progetto riusano lo stesso runtime DataForSEO."
        : "DataForSEO non configurato nel runtime.",
      error: text(dataForSeoStatus?.error),
    },
    {
      kind: "search-console",
      label: "Search Console",
      scope: "project",
      configured: bool(googleStatus?.configured) || Boolean(selectedProperty) || Boolean(dataset),
      connected: bool(googleStatus?.connected) || Boolean(selectedProperty) || Boolean(dataset),
      testedAt: text(googleStatus?.checkedAt || dataset?.importedAt),
      identity: selectedProperty?.url || text(dataset?.siteUrl || dataset?.property) || siteUrl,
      detail: selectedProperty
        ? `Proprietà Google associata: ${selectedProperty.url}`
        : dataset
          ? "Dati Search Console disponibili nel progetto."
          : bool(googleStatus?.configured)
            ? "Google configurato; seleziona o importa la proprietà del progetto."
            : "Search Console non collegata.",
      error: text(googleStatus?.error),
    },
  ];

  return {
    project: { id: Number.isSafeInteger(clientId) && clientId > 0 ? clientId : null, name: text(client?.name), siteUrl },
    connections,
    valid: Boolean(Number.isSafeInteger(clientId) && clientId > 0 && siteUrl),
  };
}

export function integrationConnection(registry, kind) {
  return registry?.connections?.find((item) => item.kind === kind) || null;
}

export function validateSingleProjectIntegrationConfig(registry) {
  const errors = [];
  if (!registry?.valid) errors.push("Progetto non valido o URL mancante.");
  const seen = new Set();
  for (const item of registry?.connections || []) {
    if (!INTEGRATION_KINDS.includes(item.kind)) errors.push(`Integrazione non supportata: ${item.kind}.`);
    if (seen.has(item.kind)) errors.push(`Configurazione duplicata: ${item.kind}.`);
    seen.add(item.kind);
    if (item.error) errors.push(`${item.label}: ${readableError(item.error)}`);
  }
  for (const kind of INTEGRATION_KINDS) if (!seen.has(kind)) errors.push(`Configurazione mancante: ${kind}.`);
  return { ok: errors.length === 0, errors };
}

export function integrationStatusLabel(connection) {
  if (!connection) return "Non disponibile";
  if (connection.error) return "Errore";
  if (connection.connected) return "Connessa";
  if (connection.configured) return "Configurata, da verificare";
  return "Non configurata";
}
