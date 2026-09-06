import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const appUrl = String(process.env.SEOGROW_E2E_APP_URL || "http://127.0.0.1:5176").replace(/\/+$/, "");
const siteUrl = String(process.env.SEOGROW_WP_SITE_URL || "").trim();
const username = String(process.env.SEOGROW_WP_USERNAME || "").trim();
const applicationPassword = String(process.env.SEOGROW_WP_APPLICATION_PASSWORD || "");
const categoryUrl = String(process.env.SEOGROW_WP_CATEGORY_URL || "").trim();
const tagUrl = String(process.env.SEOGROW_WP_TAG_URL || "").trim();
const confirmHost = String(process.env.SEOGROW_WP_E2E_CONFIRM_HOST || "").trim().toLowerCase();
const allowWrite = String(process.env.SEOGROW_WP_E2E_ALLOW_WRITE || "");

const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function isFrontendOnlyStaleMarkerLog(text = "") {
  const normalized = String(text);
  const marker = /Marker SeoGrow\s*·\s*\{[^\n]*"api":false[^\n]*"inspection":false[^\n]*"database":false[^\n]*"cache":false[^\n]*"frontend":true[^\n]*\}/i.test(normalized);
  const comparisons = /api=inspection:true\s*·\s*api=db:true\s*·\s*api=frontend:false\s*·\s*duplicateRows:false/i.test(normalized);
  return marker && comparisons;
}

function runNode(script, env = {}) {
  return spawnSync(process.execPath, [script], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
}

function emit(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
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

async function jsonResponse(response, label) {
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${label}: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}: ${data.error || data.message || data.code || "errore sconosciuto"}.`);
  return data;
}

async function inspectBackend(url) {
  const response = await fetch(`${appUrl}/api/wordpress/inspect-taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteUrl, url, username, applicationPassword }),
    signal: AbortSignal.timeout(30_000),
  });
  return jsonResponse(response, "SeoGrow inspect-taxonomy");
}

