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
const targets = [categoryUrl ? { label: "categoria", url: categoryUrl } : null, tagUrl ? { label: "tag", url: tagUrl } : null].filter(Boolean);

const auth = () => `Basic ${Buffer.from(`${username}:${applicationPassword}`, "utf8").toString("base64")}`;
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isMarker = (value) => /^SeoGrow E2E (categoria|tag) \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(compact(value));
const fingerprint = (value) => {
  const normalized = compact(value);
  return `${crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12)}:${normalized.length}`;
};

function validateInputs() {
  for (const [name, value] of [["site_url", siteUrl], ["username", username], ["application password", applicationPassword], ["confirm_host", confirmHost]]) {
    if (!value) throw new Error(`Rank Math Doctor: ${name} mancante.`);
  }
  if (!targets.length) throw new Error("Rank Math Doctor richiede almeno una categoria o un tag.");
  const site = new URL(siteUrl);
  if (site.protocol !== "https:" || site.hostname.toLowerCase() !== confirmHost) throw new Error("site_url/confirm_host non validi.");
  for (const target of targets) {
    const parsed = new URL(target.url);
    if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== confirmHost) throw new Error(`${target.label}: URL non autorizzata.`);
  }
  if (targets.length > 1 && recoveryOriginal) throw new Error("recovery_original è consentito solo con un target legacy alla volta.");
}

function transient(error) {
  const code = String(error?.cause?.code || error?.code || "");
  return ["UND_ERR_CONNECT_TIMEOUT", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"].includes(code) || /\b(?:502|503|504)\b/.test(String(error?.message || ""));
}

async function retry(label, fn, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i += 1) {
    try { return await fn(); } catch (error) {
      last = error;
      if (!transient(error) || i === attempts) throw error;
      const wait = 500 * i;
      console.warn(`[doctor-network] ${label}: retry ${i + 1}/${attempts} tra ${wait}ms.`);
      await sleep(wait);
    }
  }
  throw last;
}

async function jsonResponse(response, label) {
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`${label}: risposta non JSON HTTP ${response.status}.`); }
  if (!response.ok) {
    const error = new Error(`${label}: HTTP ${response.status}: ${data.message || data.code || "errore sconosciuto"}.`);
    error.status = response.status;
    error.code = String(data?.code || "");
    throw error;
  }
  return data;
}

async function wpGet(path, params = {}) {
  return retry(`GET ${path}`, async () => {
    const endpoint = new URL(`/wp-json/seogrow/v1/${path}`, siteUrl);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
    const response = await fetch(endpoint, { headers: { authorization: auth(), accept: "application/json", "user-agent": "SeoGrowAI/1.4-rankmath-doctor-v2" }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    return jsonResponse(response, path);
  });
}

async function wpPost(path, body) {
  return retry(`POST ${path}`, async () => {
    const endpoint = new URL(`/wp-json/seogrow/v1/${path}`, siteUrl);
    const response = await fetch(endpoint, { method: "POST", headers: { authorization: auth(), accept: "application/json", "content-type": "application/json", "user-agent": "SeoGrowAI/1.4-rankmath-doctor-v2" }, body: JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(30_000) });
    return jsonResponse(response, path);
  });
}

async function inspectSeoGrow(url) {
  return retry("inspect-taxonomy", async () => {
    const response = await fetch(`${appUrl}/api/wordpress/inspect-taxonomy`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteUrl, url, username, applicationPassword }), signal: AbortSignal.timeout(30_000) });
    return jsonResponse(response, "inspect-taxonomy");
  });
}

function metaDescriptionFromHtml(html) {
  for (const tag of String(html || "").match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    if (String(attrs.name || "").toLowerCase() === "description") return compact(attrs.content || "");
  }
  return "";
}

