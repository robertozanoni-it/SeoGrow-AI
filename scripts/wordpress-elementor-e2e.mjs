const appUrl = String(process.env.SEOGROW_E2E_APP_URL || "http://127.0.0.1:5176").replace(/\/+$/, "");
const siteUrl = String(process.env.SEOGROW_WP_SITE_URL || "").trim();
const username = String(process.env.SEOGROW_WP_USERNAME || "").trim();
const applicationPassword = String(process.env.SEOGROW_WP_APPLICATION_PASSWORD || "");
const confirmHost = String(process.env.SEOGROW_WP_E2E_CONFIRM_HOST || "").trim().toLowerCase();

const required = [
  ["SEOGROW_WP_SITE_URL", siteUrl],
  ["SEOGROW_WP_USERNAME", username],
  ["SEOGROW_WP_APPLICATION_PASSWORD", applicationPassword],
  ["SEOGROW_WP_E2E_CONFIRM_HOST", confirmHost],
];
const missing = required.filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  throw new Error(`E2E Elementor read-only non avviato: variabili mancanti: ${missing.join(", ")}.`);
}

const site = new URL(siteUrl);
if (site.protocol !== "https:") throw new Error("Il sito WordPress E2E deve usare HTTPS.");
if (site.hostname.toLowerCase() !== confirmHost) {
  throw new Error(`Conferma host non valida: atteso ${site.hostname.toLowerCase()}, ricevuto ${confirmHost || "vuoto"}.`);
}

async function request(path, body) {
  const response = await fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${path}: risposta SeoGrow non JSON (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}: ${data.error || data.code || text.slice(0, 300)}`);
  }
  return data;
}

async function health() {
  const response = await fetch(`${appUrl}/api/health`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`SeoGrow non è raggiungibile su ${appUrl} (HTTP ${response.status}).`);
  const data = await response.json();
  if (data?.ok !== true) throw new Error(`SeoGrow non è healthy su ${appUrl}.`);
}

const credentials = { siteUrl, username, applicationPassword };

await health();
const connection = await request("/api/wordpress/connection-check", credentials);
if (connection?.ok !== true) throw new Error("Connection-check WordPress non riuscito.");
if (!connection.connector?.version) throw new Error("SeoGrow Connector non rilevato dal sito di prova.");

const impact = await request("/api/wordpress/elementor-reference-impact", credentials);
if (impact.readOnly !== true) throw new Error("Cross-page Elementor non dichiara esplicitamente readOnly=true.");
if (impact.sharedWriteAllowed !== false) throw new Error("Cross-page Elementor ha esposto sharedWriteAllowed diverso da false.");
if (!impact.inventory || impact.inventory.verified !== true) {
  throw new Error(`Inventario WordPress non autorevole: ${impact.status || "stato assente"}.`);
}
if (!Array.isArray(impact.inventory.resources) || impact.inventory.resources.length === 0) {
  throw new Error("Inventario WordPress autorevole vuoto: impossibile validare la scansione cross-page.");
}
if (impact.verified !== true || impact.affectedPagesEnumerated !== true || impact.impact?.complete !== true) {
  throw new Error(`Scansione cross-page incompleta: ${impact.status || impact.impact?.status || "stato assente"}.`);
}
if (!Array.isArray(impact.impact.references)) throw new Error("Mappa riferimenti Elementor assente.");

const totalReferences = impact.impact.references.reduce(
  (sum, entry) => sum + (Array.isArray(entry?.sources) ? entry.sources.length : 0),
  0,
);
const postTypes = [...new Set(impact.inventory.resources.map((resource) => resource.postType))].sort();

console.log(`SeoGrow Elementor E2E read-only OK su ${site.hostname}.`);
console.log(`Connector: ${connection.connector.version}`);
console.log(`Risorse inventariate: ${impact.inventory.resources.length}`);
console.log(`Post type: ${postTypes.join(", ")}`);
console.log(`Template/global widget referenziati: ${impact.impact.references.length}`);
console.log(`Riferimenti cross-page totali: ${totalReferences}`);
console.log(`Evidence source: ${impact.evidenceSource || "non dichiarata"}`);
console.log("Nessuna scrittura WordPress/Elementor è stata eseguita.");