async function fetchFrontend(url, cacheBust = false) {
  const target = new URL(url);
  if (cacheBust) {
    target.searchParams.set("seogrow_cache_probe", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }
  const response = await fetch(target, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache",
      "user-agent": "SeoGrowAI/1.4-rankmath-general",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`Frontend ${target}: HTTP ${response.status}.`);
  return compact(metaDescriptionFromHtml(html));
}

async function probeFrontendOnlyStale() {
  const targets = [categoryUrl, tagUrl].filter(Boolean);
  let allCacheBustedMatch = true;
  for (const url of targets) {
    const inspection = await inspectBackend(url);
    const expected = compact(inspection?.seo?.rankMath?.meta_description);
    const canonical = await fetchFrontend(url, false);
    const busted = await fetchFrontend(url, true);
    const canonicalMatch = canonical === expected;
    const bustedMatch = busted === expected;
    console.log(`[rank-math-general] frontend probe ${url}`);
    console.log(`[rank-math-general] canonicalMatch=${canonicalMatch} · cacheBustedMatch=${bustedMatch}`);
    if (!bustedMatch) allCacheBustedMatch = false;
  }
  return allCacheBustedMatch;
}

function validateInputs() {
  const required = [
    ["SEOGROW_WP_SITE_URL", siteUrl],
    ["SEOGROW_WP_USERNAME", username],
    ["SEOGROW_WP_APPLICATION_PASSWORD", applicationPassword],
    ["SEOGROW_WP_E2E_CONFIRM_HOST", confirmHost],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Rank Math general non avviato: variabili mancanti: ${missing.join(", ")}.`);
  if (!categoryUrl && !tagUrl) throw new Error("Rank Math general non avviato: indica almeno una categoria o un tag reale.");
  if (allowWrite !== "YES_I_UNDERSTAND") throw new Error("Rank Math general non avviato: confirm_write deve essere YES_I_UNDERSTAND.");
  const site = new URL(siteUrl);
  if (site.protocol !== "https:") throw new Error("Rank Math general richiede HTTPS.");
  if (site.hostname.toLowerCase() !== confirmHost) throw new Error("confirm_host non coincide con site_url.");
}

async function main() {
  validateInputs();
  const taxonomyEnv = {
    SEOGROW_WP_CATEGORY_URL: categoryUrl,
    SEOGROW_WP_TAG_URL: tagUrl,
  };

  console.log("\n[rank-math-general] FASE 1/4 — baseline read-only");
  let baseline = runNode("scripts/wordpress-taxonomy-diagnostics-retry.mjs", taxonomyEnv);
  emit(baseline);

  if ((baseline.status ?? 1) !== 0) {
    const combined = `${baseline.stdout || ""}\n${baseline.stderr || ""}`;
    if (!isFrontendOnlyStaleMarkerLog(combined)) {
      console.error("RANK_MATH_GENERAL=BLOCKED_BASELINE_INCONSISTENCY");
      process.exitCode = baseline.status || 1;
      return;
    }

    console.warn("RANK_MATH_GENERAL=FRONTEND_ONLY_STALE_MARKER");
    console.warn("[rank-math-general] Backend, DB, object cache e SeoGrow inspection concordano; solo il frontend canonico è stale. Nessuna scrittura Rank Math viene eseguita.");
    console.log("\n[rank-math-general] FASE 2/4 — cache-busted frontend probe read-only");
    const cacheBustedMatch = await probeFrontendOnlyStale();
    if (!cacheBustedMatch) {
      console.error("RANK_MATH_GENERAL=FRONTEND_RENDER_DIVERGENCE");
      console.error("[rank-math-general] Anche la richiesta cache-busted non riflette il backend. Arresto fail-closed; nessuna scrittura eseguita.");
      process.exitCode = 1;
      return;
    }

    console.warn("RANK_MATH_GENERAL=CANONICAL_PAGE_CACHE_STALE_LIKELY");
    console.warn("[rank-math-general] La richiesta cache-busted riflette il backend: il problema è compatibile con cache della pagina canonica/CDN. Attendo e ricontrollo il canonical prima di qualunque write.");
    await sleep(5_000);
    baseline = runNode("scripts/wordpress-taxonomy-diagnostics-retry.mjs", taxonomyEnv);
    emit(baseline);
    if ((baseline.status ?? 1) !== 0) {
      console.error("RANK_MATH_GENERAL=WAITING_FOR_FRONTEND_CACHE_INVALIDATION");
      console.error("[rank-math-general] Il canonical è ancora stale. Test concluso senza scritture: non è sicuro avviare un nuovo ciclo E2E finché il frontend pubblico non è coerente.");
      process.exitCode = 2;
      return;
    }
  }

  console.log("RANK_MATH_GENERAL=BASELINE_CLEAN");
  console.log("\n[rank-math-general] FASE 2/4 — Rank Math persistence/cache capability preflight");
  const capability = runNode("scripts/wordpress-rankmath-cache-coherence-preflight.mjs");
  emit(capability);
  if ((capability.status ?? 1) !== 0) {
    console.error("RANK_MATH_GENERAL=BLOCKED_CAPABILITY_PREFLIGHT");
    process.exitCode = capability.status || 1;
    return;
  }

  console.log("\n[rank-math-general] FASE 3/4 — single controlled apply/verify/rollback cycle");
  const e2e = runNode("scripts/wordpress-taxonomy-e2e.mjs", {
    ...taxonomyEnv,
    SEOGROW_WP_E2E_ALLOW_WRITE: "YES_I_UNDERSTAND",
    SEOGROW_WP_EXPECT_ADAPTER: "rank-math",
  });
  emit(e2e);
  if ((e2e.status ?? 1) !== 0) {
    console.error("RANK_MATH_GENERAL=E2E_FAILED");
    process.exitCode = e2e.status || 1;
    return;
  }

  console.log("\n[rank-math-general] FASE 4/4 — final read-only proof");
  const finalDiagnostics = runNode("scripts/wordpress-taxonomy-diagnostics-retry.mjs", taxonomyEnv);
  emit(finalDiagnostics);
  if ((finalDiagnostics.status ?? 1) !== 0) {
    console.error("RANK_MATH_GENERAL=FINAL_STATE_INCONSISTENT");
    process.exitCode = finalDiagnostics.status || 1;
    return;
  }

  console.log("RANK_MATH_GENERAL=SUCCESS");
  console.log("Rank Math general E2E completato: baseline, capability, ciclo controllato e stato finale sono coerenti.");
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (invoked) await main();