async function frontend(url, bust = false) {
  return retry(`frontend-${bust ? "busted" : "canonical"}`, async () => {
    const target = new URL(url);
    if (bust) target.searchParams.set("seogrow_doctor_probe", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const response = await fetch(target, { headers: { accept: "text/html", "cache-control": "no-cache, no-store, max-age=0", pragma: "no-cache", "user-agent": "SeoGrowAI/1.4-rankmath-doctor-v2" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Frontend HTTP ${response.status}.`);
    return { value: metaDescriptionFromHtml(await response.text()), cache: response.headers.get("x-litespeed-cache") || response.headers.get("cf-cache-status") || response.headers.get("x-cache") };
  });
}

async function collect(target) {
  const inspection = await inspectSeoGrow(target.url);
  if (inspection?.ownership !== "rank-math-only") return { target, classification: "OWNERSHIP_NOT_RANK_MATH_ONLY", inspection };
  const termId = inspection?.term?.id;
  const taxonomy = inspection?.term?.taxonomy;
  if (!termId || !taxonomy) return { target, classification: "IDENTITY_UNRESOLVED", inspection };
  const [diagnostics, doctor, canonical, busted] = await Promise.all([
    wpGet("taxonomy-diagnostics", { url: target.url }),
    wpGet("taxonomy-doctor-state", { url: target.url, termId, taxonomy }),
    frontend(target.url, false),
    frontend(target.url, true),
  ]);
  const rank = diagnostics?.meta?.rank_math_description || {};
  return {
    target, inspection, diagnostics, doctor, termId, taxonomy,
    api: compact(rank.apiValue), inspectionValue: compact(inspection?.seo?.rankMath?.meta_description),
    rows: Array.isArray(rank.dbRows) ? rank.dbRows.map((row) => compact(row.value)) : [],
    cache: Array.isArray(rank.cache?.values) ? rank.cache.values.map(compact) : [],
    publicCanonical: compact(canonical.value), publicBusted: compact(busted.value), cacheHeader: canonical.cache || "n/a",
  };
}

function backendConsistent(s) { return s.rows.length === 1 && s.api === s.inspectionValue && s.api === s.rows[0]; }
function fullyConsistent(s) { return backendConsistent(s) && s.publicCanonical === s.api && s.publicBusted === s.api && s.cache.every((value) => value === s.api); }
function exactOriginal(s, original) { return fullyConsistent(s) && s.api === original && !isMarker(s.api); }
function exactMarkerBackend(s, marker) { return backendConsistent(s) && s.api === marker && s.rows[0] === marker && isMarker(marker); }
function allSame(values) { return values.length > 0 && values.every((value) => value === values[0]); }

function summarize(s, phase = "state") {
  if (s.classification) return console.log(`[${s.target.label}] ${phase}=${s.classification}`);
  console.log(`[${s.target.label}] ${phase} api=${fingerprint(s.api)} inspect=${fingerprint(s.inspectionValue)} rows=${s.rows.length} cache=${s.cache.length} canonical=${fingerprint(s.publicCanonical)} busted=${fingerprint(s.publicBusted)} marker=${isMarker(s.api)} journal=${s.doctor?.recoveryJournal?.available === true} LKG=${s.doctor?.lastKnownGood?.available === true}`);
}

async function refreshCaches(s) {
  if (confirmWrite !== "YES_I_UNDERSTAND") throw new Error("Cache remediation richiede YES_I_UNDERSTAND.");
  await wpPost("taxonomy-doctor-refresh-cache", { url: s.target.url, termId: s.termId, taxonomy: s.taxonomy });
}

async function recordLkg(s) {
  const result = await wpPost("taxonomy-doctor-observe", { url: s.target.url, termId: s.termId, taxonomy: s.taxonomy, adapter: "rank-math", field: "meta_description", expectedCurrent: s.api });
  if (result?.recorded !== true || result?.contentWritesPerformed !== 0) throw new Error("LKG non attestato.");
}

async function convergenceSamples(target, expectedOriginal, label) {
  const delays = [500, 1500, 4000];
  let consecutive = 0;
  let last = null;
  for (let i = 0; i < delays.length; i += 1) {
    await sleep(delays[i]);
    last = await collect(target);
    summarize(last, `${label}-sample-${i + 1}`);
    if (exactOriginal(last, expectedOriginal)) consecutive += 1; else consecutive = 0;
    if (consecutive >= 2) return { ok: true, state: last };
  }
  return { ok: false, state: last };
}

async function finalizeRecovery(s, original) {
  const result = await wpPost("taxonomy-doctor-finalize-recovery", { url: s.target.url, termId: s.termId, taxonomy: s.taxonomy, expectedOriginal: original, confirm: "YES_I_UNDERSTAND" });
  if (result?.finalized !== true || result?.journalCleared !== true) throw new Error("Recovery non finalizzato.");
}

async function recoverWithConvergence(s) {
  const marker = s.api;
  let original = "";
  if (s.doctor?.recoveryJournal?.available === true && compact(s.doctor.recoveryJournal.marker) === marker) original = compact(s.doctor.recoveryJournal.original);
  else if (s.doctor?.lastKnownGood?.available === true && !isMarker(s.doctor.lastKnownGood.value)) original = compact(s.doctor.lastKnownGood.value);
  else if (recoveryOriginal && targets.length === 1 && !isMarker(recoveryOriginal)) original = compact(recoveryOriginal);
  if (!original) throw new Error("RECOVERY_SOURCE_REQUIRED: nessun journal/LKG/bootstrap affidabile.");

  for (let pass = 1; pass <= 2; pass += 1) {
    const current = pass === 1 ? s : await collect(s.target);
    summarize(current, `recovery-pass-${pass}-pre`);
    if (!exactMarkerBackend(current, marker)) {
      if (exactOriginal(current, original)) return current;
      throw new Error("RECOVERY_OWNERSHIP_LOST: il backend non coincide più né col marker posseduto né con l'originale atteso.");
    }
    const result = await wpPost("taxonomy-doctor-recover-v2", { url: current.target.url, termId: current.termId, taxonomy: current.taxonomy, expectedMarker: marker, bootstrapOriginal: original, confirm: "YES_I_UNDERSTAND" });
    if (result?.recovered !== true || result?.journalRetained !== true || compact(result.expectedOriginal) !== original) throw new Error("RECOVERY_APPLY_NOT_ATTESTED.");
    const proof = await convergenceSamples(current.target, original, `recovery-pass-${pass}`);
    if (proof.ok) {
      await finalizeRecovery(proof.state, original);
      const final = await collect(current.target);
      summarize(final, "recovery-final");
      if (!exactOriginal(final, original)) throw new Error("RECOVERY_FINALIZATION_RACE: stato cambiato dopo la finalizzazione.");
      console.log(`RANK_MATH_DOCTOR=${current.target.label}:RECOVERY_CONVERGED`);
      return final;
    }
    if (pass === 1 && exactMarkerBackend(proof.state, marker)) {
      console.warn(`RANK_MATH_DOCTOR=${current.target.label}:RECOVERY_REVERTED_ONCE_RETRYING`);
      continue;
    }
    if (exactMarkerBackend(proof.state, marker)) throw new Error("RECOVERY_REVERT_LOOP_DETECTED: il marker ritorna dopo due recovery; journal conservato, nessuna ulteriore write automatica.");
    throw new Error("RECOVERY_DIVERGENCE_PERSISTS: journal conservato; stato non deterministico dopo recovery.");
  }
  throw new Error("RECOVERY_UNREACHABLE");
}

async function doctorTarget(target) {
  let s = await collect(target);
  summarize(s, "initial");
  if (s.classification) throw new Error(`${target.label}: ${s.classification}.`);

  if (s.rows.length > 1) {
    if (!allSame(s.rows) || s.api !== s.rows[0]) throw new Error(`${target.label}: DUPLICATE_ROWS_AMBIGUOUS.`);
    await wpPost("taxonomy-doctor-dedupe", { url: target.url, termId: s.termId, taxonomy: s.taxonomy, expectedValue: s.api, confirm: "YES_I_UNDERSTAND" });
    s = await collect(target);
    summarize(s, "after-dedupe");
  }

  if (!backendConsistent(s) && !isMarker(s.api)) {
    await refreshCaches(s);
    const proof = await convergenceSamples(target, s.api, "backend-refresh");
    s = proof.state;
    if (!backendConsistent(s)) throw new Error(`${target.label}: BACKEND_DIVERGENCE_PERSISTS.`);
  }

  if (isMarker(s.api)) s = await recoverWithConvergence(s);

  if (!fullyConsistent(s)) {
    await refreshCaches(s);
    const proof = await convergenceSamples(target, s.api, "cache-refresh");
    s = proof.state;
    if (!proof.ok) throw new Error(`${target.label}: FRONTEND_OR_CACHE_DIVERGENCE_PERSISTS.`);
  }

  if (!fullyConsistent(s) || isMarker(s.api) || !s.api) throw new Error(`${target.label}: FINAL_PROOF_FAILED.`);
  await recordLkg(s);
  console.log(`RANK_MATH_DOCTOR=${target.label}:HEALTHY`);
}

validateInputs();
const [baseCap, convergenceCap] = await Promise.all([wpGet("taxonomy-doctor-capability"), wpGet("taxonomy-doctor-convergence-capability")]);
if (baseCap?.capability !== "rankmath-doctor-20260906-v1" || baseCap?.realSeoMarkerWritesAllowed !== false) throw new Error("Rank Math Doctor base capability non valida.");
if (convergenceCap?.capability !== "rankmath-doctor-convergence-20260906-v2" || convergenceCap?.journalRetainedUntilCrossRequestProof !== true || convergenceCap?.supportsTwoPhaseRecovery !== true) throw new Error("Rank Math Doctor convergence capability non valida: aggiorna il Connector.");
console.log("RANK_MATH_DOCTOR=CONVERGENCE_V2_CAPABILITY_OK");
console.log("Rank Math Doctor v2: diagnose -> remediate -> converge -> verify. Nessun marker E2E nuovo viene scritto.");
for (const target of targets) await doctorTarget(target);
console.log("RANK_MATH_DOCTOR=SUCCESS");
