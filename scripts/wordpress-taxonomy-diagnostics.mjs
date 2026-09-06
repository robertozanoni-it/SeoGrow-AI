const appUrl = String(process.env.SEOGROW_E2E_APP_URL || "http://127.0.0.1:5176").replace(/\/+$/, "");
const siteUrl = String(process.env.SEOGROW_WP_SITE_URL || "").trim();
const username = String(process.env.SEOGROW_WP_USERNAME || "").trim();
const applicationPassword = String(process.env.SEOGROW_WP_APPLICATION_PASSWORD || "");
const categoryUrl = String(process.env.SEOGROW_WP_CATEGORY_URL || "").trim();
const tagUrl = String(process.env.SEOGROW_WP_TAG_URL || "").trim();
const confirmHost = String(process.env.SEOGROW_WP_E2E_CONFIRM_HOST || "").trim().toLowerCase();

const required = [
  ["SEOGROW_WP_SITE_URL", siteUrl],
  ["SEOGROW_WP_USERNAME", username],
  ["SEOGROW_WP_APPLICATION_PASSWORD", applicationPassword],
  ["SEOGROW_WP_E2E_CONFIRM_HOST", confirmHost],
];
const missing = required.filter(([, value]) => !value).map(([name]) => name);
if (missing.length) throw new Error(`Diagnostica WordPress non avviata: variabili mancanti: ${missing.join(", ")}.`);
if (!categoryUrl && !tagUrl) throw new Error("Diagnostica WordPress non avviata: indica almeno una categoria o un tag reale.");

const site = new URL(siteUrl);
if (site.protocol !== "https:") throw new Error("Il sito WordPress deve usare HTTPS.");
if (site.hostname.toLowerCase() !== confirmHost) throw new Error("confirm_host non coincide con il sito WordPress.");

const targets = [
  categoryUrl ? { label: "categoria", url: categoryUrl } : null,
  tagUrl ? { label: "tag", url: tagUrl } : null,
].filter(Boolean);

const auth = `Basic ${Buffer.from(`${username}:${applicationPassword}`, "utf8").toString("base64")}`;
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const shown = (value) => JSON.stringify(compact(value).slice(0, 280));
const markerPresent = (value) => /SeoGrow E2E/i.test(compact(value));

async function jsonResponse(response, label) {
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${label}: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}: ${data.message || data.error || data.code || text.slice(0, 240)}`);
  return data;
}

async function inspectViaSeoGrow(url) {
  const response = await fetch(`${appUrl}/api/wordpress/inspect-taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteUrl, url, username, applicationPassword }),
    signal: AbortSignal.timeout(30_000),
  });
  return jsonResponse(response, "SeoGrow inspect-taxonomy");
}

async function connectorDiagnostics(url) {
  const endpoint = new URL("/wp-json/seogrow/v1/taxonomy-diagnostics", site.origin);
  endpoint.searchParams.set("url", url);
  const response = await fetch(endpoint, {
    headers: { authorization: auth, accept: "application/json", "user-agent": "SeoGrowAI/1.4-taxonomy-diagnostics" },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) throw new Error("Connector diagnostics: redirect inatteso.");
  return jsonResponse(response, "Connector taxonomy-diagnostics");
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

async function frontendDescription(url) {
  const response = await fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": "SeoGrowAI/1.4-taxonomy-diagnostics" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`Frontend ${url}: HTTP ${response.status}.`);
  return { finalUrl: response.url, metaDescription: metaDescriptionFromHtml(html) };
}

let inconsistent = false;
for (const target of targets) {
  const parsed = new URL(target.url);
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== site.hostname.toLowerCase()) {
    throw new Error(`${target.label}: URL deve essere HTTPS e appartenere a ${site.hostname}.`);
  }

  console.log(`\n[${target.label}] Diagnostica READ-ONLY ${target.url}`);
  const [inspection, diagnostics, frontend] = await Promise.all([
    inspectViaSeoGrow(target.url),
    connectorDiagnostics(target.url),
    frontendDescription(target.url),
  ]);

  if (diagnostics.readOnly !== true || diagnostics.writesPerformed !== 0 || diagnostics.resource !== "taxonomy-diagnostics") {
    throw new Error(`${target.label}: il Connector non ha attestato una diagnostica strettamente read-only.`);
  }

  const rank = diagnostics.meta?.rank_math_description || {};
  const apiValue = compact(rank.apiValue);
  const inspectionValue = compact(inspection.seo?.rankMath?.meta_description);
  const dbRows = Array.isArray(rank.dbRows) ? rank.dbRows : [];
  const dbValues = dbRows.map((row) => compact(row.value));
  const dbLast = dbValues.length ? dbValues[dbValues.length - 1] : "";
  const cacheValues = Array.isArray(rank.cache?.values) ? rank.cache.values.map(compact) : [];
  const publicValue = compact(frontend.metaDescription);

  console.log(`[${target.label}] Term #${diagnostics.term?.id} · Rank Math ${diagnostics.plugins?.rankMathVersion || "versione non esposta"}`);
  console.log(`[${target.label}] get_term_meta = ${shown(apiValue)}`);
  console.log(`[${target.label}] SeoGrow inspection = ${shown(inspectionValue)}`);
  console.log(`[${target.label}] DB termmeta rows (${dbRows.length}) = ${JSON.stringify(dbValues)}`);
  console.log(`[${target.label}] Object cache found=${rank.cache?.found === true} values=${JSON.stringify(cacheValues)}`);
  console.log(`[${target.label}] Frontend meta description = ${shown(publicValue)}`);

  const apiVsInspection = apiValue === inspectionValue;
  const apiVsDb = dbRows.length <= 1 ? apiValue === dbLast : false;
  const apiVsPublic = apiValue === publicValue;
  const duplicates = rank.duplicateRows === true;
  const markerLayers = {
    api: markerPresent(apiValue),
    inspection: markerPresent(inspectionValue),
    database: dbValues.some(markerPresent),
    cache: cacheValues.some(markerPresent),
    frontend: markerPresent(publicValue),
  };

  console.log(`[${target.label}] Confronti · api=inspection:${apiVsInspection} · api=db:${apiVsDb} · api=frontend:${apiVsPublic} · duplicateRows:${duplicates}`);
  console.log(`[${target.label}] Marker SeoGrow · ${JSON.stringify(markerLayers)}`);

  const problems = [];
  if (!apiVsInspection) problems.push("get_term_meta e ispezione SeoGrow divergono");
  if (duplicates) problems.push("esistono righe duplicate rank_math_description nel database");
  if (!apiVsDb) problems.push("get_term_meta e database divergono");
  if (!apiVsPublic) problems.push("backend e frontend divergono");
  if (Object.values(markerLayers).some(Boolean)) problems.push("marker SeoGrow ancora presente in almeno un livello");

  if (problems.length) {
    inconsistent = true;
    console.error(`[${target.label}] DIAGNOSTICA NON COERENTE: ${problems.join("; ")}.`);
  } else {
    console.log(`[${target.label}] DIAGNOSTICA COERENTE: database, API, SeoGrow e frontend concordano; nessun marker E2E rilevato.`);
  }
}

if (inconsistent) {
  throw new Error("Diagnostica read-only completata con incoerenze: nessuna scrittura è stata eseguita. Usa i dettagli sopra per individuare il livello divergente.");
}

console.log("\nDiagnostica tassonomie completata in sola lettura: nessuna scrittura eseguita.");
