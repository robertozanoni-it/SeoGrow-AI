const siteUrl = String(process.env.SEOGROW_WP_SITE_URL || "").trim();
const username = String(process.env.SEOGROW_WP_USERNAME || "").trim();
const applicationPassword = String(process.env.SEOGROW_WP_APPLICATION_PASSWORD || "");
const confirmHost = String(process.env.SEOGROW_WP_E2E_CONFIRM_HOST || "").trim().toLowerCase();
const REQUIRED_BUILD = "cache-coherent-20260906-v1";

const missing = [
  ["SEOGROW_WP_SITE_URL", siteUrl],
  ["SEOGROW_WP_USERNAME", username],
  ["SEOGROW_WP_APPLICATION_PASSWORD", applicationPassword],
  ["SEOGROW_WP_E2E_CONFIRM_HOST", confirmHost],
].filter(([, value]) => !value).map(([name]) => name);
if (missing.length) throw new Error(`Preflight cache-coherence non avviato: variabili mancanti: ${missing.join(", ")}.`);

const site = new URL(siteUrl);
if (site.protocol !== "https:") throw new Error("Preflight cache-coherence: il sito WordPress deve usare HTTPS.");
if (site.hostname.toLowerCase() !== confirmHost) throw new Error("Preflight cache-coherence: confirm_host non coincide con site_url.");

const endpoint = new URL(site.href);
endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/wp-json/seogrow/v1/taxonomy-cache-coherence-capability`;
endpoint.search = "";
endpoint.hash = "";

const auth = `Basic ${Buffer.from(`${username}:${applicationPassword}`, "utf8").toString("base64")}`;
const response = await fetch(endpoint, {
  method: "GET",
  headers: {
    authorization: auth,
    accept: "application/json",
    "user-agent": "SeoGrow-E2E/cache-coherence-preflight",
  },
  redirect: "manual",
  signal: AbortSignal.timeout(20_000),
});

if ([301, 302, 303, 307, 308].includes(response.status)) {
  throw new Error("Preflight cache-coherence: redirect WordPress inatteso. Nessuna scrittura eseguita.");
}

const text = await response.text();
let data;
try { data = text ? JSON.parse(text) : {}; }
catch { throw new Error(`Preflight cache-coherence: risposta non JSON (HTTP ${response.status}). Nessuna scrittura eseguita.`); }

if (!response.ok) {
  throw new Error(
    `Preflight cache-coherence bloccato: Connector non aggiornato o capability non disponibile (HTTP ${response.status}, ${data.code || data.message || "nessun dettaglio"}). ` +
    "Installa il Connector cache-coherent più recente prima di qualsiasi write E2E. Nessuna scrittura eseguita.",
  );
}

if (
  data?.ok !== true ||
  data?.readOnly !== true ||
  data?.resource !== "taxonomy-cache-coherence-capability" ||
  data?.crossRequestCacheCoherence !== true ||
  data?.build !== REQUIRED_BUILD ||
  data?.writesPerformed !== 0
) {
  throw new Error(
    `Preflight cache-coherence non valido: richiesta build ${REQUIRED_BUILD}, ricevuta ${JSON.stringify(data?.build || "assente")}. ` +
    "Nessuna scrittura eseguita.",
  );
}

console.log(`Preflight Rank Math cache coherence: build ${data.build} disponibile, read-only e obbligatoria.`);
