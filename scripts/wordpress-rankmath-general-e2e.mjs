import { pinnedHttpsFetch } from "../server/pinnedHttpsFetch.js";
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
const recoveryOriginal = String(process.env.SEOGROW_WP_RECOVERY_ORIGINAL || "").trim();

const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const auth = () => `Basic ${Buffer.from(`${username}:${applicationPassword}`, "utf8").toString("base64")}`;
const targets = [
  categoryUrl ? { label: "categoria", url: categoryUrl } : null,
  tagUrl ? { label: "tag", url: tagUrl } : null,
].filter(Boolean);

export function isFrontendOnlyStaleMarkerLog(text = "") {
  const normalized = String(text);
  const marker = /Marker SeoGrow\s*·\s*\{[^\n]*"api":false[^\n]*"inspection":false[^\n]*"database":false[^\n]*"cache":false[^\n]*"frontend":true[^\n]*\}/i.test(normalized);
  const comparisons = /api=inspection:true\s*·\s*api=db:true\s*·\s*api=frontend:false\s*·\s*duplicateRows:false/i.test(normalized);
  return marker && comparisons;
}

export function isSeoGrowE2EMarker(value = "") {
  return /^SeoGrow E2E (categoria|tag) \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(compact(value));
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
  if (!response.ok) {
    const error = new Error(`${label}: HTTP ${response.status}: ${data.error || data.message || data.code || "errore sconosciuto"}.`);
    error.status = response.status;
    error.code = String(data?.code || "");
    error.data = data;
    throw error;
  }
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

async function wordpressPost(path, body) {
  const endpoint = new URL(`/wp-json/seogrow/v1/${String(path).replace(/^\/+/, "")}`, siteUrl);
  const response = await pinnedHttpsFetch(endpoint, {
    method: "POST",
    headers: {
      authorization: auth(),
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "SeoGrowAI/1.4-rankmath-recovery",
    },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    throw new Error(`${path}: redirect inatteso.`);
  }
  return jsonResponse(response, path);
}

async function purgePublicCache(url) {
  const data = await wordpressPost("taxonomy-public-cache-purge", { url });
  if (
    data?.ok !== true ||
    data?.resource !== "taxonomy-public-cache-purge" ||
    data?.contentWritesPerformed !== 0 ||
    data?.cacheMutationPerformed !== true ||
    data?.purgeRequested !== true ||
    data?.hook !== "litespeed_purge_url"
  ) {
    throw new Error("taxonomy-public-cache-purge: il Connector non ha attestato un purge URL cache-only valido.");
  }
  return data;
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

async function probeFrontend() {
  let allCanonicalMatch = true;
  let allCacheBustedMatch = true;
  for (const target of targets) {
    const inspection = await inspectBackend(target.url);
    const expected = compact(inspection?.seo?.rankMath?.meta_description);
    const canonical = await fetchFrontend(target.url, false);
    const busted = await fetchFrontend(target.url, true);
    const canonicalMatch = canonical === expected;
    const bustedMatch = busted === expected;
    console.log(`[rank-math-general] frontend probe ${target.url}`);
    console.log(`[rank-math-general] canonicalMatch=${canonicalMatch} · cacheBustedMatch=${bustedMatch}`);
    if (!canonicalMatch) allCanonicalMatch = false;
    if (!bustedMatch) allCacheBustedMatch = false;
  }
  return { allCanonicalMatch, allCacheBustedMatch };
}

async function recoverStableOrphanMarkers() {
  if (!targets.length) return false;
  if (targets.length > 1 && recoveryOriginal) {
    throw new Error("Recovery bootstrap con valore originale esplicito consentito solo su una tassonomia alla volta.");
  }

  const candidates = [];
  for (const target of targets) {
    const inspection = await inspectBackend(target.url);
    const marker = compact(inspection?.seo?.rankMath?.meta_description);
    const frontend = await fetchFrontend(target.url, false);
    if (
      inspection?.ownership !== "rank-math-only" ||
      inspection?.term?.id == null ||
      !isSeoGrowE2EMarker(marker) ||
      frontend !== marker
    ) {
      return false;
    }
    candidates.push({ target, inspection, marker });
  }

  console.warn("RANK_MATH_GENERAL=STABLE_ORPHAN_MARKER_DETECTED");
  console.warn("[rank-math-general] Il marker SeoGrow è persistito e coerente tra backend e frontend: attivo recovery stale-safe, non un nuovo E2E.");

  for (const { target, inspection, marker } of candidates) {
    const result = await wordpressPost("taxonomy-recovery-execute", {
      url: target.url,
      termId: inspection.term.id,
      taxonomy: inspection.term.taxonomy,
      expectedMarker: marker,
      confirm: "YES_I_UNDERSTAND",
      bootstrapOriginal: targets.length === 1 ? recoveryOriginal : "",
    });
    if (
      result?.ok !== true ||
      result?.resource !== "taxonomy-recovery-journal" ||
      result?.recovered !== true ||
      result?.staleChecked !== true ||
      result?.singleField !== true ||
      result?.adapter !== "rank-math" ||
      result?.field !== "meta_description" ||
      result?.contentWritesPerformed !== 1 ||
      result?.journalCleared !== true
    ) {
      throw new Error(`${target.label}: il Connector non ha attestato un recovery completo e stale-safe.`);
    }
    console.log(`[${target.label}] Marker orfano ripristinato tramite recovery journal; cache purge richiesto=${Boolean(result.cachePurgeRequested)}.`);
  }

  await sleep(2_000);
  return true;
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

    if (isFrontendOnlyStaleMarkerLog(combined)) {
      console.warn("RANK_MATH_GENERAL=FRONTEND_ONLY_STALE_MARKER");
      console.warn("[rank-math-general] Backend, DB, object cache e SeoGrow inspection concordano; solo il frontend è stale.");
      console.log("\n[rank-math-general] FASE 2/4 — purge mirato cache pubblica + verifica");

      for (const target of targets) {
        const purge = await purgePublicCache(target.url);
        console.log(`[rank-math-general] cache purge richiesto via ${purge.hook} per ${purge.url}`);
      }

      await sleep(2_000);
      const probe = await probeFrontend();
      if (!probe.allCanonicalMatch || !probe.allCacheBustedMatch) {
        console.error("RANK_MATH_GENERAL=PUBLIC_CACHE_PURGE_INEFFECTIVE");
        console.error("[rank-math-general] Il purge mirato non ha riallineato canonical e richiesta cache-busted al backend. Arresto fail-closed; nessuna scrittura Rank Math eseguita.");
        process.exitCode = 1;
        return;
      }

      baseline = runNode("scripts/wordpress-taxonomy-diagnostics-retry.mjs", taxonomyEnv);
      emit(baseline);
      if ((baseline.status ?? 1) !== 0) {
        console.error("RANK_MATH_GENERAL=POST_PURGE_BASELINE_INCONSISTENT");
        process.exitCode = 1;
        return;
      }

      console.log("RANK_MATH_GENERAL=PUBLIC_CACHE_RECOVERED");
      console.log("RANK_MATH_GENERAL=RECOVERY_COMPLETE");
      console.log("Recovery cache completato e riverificato. Nessun nuovo marker E2E viene scritto in questo run.");
      return;
    }

    try {
      const recovered = await recoverStableOrphanMarkers();
      if (recovered) {
        const proof = runNode("scripts/wordpress-taxonomy-diagnostics-retry.mjs", taxonomyEnv);
        emit(proof);
        if ((proof.status ?? 1) !== 0) {
          console.error("RANK_MATH_GENERAL=POST_RECOVERY_STATE_INCONSISTENT");
          process.exitCode = proof.status || 1;
          return;
        }
        console.log("RANK_MATH_GENERAL=ORPHAN_MARKER_RECOVERED");
        console.log("RANK_MATH_GENERAL=RECOVERY_COMPLETE");
        console.log("Marker SeoGrow orfano ripristinato e stato finale verificato read-only. Nessun nuovo E2E viene eseguito in questo run.");
        return;
      }
    } catch (error) {
      if (error?.code === "seogrow_recovery_journal_missing" && !recoveryOriginal) {
        console.error("RANK_MATH_GENERAL=RECOVERY_ORIGINAL_REQUIRED");
        console.error("[rank-math-general] Questo marker è precedente al recovery journal. Compila una sola volta recovery_original con il valore originale noto; nessuna scrittura è stata eseguita.");
      } else {
        console.error(`RANK_MATH_GENERAL=RECOVERY_FAILED · ${error.message}`);
      }
      process.exitCode = 1;
      return;
    }

    console.error("RANK_MATH_GENERAL=BLOCKED_BASELINE_INCONSISTENCY");
    process.exitCode = baseline.status || 1;
    return;
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
  console.log("Rank Math general E2E completato: baseline/cache, capability, ciclo controllato e stato finale sono coerenti.");
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (invoked) await main();
