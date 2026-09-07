import { pinnedHttpsFetch } from "../server/pinnedHttpsFetch.js";
import crypto from "node:crypto";

const siteUrl = String(process.env.SEOGROW_WP_SITE_URL || "").trim();
const username = String(process.env.SEOGROW_WP_USERNAME || "").trim();
const applicationPassword = String(process.env.SEOGROW_WP_APPLICATION_PASSWORD || "");
const categoryUrl = String(process.env.SEOGROW_WP_CATEGORY_URL || "").trim();
const tagUrl = String(process.env.SEOGROW_WP_TAG_URL || "").trim();
const confirmHost = String(process.env.SEOGROW_WP_E2E_CONFIRM_HOST || "").trim().toLowerCase();
const confirmWrite = String(process.env.SEOGROW_WP_E2E_ALLOW_WRITE || "");
const recoveryOriginal = String(process.env.SEOGROW_WP_RECOVERY_ORIGINAL || "").trim();
const appUrl = String(process.env.SEOGROW_E2E_APP_URL || "http://127.0.0.1:5176").replace(/\/+$/, "");

const targets = [
  categoryUrl ? { label: "categoria", url: categoryUrl } : null,
  tagUrl ? { label: "tag", url: tagUrl } : null,
].filter(Boolean);
const auth = () => `Basic ${Buffer.from(`${username}:${applicationPassword}`, "utf8").toString("base64")}`;
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const isMarker = (value) => /^SeoGrow E2E (categoria|tag) \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(compact(value));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fingerprint = (value) => {
  const normalized = compact(value);
  return `${crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12)}:${normalized.length}`;
};

function validateInputs() {
  const missing = [
    ["SEOGROW_WP_SITE_URL", siteUrl],
    ["SEOGROW_WP_USERNAME", username],
    ["SEOGROW_WP_APPLICATION_PASSWORD", applicationPassword],
    ["SEOGROW_WP_E2E_CONFIRM_HOST", confirmHost],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Rank Math Doctor non avviato: variabili mancanti: ${missing.join(", ")}.`);
  if (!targets.length) throw new Error("Rank Math Doctor richiede almeno una categoria o un tag reale.");
  const site = new URL(siteUrl);
  if (site.protocol !== "https:") throw new Error("Rank Math Doctor richiede HTTPS.");
  if (site.hostname.toLowerCase() !== confirmHost) throw new Error("confirm_host non coincide con site_url.");
  for (const target of targets) {
    const parsed = new URL(target.url);
    if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== site.hostname.toLowerCase()) {
      throw new Error(`${target.label}: URL non appartiene all'host confermato.`);
    }
  }
  if (targets.length > 1 && recoveryOriginal) throw new Error("recovery_original legacy è consentito solo con un target alla volta.");
}

function transient(error) {
  const code = String(error?.cause?.code || error?.code || "");
  if (["UND_ERR_CONNECT_TIMEOUT", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"].includes(code)) return true;
  return /\b(?:502|503|504)\b/.test(String(error?.message || ""));
}

async function retry(label, fn, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await fn(); }
    catch (error) {
      last = error;
      if (!transient(error) || attempt === attempts) throw error;
      const wait = 500 * attempt;
      console.warn(`[doctor-network] ${label}: errore transitorio, retry ${attempt + 1}/${attempts} tra ${wait}ms.`);
      await sleep(wait);
    }
  }
  throw last;
}

async function jsonResponse(response, label) {
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${label}: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok) {
    const error = new Error(`${label}: HTTP ${response.status}: ${data.message || data.error || data.code || "errore sconosciuto"}.`);
    error.status = response.status;
    error.code = String(data?.code || "");
    error.data = data;
    throw error;
  }
  return data;
}

