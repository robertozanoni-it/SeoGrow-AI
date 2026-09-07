import { createHash } from "node:crypto";
import { pinnedHttpsFetch } from "../server/pinnedHttpsFetch.js";

const appUrl = String(process.env.SEOGROW_E2E_APP_URL || "http://127.0.0.1:5176").replace(/\/+$/, "");
const siteUrl = String(process.env.SEOGROW_WP_SITE_URL || "").trim();
const username = String(process.env.SEOGROW_WP_USERNAME || "").trim();
const applicationPassword = String(process.env.SEOGROW_WP_APPLICATION_PASSWORD || "");
const categoryUrl = String(process.env.SEOGROW_WP_CATEGORY_URL || "").trim();
const tagUrl = String(process.env.SEOGROW_WP_TAG_URL || "").trim();
const confirmHost = String(process.env.SEOGROW_WP_E2E_CONFIRM_HOST || "").trim().toLowerCase();

const OFFSETS_MS = [0, 1000, 3000, 7000, 15000];
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 750;
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const markerPresent = (value) => /SeoGrow E2E/i.test(compact(value));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fingerprint = (value) => createHash("sha256").update(compact(value), "utf8").digest("hex").slice(0, 16);
const valueState = (value) => ({
  fp: fingerprint(value),
  len: compact(value).length,
  marker: markerPresent(value),
});

export function classifySampler(samples = []) {
  if (!Array.isArray(samples) || samples.length < 2) return { code: "INSUFFICIENT_SAMPLES" };
  const signatures = samples.map((sample) => JSON.stringify({
    api: sample.api,
    inspection: sample.inspection,
    database: sample.database,
    cache: sample.cache,
    frontend: sample.frontend,
  }));
  const oscillating = new Set(signatures).size > 1;
  const anyMarker = samples.some((sample) => [sample.api, sample.inspection, sample.database, sample.cache, sample.frontend].some((state) => state?.marker));
  const allCoherent = samples.every((sample) =>
    sample.dbRowCount === 1 &&
    sample.api.fp === sample.inspection.fp &&
    sample.api.fp === sample.database.fp &&
    sample.api.fp === sample.cache.fp &&
    sample.api.fp === sample.frontend.fp
  );
  if (oscillating) return { code: "CROSS_REQUEST_STATE_OSCILLATION" };
  if (allCoherent && anyMarker) return { code: "STABLE_MARKER_PRESENT" };
  if (allCoherent && !anyMarker) return { code: "STABLE_CLEAN" };
  return { code: "STABLE_DIVERGENCE" };
}

export function isTransientNetworkError(error) {
  const codes = new Set([
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ENETUNREACH",
    "ETIMEDOUT",
  ]);
  let cursor = error;
  while (cursor) {
    if (codes.has(cursor.code)) return true;
    cursor = cursor.cause;
  }
  if ([502, 503, 504].includes(Number(error?.status))) return true;
  return error?.name === "TimeoutError";
}

