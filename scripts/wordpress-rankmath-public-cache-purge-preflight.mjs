import { pinnedHttpsFetch } from "../server/pinnedHttpsFetch.js";

const siteUrl = String(process.env.SEOGROW_WP_SITE_URL || "").trim();
const username = String(process.env.SEOGROW_WP_USERNAME || "").trim();
const applicationPassword = String(process.env.SEOGROW_WP_APPLICATION_PASSWORD || "");
const expectedBuild = "litespeed-url-purge-20260906-v1";

if (!siteUrl || !username || !applicationPassword) {
  throw new Error("Rank Math public-cache preflight: credenziali o site_url mancanti.");
}

const endpoint = new URL("/wp-json/seogrow/v1/taxonomy-public-cache-purge-capability", siteUrl);
const response = await pinnedHttpsFetch(endpoint, {
  method: "GET",
  headers: {
    authorization: `Basic ${Buffer.from(`${username}:${applicationPassword}`, "utf8").toString("base64")}`,
    accept: "application/json",
    "user-agent": "SeoGrowAI/1.4-rankmath-public-cache-preflight",
  },
  redirect: "manual",
  signal: AbortSignal.timeout(20_000),
});

if ([301, 302, 303, 307, 308].includes(response.status)) {
  throw new Error("Rank Math public-cache preflight: redirect inatteso.");
}

const text = await response.text();
let data;
try { data = text ? JSON.parse(text) : {}; }
catch { throw new Error(`Rank Math public-cache preflight: risposta non JSON (HTTP ${response.status}).`); }

if (!response.ok) {
  throw new Error(`Rank Math public-cache preflight: HTTP ${response.status}. Aggiorna SeoGrow Connector prima di qualsiasi write.`);
}

if (
  data?.ok !== true ||
  data?.readOnly !== true ||
  data?.resource !== "taxonomy-public-cache-purge-capability" ||
  data?.publicCachePurge !== true ||
  data?.hook !== "litespeed_purge_url" ||
  data?.build !== expectedBuild ||
  data?.contentWritesPerformed !== 0 ||
  data?.cacheMutationPerformed !== false
) {
  throw new Error("Rank Math public-cache preflight: capability assente o non conforme. Nessuna scrittura consentita.");
}

console.log(`Preflight Rank Math public cache: build ${data.build} disponibile, read-only e obbligatoria.`);
