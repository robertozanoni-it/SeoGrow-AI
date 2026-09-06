import { createHash } from "node:crypto";
import { isTransientNetworkError } from "./wordpress-taxonomy-consistency-sampler.mjs";

const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fingerprint = (value) => createHash("sha256").update(compact(value), "utf8").digest("hex").slice(0, 16);
const state = (value) => ({ fp: fingerprint(value), len: compact(value).length, marker: /SeoGrow E2E/i.test(compact(value)) });
const OFFSETS_MS = [0, 750, 2000];

function allSame(values, expected) {
  return values.every((value) => compact(value) === compact(expected));
}

export function classifyPostWriteSamples(samples = [], { marker = "", original = "" } = {}) {
  if (!Array.isArray(samples) || samples.length < 2) return { code: "POSTWRITE_INSUFFICIENT_SAMPLES" };
  const signatures = samples.map((sample) => JSON.stringify({
    api: sample.api,
    inspection: sample.inspection,
    database: sample.database,
    cache: sample.cache,
    frontend: sample.frontend,
    dbRowCount: sample.dbRowCount,
  }));
  if (new Set(signatures).size > 1) return { code: "POSTWRITE_CROSS_REQUEST_OSCILLATION" };

  const allLayers = samples.flatMap((sample) => [sample.raw.api, sample.raw.inspection, sample.raw.database, sample.raw.cache, sample.raw.frontend]);
  const rowCountOk = samples.every((sample) => sample.dbRowCount === 1 && sample.duplicateRows !== true);
  if (rowCountOk && marker && allSame(allLayers, marker)) return { code: "POSTWRITE_MARKER_STABLE" };
  if (rowCountOk && original !== "" && allSame(allLayers, original)) return { code: "POSTWRITE_ORIGINAL_RESTORED" };
  return { code: "POSTWRITE_DIVERGENCE" };
}

function metaDescriptionFromHtml(html) {
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
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

async function withRetry(label, operation) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      last = error;
      if (!isTransientNetworkError(error) || attempt === 3) throw error;
      const delay = attempt * 500;
      console.warn(`[postwrite-network] ${label}: errore transitorio ${attempt}/3; retry tra ${delay} ms.`);
      await sleep(delay);
    }
  }
  throw last;
}

async function json(response, label) {
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

export async function runPostWriteSampler({ nativeFetch, appUrl, siteUrl, username, applicationPassword, targetUrl, marker, original, label = "taxonomy" }) {
  const site = new URL(siteUrl);
  const auth = `Basic ${Buffer.from(`${username}:${applicationPassword}`, "utf8").toString("base64")}`;
  const samples = [];
  const started = Date.now();

  for (let index = 0; index < OFFSETS_MS.length; index += 1) {
    const offsetMs = OFFSETS_MS[index];
    const waitMs = Math.max(0, started + offsetMs - Date.now());
    if (waitMs) await sleep(waitMs);

    const [inspection, diagnostics, publicResult] = await Promise.all([
      withRetry(`${label} SeoGrow inspection`, async () => {
        const response = await nativeFetch(`${appUrl}/api/wordpress/inspect-taxonomy`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteUrl, url: targetUrl, username, applicationPassword }),
          signal: AbortSignal.timeout(20_000),
        });
        return json(response, "Post-write SeoGrow inspection");
      }),
      withRetry(`${label} Connector diagnostics`, async () => {
        const endpoint = new URL("/wp-json/seogrow/v1/taxonomy-diagnostics", site.origin);
        endpoint.searchParams.set("url", targetUrl);
        const response = await nativeFetch(endpoint, {
          headers: { authorization: auth, accept: "application/json", "user-agent": "SeoGrowAI/postwrite-sampler" },
          redirect: "manual",
          signal: AbortSignal.timeout(20_000),
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) throw new Error("Post-write Connector diagnostics: redirect inatteso.");
        return json(response, "Post-write Connector diagnostics");
      }),
      withRetry(`${label} frontend`, async () => {
        const response = await nativeFetch(targetUrl, {
          headers: { accept: "text/html,application/xhtml+xml", "user-agent": "SeoGrowAI/postwrite-sampler" },
          redirect: "follow",
          signal: AbortSignal.timeout(20_000),
        });
        const html = await response.text();
        if (!response.ok) {
          const error = new Error(`Post-write frontend: HTTP ${response.status}.`);
          error.status = response.status;
          throw error;
        }
        return { value: metaDescriptionFromHtml(html), headers: selectedHeaders(response.headers) };
      }),
    ]);

    if (diagnostics.readOnly !== true || diagnostics.writesPerformed !== 0 || diagnostics.resource !== "taxonomy-diagnostics") {
      throw new Error(`${label}: diagnostica post-write non attestata come read-only.`);
    }
    const rank = diagnostics.meta?.rank_math_description || {};
    const dbRows = Array.isArray(rank.dbRows) ? rank.dbRows : [];
    const cacheValues = Array.isArray(rank.cache?.values) ? rank.cache.values : [];
    const raw = {
      api: rank.apiValue ?? "",
      inspection: inspection.seo?.rankMath?.meta_description ?? "",
      database: dbRows.length ? dbRows[dbRows.length - 1]?.value ?? "" : "",
      cache: cacheValues.length ? cacheValues[cacheValues.length - 1] ?? "" : "",
      frontend: publicResult.value ?? "",
    };
    const sample = {
      index,
      offsetMs,
      capturedAt: new Date().toISOString(),
      dbRowCount: dbRows.length,
      duplicateRows: rank.duplicateRows === true,
      raw,
      api: state(raw.api),
      inspection: state(raw.inspection),
      database: state(raw.database),
      cache: state(raw.cache),
      frontend: state(raw.frontend),
      headers: publicResult.headers,
    };
    samples.push(sample);
    console.warn(`[${label}] POSTWRITE T+${offsetMs}ms #${index + 1} state=${JSON.stringify({ api: sample.api, inspection: sample.inspection, database: sample.database, cache: sample.cache, frontend: sample.frontend, dbRowCount: sample.dbRowCount, duplicateRows: sample.duplicateRows })}`);
    console.warn(`[${label}] POSTWRITE frontend_headers=${JSON.stringify(sample.headers)}`);
  }

  const classification = classifyPostWriteSamples(samples, { marker, original });
  console.warn(`[${label}] POSTWRITE_CLASSIFICATION=${classification.code}`);
  return { classification, samples };
}