async function wpGet(path, params = {}) {
  return retry(`GET ${path}`, async () => {
    const endpoint = new URL(`/wp-json/seogrow/v1/${path}`, siteUrl);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
    const response = await pinnedHttpsFetch(endpoint, {
      headers: { authorization: auth(), accept: "application/json", "user-agent": "SeoGrowAI/1.4-rankmath-doctor" },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) throw new Error(`${path}: redirect inatteso.`);
    return jsonResponse(response, path);
  });
}

async function wpPost(path, body) {
  return retry(`POST ${path}`, async () => {
    const endpoint = new URL(`/wp-json/seogrow/v1/${path}`, siteUrl);
    const response = await pinnedHttpsFetch(endpoint, {
      method: "POST",
      headers: { authorization: auth(), accept: "application/json", "content-type": "application/json", "user-agent": "SeoGrowAI/1.4-rankmath-doctor" },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) throw new Error(`${path}: redirect inatteso.`);
    return jsonResponse(response, path);
  });
}

async function inspectSeoGrow(url) {
  return retry("SeoGrow inspect-taxonomy", async () => {
    const response = await fetch(`${appUrl}/api/wordpress/inspect-taxonomy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteUrl, url, username, applicationPassword }),
      signal: AbortSignal.timeout(30_000),
    });
    return jsonResponse(response, "SeoGrow inspect-taxonomy");
  });
}

function metaDescriptionFromHtml(html) {
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = {};
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    }
    if (String(attrs.name || "").toLowerCase() === "description") return compact(attrs.content || "");
  }
  return "";
}

async function frontend(url, cacheBust = false) {
  return retry(`frontend ${cacheBust ? "busted" : "canonical"}`, async () => {
    const target = new URL(url);
    if (cacheBust) target.searchParams.set("seogrow_doctor_probe", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const response = await fetch(target, {
      headers: { accept: "text/html,application/xhtml+xml", "cache-control": "no-cache, no-store, max-age=0", pragma: "no-cache", "user-agent": "SeoGrowAI/1.4-rankmath-doctor" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    const html = await response.text();
    if (!response.ok) throw new Error(`Frontend ${target}: HTTP ${response.status}.`);
    return { value: metaDescriptionFromHtml(html), headers: {
      age: response.headers.get("age"),
      cache: response.headers.get("x-litespeed-cache") || response.headers.get("cf-cache-status") || response.headers.get("x-cache"),
      server: response.headers.get("server"),
    }};
  });
}

async function collect(target) {
  const inspection = await inspectSeoGrow(target.url);
  if (inspection?.ownership !== "rank-math-only") {
    return { target, inspection, classification: "OWNERSHIP_NOT_RANK_MATH_ONLY" };
  }
  const termId = inspection?.term?.id;
  const taxonomy = inspection?.term?.taxonomy;
  if (!termId || !taxonomy) return { target, inspection, classification: "IDENTITY_UNRESOLVED" };
  const [diagnostics, doctor, canonical, busted] = await Promise.all([
    wpGet("taxonomy-diagnostics", { url: target.url }),
    wpGet("taxonomy-doctor-state", { url: target.url, termId, taxonomy }),
    frontend(target.url, false),
    frontend(target.url, true),
  ]);
  const rank = diagnostics?.meta?.rank_math_description || {};
  const api = compact(rank.apiValue);
  const inspectionValue = compact(inspection?.seo?.rankMath?.meta_description);
  const rows = Array.isArray(rank.dbRows) ? rank.dbRows.map((row) => compact(row.value)) : [];
  const cache = Array.isArray(rank.cache?.values) ? rank.cache.values.map(compact) : [];
  return {
    target, inspection, diagnostics, doctor, canonical, busted,
    termId, taxonomy,
    api, inspectionValue, rows, cache,
    publicCanonical: compact(canonical.value), publicBusted: compact(busted.value),
  };
}

function summarize(s) {
  if (s.classification) {
    console.log(`[${s.target.label}] ${s.classification}`);
    return;
  }
  console.log(`[${s.target.label}] term=${s.termId}/${s.taxonomy} ownership=${s.inspection.ownership}`);
  console.log(`[${s.target.label}] api=${fingerprint(s.api)} inspect=${fingerprint(s.inspectionValue)} dbRows=${s.rows.length} cacheRows=${s.cache.length} canonical=${fingerprint(s.publicCanonical)} busted=${fingerprint(s.publicBusted)}`);
  console.log(`[${s.target.label}] marker api=${isMarker(s.api)} db=${s.rows.some(isMarker)} cache=${s.cache.some(isMarker)} canonical=${isMarker(s.publicCanonical)} busted=${isMarker(s.publicBusted)}`);
  console.log(`[${s.target.label}] LKG=${s.doctor?.lastKnownGood?.available === true} journal=${s.doctor?.recoveryJournal?.available === true} cacheHeader=${s.canonical.headers.cache || "n/a"}`);
}

function allSame(values) {
  return values.length > 0 && values.every((value) => value === values[0]);
}

function backendConsistent(s) {
  return s.rows.length === 1 && s.api === s.inspectionValue && s.api === s.rows[0];
}

function fullyConsistent(s) {
  return backendConsistent(s) && s.publicCanonical === s.api && s.publicBusted === s.api;
}

async function refreshCaches(s) {
  if (confirmWrite !== "YES_I_UNDERSTAND") throw new Error("Cache remediation richiede confirm_write=YES_I_UNDERSTAND.");
  await wpPost("taxonomy-doctor-refresh-cache", { url: s.target.url, termId: s.termId, taxonomy: s.taxonomy });
  await sleep(1_500);
  return collect(s.target);
}

async function repairDuplicates(s) {
  if (confirmWrite !== "YES_I_UNDERSTAND") throw new Error("Dedupe richiede confirm_write=YES_I_UNDERSTAND.");
  if (s.rows.length <= 1 || !allSame(s.rows) || s.api !== s.rows[0]) return null;
  await wpPost("taxonomy-doctor-dedupe", {
    url: s.target.url, termId: s.termId, taxonomy: s.taxonomy,
    expectedValue: s.api, confirm: "YES_I_UNDERSTAND",
  });
  await sleep(1_000);
  return collect(s.target);
}

async function recoverMarker(s) {
  if (confirmWrite !== "YES_I_UNDERSTAND") throw new Error("Recovery richiede confirm_write=YES_I_UNDERSTAND.");
  const marker = s.api;
  if (!isMarker(marker)) return null;
  if (s.rows.length !== 1 || s.rows[0] !== marker || s.inspectionValue !== marker) return null;

  let original = "";
  let source = "";
  if (s.doctor?.recoveryJournal?.available === true && compact(s.doctor.recoveryJournal.marker) === marker) {
    original = compact(s.doctor.recoveryJournal.original);
    source = "RECOVERY_JOURNAL";
  } else if (s.doctor?.lastKnownGood?.available === true && !isMarker(s.doctor.lastKnownGood.value)) {
    original = compact(s.doctor.lastKnownGood.value);
    source = "LAST_KNOWN_GOOD";
  } else if (recoveryOriginal && targets.length === 1 && !isMarker(recoveryOriginal)) {
    original = compact(recoveryOriginal);
    source = "LEGACY_BOOTSTRAP_INPUT";
  }
  if (!original) {
    const error = new Error("Marker orfano confermato, ma non esiste una sorgente originale attendibile. Per questo marker legacy serve recovery_original una sola volta; per i futuri marker il journal/LKG lo renderà automatico.");
    error.code = "RECOVERY_SOURCE_REQUIRED";
    throw error;
  }
  console.log(`[${s.target.label}] recoverySource=${source} originalFingerprint=${fingerprint(original)} markerFingerprint=${fingerprint(marker)}`);
  await wpPost("taxonomy-recovery-execute", {
    url: s.target.url, termId: s.termId, taxonomy: s.taxonomy,
    expectedMarker: marker, confirm: "YES_I_UNDERSTAND", bootstrapOriginal: original,
  });
  await sleep(2_000);
  return collect(s.target);
}

async function recordLkg(s) {
  if (!fullyConsistent(s) || isMarker(s.api) || !s.api) return;
  const result = await wpPost("taxonomy-doctor-observe", {
    url: s.target.url, termId: s.termId, taxonomy: s.taxonomy,
    adapter: "rank-math", field: "meta_description", expectedCurrent: s.api,
  });
  if (result?.recorded !== true || result?.contentWritesPerformed !== 0) throw new Error("Last-Known-Good non attestato correttamente.");
  console.log(`[${s.target.label}] LAST_KNOWN_GOOD_RECORDED sha=${String(result.sha256 || "").slice(0, 12)}`);
}

async function doctorTarget(target) {
  let s = await collect(target);
  summarize(s);
  if (s.classification) throw new Error(`${target.label}: ${s.classification}. Nessuna remediation automatica consentita.`);

  // 1) Duplicati: riparabili solo se identici e API coincide esattamente.
  if (s.rows.length > 1) {
    if (allSame(s.rows) && s.api === s.rows[0]) {
      console.warn(`RANK_MATH_DOCTOR=${target.label}:IDENTICAL_DUPLICATES_DETECTED`);
      s = await repairDuplicates(s);
      summarize(s);
    } else {
      throw new Error(`${target.label}: DUPLICATE_ROWS_AMBIGUOUS. Valori differenti: nessun dato viene scelto automaticamente.`);
    }
  }

  // 2) Divergenza API/DB/inspection: prima cache refresh, che non modifica contenuti.
  if (!backendConsistent(s)) {
    console.warn(`RANK_MATH_DOCTOR=${target.label}:BACKEND_DIVERGENCE_DETECTED`);
    s = await refreshCaches(s);
    summarize(s);
    if (!backendConsistent(s)) throw new Error(`${target.label}: BACKEND_DIVERGENCE_PERSISTS dopo refresh cache; arresto fail-closed.`);
  }

  // 3) Marker reale nel backend: recovery stale-safe da journal -> LKG -> bootstrap legacy.
  if (isMarker(s.api)) {
    console.warn(`RANK_MATH_DOCTOR=${target.label}:ORPHAN_MARKER_DETECTED`);
    s = await recoverMarker(s);
    summarize(s);
    if (!s || isMarker(s.api) || !backendConsistent(s)) throw new Error(`${target.label}: ORPHAN_RECOVERY_NOT_VERIFIED.`);
  }

  // 4) Solo frontend/cache divergente: purge object+public cache e verifica canonical + cache-busted.
  if (s.publicCanonical !== s.api || s.publicBusted !== s.api || s.cache.some((value) => value !== s.api)) {
    console.warn(`RANK_MATH_DOCTOR=${target.label}:CACHE_OR_FRONTEND_DIVERGENCE_DETECTED`);
    s = await refreshCaches(s);
    summarize(s);
    if (!fullyConsistent(s)) throw new Error(`${target.label}: FRONTEND_OR_CACHE_DIVERGENCE_PERSISTS; nessuna write SEO viene tentata.`);
  }

  if (!fullyConsistent(s) || isMarker(s.api)) throw new Error(`${target.label}: FINAL_PROOF_FAILED.`);
  await recordLkg(s);
  console.log(`RANK_MATH_DOCTOR=${target.label}:HEALTHY`);
  return s;
}

validateInputs();
const capability = await wpGet("taxonomy-doctor-capability");
if (
  capability?.ok !== true ||
  capability?.capability !== "rankmath-doctor-20260906-v1" ||
  capability?.realSeoMarkerWritesAllowed !== false ||
  capability?.supportsLastKnownGood !== true ||
  capability?.supportsRecoveryJournal !== true ||
  capability?.supportsObjectCacheRefresh !== true ||
  capability?.supportsIdenticalDuplicateCollapse !== true
) {
  throw new Error("Rank Math Doctor capability non valida: aggiorna SeoGrow Connector. Nessuna remediation eseguita.");
}
console.log("RANK_MATH_DOCTOR=CAPABILITY_OK");
console.log("Rank Math Doctor non genera né scrive marker E2E nuovi sulle tassonomie reali.");

for (const target of targets) await doctorTarget(target);
console.log("RANK_MATH_DOCTOR=SUCCESS");
console.log("Diagnosi + remediation + prova finale completate. Stato sano registrato come Last-Known-Good per recovery futuri.");