async function withTransientRetry(label, operation) {
  let lastError;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const transient = isTransientNetworkError(error);
      if (!transient || attempt >= RETRY_ATTEMPTS) throw error;
      const delay = RETRY_BASE_MS * attempt;
      console.warn(`[network] ${label}: errore transitorio al tentativo ${attempt}/${RETRY_ATTEMPTS}; retry tra ${delay} ms (${error.code || error.cause?.code || error.name || "network-error"}).`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function requiredEnv() {
  const required = [
    ["SEOGROW_WP_SITE_URL", siteUrl],
    ["SEOGROW_WP_USERNAME", username],
    ["SEOGROW_WP_APPLICATION_PASSWORD", applicationPassword],
    ["SEOGROW_WP_E2E_CONFIRM_HOST", confirmHost],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Consistency sampler non avviato: variabili mancanti: ${missing.join(", ")}.`);
  if (!categoryUrl && !tagUrl) throw new Error("Consistency sampler non avviato: indica almeno category_url oppure tag_url.");
  const site = new URL(siteUrl);
  if (site.protocol !== "https:") throw new Error("Il sito WordPress deve usare HTTPS.");
  if (site.hostname.toLowerCase() !== confirmHost) throw new Error("confirm_host non coincide con site_url.");
  return site;
}

async function jsonResponse(response, label) {
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${label}: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok) {
    const error = new Error(`${label}: HTTP ${response.status}: ${data.message || data.error || data.code || text.slice(0, 200)}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function inspectViaSeoGrow(url) {
  return withTransientRetry("SeoGrow inspect-taxonomy", async () => {
    const response = await fetch(`${appUrl}/api/wordpress/inspect-taxonomy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteUrl, url, username, applicationPassword }),
      signal: AbortSignal.timeout(30_000),
    });
    return jsonResponse(response, "SeoGrow inspect-taxonomy");
  });
}

async function connectorDiagnostics(site, url) {
  const endpoint = new URL("/wp-json/seogrow/v1/taxonomy-diagnostics", site.origin);
  endpoint.searchParams.set("url", url);
  const auth = `Basic ${Buffer.from(`${username}:${applicationPassword}`, "utf8").toString("base64")}`;
  return withTransientRetry("Connector taxonomy-diagnostics", async () => {
    const response = await pinnedHttpsFetch(endpoint, {
      headers: { authorization: auth, accept: "application/json", "user-agent": "SeoGrowAI/taxonomy-consistency-sampler" },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) throw new Error("Connector diagnostics: redirect inatteso.");
    return jsonResponse(response, "Connector taxonomy-diagnostics");
  });
}

function metaDescriptionFromHtml(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = {};
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    }
    if (String(attrs.name || "").toLowerCase() === "description") return String(attrs.content || "");
  }
  return "";
}

function selectedHeaders(headers) {
  const names = ["age", "cf-cache-status", "x-cache", "cache-control", "etag", "last-modified", "server", "via"];
  return Object.fromEntries(names.map((name) => [name, headers.get(name)]).filter(([, value]) => value));
}

async function frontend(url) {
  return withTransientRetry(`Frontend ${url}`, async () => {
    const response = await fetch(url, {
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "SeoGrowAI/taxonomy-consistency-sampler" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    const html = await response.text();
    if (!response.ok) {
      const error = new Error(`Frontend ${url}: HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return { metaDescription: metaDescriptionFromHtml(html), headers: selectedHeaders(response.headers), finalUrl: response.url };
  });
}

async function sampleTarget(site, target, index, offsetMs) {
  const [inspection, diagnostics, publicResult] = await Promise.all([
    inspectViaSeoGrow(target.url),
    connectorDiagnostics(site, target.url),
    frontend(target.url),
  ]);
  if (diagnostics.readOnly !== true || diagnostics.writesPerformed !== 0 || diagnostics.resource !== "taxonomy-diagnostics") {
    throw new Error(`${target.label}: il Connector non attesta una diagnostica read-only.`);
  }
  const rank = diagnostics.meta?.rank_math_description || {};
  const dbRows = Array.isArray(rank.dbRows) ? rank.dbRows : [];
  const dbValue = dbRows.length ? dbRows[dbRows.length - 1]?.value : "";
  const cacheValues = Array.isArray(rank.cache?.values) ? rank.cache.values : [];
  const cacheValue = cacheValues.length ? cacheValues[cacheValues.length - 1] : "";
  const sample = {
    index,
    offsetMs,
    capturedAt: new Date().toISOString(),
    dbRowCount: dbRows.length,
    duplicateRows: rank.duplicateRows === true,
    api: valueState(rank.apiValue),
    inspection: valueState(inspection.seo?.rankMath?.meta_description),
    database: valueState(dbValue),
    cache: valueState(cacheValue),
    frontend: valueState(publicResult.metaDescription),
    headers: publicResult.headers,
  };
  console.log(`[${target.label}] T+${(offsetMs / 1000).toFixed(offsetMs % 1000 ? 3 : 0)}s #${index + 1} ${sample.capturedAt}`);
  console.log(`[${target.label}] state=${JSON.stringify({ api: sample.api, inspection: sample.inspection, database: sample.database, cache: sample.cache, frontend: sample.frontend, dbRowCount: sample.dbRowCount, duplicateRows: sample.duplicateRows })}`);
  console.log(`[${target.label}] frontend_headers=${JSON.stringify(sample.headers)}`);
  return sample;
}

async function main() {
  const site = requiredEnv();
  const targets = [
    categoryUrl ? { label: "categoria", url: categoryUrl } : null,
    tagUrl ? { label: "tag", url: tagUrl } : null,
  ].filter(Boolean);
  for (const target of targets) {
    const parsed = new URL(target.url);
    if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== site.hostname.toLowerCase()) {
      throw new Error(`${target.label}: URL deve essere HTTPS e appartenere a ${site.hostname}.`);
    }
    console.log(`\n[${target.label}] CONSISTENCY SAMPLER READ-ONLY ${target.url}`);
    const samples = [];
    const started = Date.now();
    for (let i = 0; i < OFFSETS_MS.length; i += 1) {
      const waitMs = Math.max(0, started + OFFSETS_MS[i] - Date.now());
      if (waitMs) await sleep(waitMs);
      samples.push(await sampleTarget(site, target, i, OFFSETS_MS[i]));
    }
    const classification = classifySampler(samples);
    console.log(`[${target.label}] CLASSIFICATION=${classification.code}`);
    if (classification.code === "CROSS_REQUEST_STATE_OSCILLATION") {
      throw new Error(`${target.label}: CROSS_REQUEST_STATE_OSCILLATION rilevata senza alcuna scrittura del sampler.`);
    }
    if (classification.code === "STABLE_DIVERGENCE") {
      throw new Error(`${target.label}: STABLE_DIVERGENCE tra livelli read-only.`);
    }
    if (classification.code === "STABLE_MARKER_PRESENT") {
      throw new Error(`${target.label}: STABLE_MARKER_PRESENT in tutti i livelli; ripristino manuale necessario prima di qualunque write-test.`);
    }
    console.log(`[${target.label}] STABLE_CLEAN: cinque campioni coerenti, nessun marker, nessuna scrittura.`);
  }
}

const invoked = process.argv[1]?.endsWith("wordpress-taxonomy-consistency-sampler.mjs");
if (invoked) await main();
