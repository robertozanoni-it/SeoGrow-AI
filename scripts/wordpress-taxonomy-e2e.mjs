const appUrl = String(process.env.SEOGROW_E2E_APP_URL || "http://127.0.0.1:5176").replace(/\/+$/, "");
const siteUrl = String(process.env.SEOGROW_WP_SITE_URL || "").trim();
const username = String(process.env.SEOGROW_WP_USERNAME || "").trim();
const applicationPassword = String(process.env.SEOGROW_WP_APPLICATION_PASSWORD || "");
const categoryUrl = String(process.env.SEOGROW_WP_CATEGORY_URL || "").trim();
const tagUrl = String(process.env.SEOGROW_WP_TAG_URL || "").trim();
const confirmHost = String(process.env.SEOGROW_WP_E2E_CONFIRM_HOST || "").trim().toLowerCase();
const allowWrite = String(process.env.SEOGROW_WP_E2E_ALLOW_WRITE || "");
const expectedAdapter = String(process.env.SEOGROW_WP_EXPECT_ADAPTER || "").trim().toLowerCase();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const comparable = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const sameValue = (left, right) => comparable(left) === comparable(right);
const diagnosticValue = (value) => {
  const normalized = comparable(value);
  return JSON.stringify(normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized);
};
const UNCERTAIN_WRITE_CODES = new Set([
  "seogrow_taxonomy_persistence_proof_invalid",
  "seogrow_taxonomy_db_ambiguous",
  "seogrow_taxonomy_persistence_divergence",
  "RANK_MATH_PERSISTENCE_PROOF_REQUIRED",
  "TAXONOMY_WRITE_CONTRACT_INVALID",
  "TAXONOMY_WRITE_RESPONSE_MISMATCH",
]);
const isUncertainWriteError = (error) => UNCERTAIN_WRITE_CODES.has(String(error?.data?.code || error?.code || ""));

const required = [
  ["SEOGROW_WP_SITE_URL", siteUrl],
  ["SEOGROW_WP_USERNAME", username],
  ["SEOGROW_WP_APPLICATION_PASSWORD", applicationPassword],
  ["SEOGROW_WP_E2E_CONFIRM_HOST", confirmHost],
];
const missing = required.filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  throw new Error(`E2E WordPress non avviato: variabili mancanti: ${missing.join(", ")}.`);
}
if (!categoryUrl && !tagUrl) {
  throw new Error("E2E WordPress non avviato: indica almeno SEOGROW_WP_CATEGORY_URL oppure SEOGROW_WP_TAG_URL.");
}
if (allowWrite !== "YES_I_UNDERSTAND") {
  throw new Error("E2E WordPress non avviato: imposta SEOGROW_WP_E2E_ALLOW_WRITE=YES_I_UNDERSTAND solo su un sito di prova autorizzato.");
}
if (expectedAdapter && !["rank-math", "yoast"].includes(expectedAdapter)) {
  throw new Error("SEOGROW_WP_EXPECT_ADAPTER deve essere rank-math oppure yoast.");
}

const site = new URL(siteUrl);
if (site.protocol !== "https:") throw new Error("Il sito WordPress E2E deve usare HTTPS.");
if (site.hostname.toLowerCase() !== confirmHost) {
  throw new Error(`Conferma host non valida: atteso ${site.hostname.toLowerCase()}, ricevuto ${confirmHost || "vuoto"}.`);
}

const targets = [
  categoryUrl ? { label: "categoria", expectedTaxonomy: "category", url: categoryUrl } : null,
  tagUrl ? { label: "tag", expectedTaxonomy: "post_tag", url: tagUrl } : null,
].filter(Boolean);
for (const target of targets) {
  const parsed = new URL(target.url);
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== site.hostname.toLowerCase()) {
    throw new Error(`${target.label}: URL E2E deve essere HTTPS e appartenere a ${site.hostname}.`);
  }
}

async function request(path, body, { expectedStatus = 200 } = {}) {
  const response = await fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${path}: risposta SeoGrow non JSON (HTTP ${response.status}).`); }
  if (response.status !== expectedStatus) {
    const error = new Error(`${path}: HTTP ${response.status}, atteso ${expectedStatus}: ${data.error || data.code || text.slice(0, 300)}`);
    error.status = response.status;
    error.data = data;
    error.code = String(data?.code || "");
    throw error;
  }
  return data;
}

async function wordpressReadOnly(path) {
  const endpoint = new URL(site.href);
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/wp-json/seogrow/v1/${String(path).replace(/^\/+/, "")}`;
  endpoint.search = "";
  endpoint.hash = "";
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      authorization: `Basic ${Buffer.from(`${username}:${applicationPassword}`, "utf8").toString("base64")}`,
      accept: "application/json",
      "user-agent": "SeoGrow-E2E/read-only-preflight",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`WordPress ${path}: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok) {
    throw new Error(`WordPress ${path}: HTTP ${response.status}: ${data.message || data.code || "errore sconosciuto"}.`);
  }
  return data;
}

async function requireRankMathPersistenceCapability() {
  const capability = await wordpressReadOnly("taxonomy-persistence-capability");
  if (
    capability?.ok !== true ||
    capability?.readOnly !== true ||
    capability?.resource !== "taxonomy-persistence-capability" ||
    capability?.rankMathPersistenceProof !== true ||
    capability?.writesPerformed !== 0
  ) {
    throw new Error("Preflight Rank Math non valido: il Connector non dimostra la capability read-only di persistence proof. Nessuna scrittura eseguita.");
  }
  console.log("Preflight Rank Math persistence proof: disponibile e read-only.");
}

function assertPersistenceProof(result, adapter, label) {
  if (adapter !== "rank-math") return;
  const proof = result?.persistenceProof;
  if (
    proof?.verified !== true ||
    proof?.dbRowCount !== 1 ||
    proof?.apiMatches !== true ||
    proof?.dbMatches !== true ||
    proof?.source !== "wp_termmeta+get_term_meta"
  ) {
    const error = new Error(`${label}: persistence proof Rank Math assente o incompleto dopo la scrittura.`);
    error.code = "RANK_MATH_PERSISTENCE_PROOF_REQUIRED";
    error.data = { code: error.code };
    throw error;
  }
}

async function health() {
  const response = await fetch(`${appUrl}/api/health`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`SeoGrow non è raggiungibile su ${appUrl} (HTTP ${response.status}).`);
  const data = await response.json();
  if (data?.ok !== true) throw new Error(`SeoGrow non è healthy su ${appUrl}.`);
}

const credentials = { siteUrl, username, applicationPassword };

async function verifyOnce(targetUrl, adapter, expected) {
  return request("/api/wordpress/taxonomy-verify", {
    ...credentials,
    url: targetUrl,
    adapter,
    field: "meta_description",
    expected,
  });
}

async function verifyEventually(targetUrl, adapter, expected, timeoutMs = 45_000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await verifyOnce(targetUrl, adapter, expected);
    if (last.storedMatch === false) {
      throw new Error(
        `Valore backend mutato durante la riverifica: atteso ${diagnosticValue(expected)}, rilevato ${diagnosticValue(last.current)}. ` +
        "Interruzione immediata: nessun rollback automatico finché l'ownership del valore corrente non è dimostrata.",
      );
    }
    if (last.storedMatch === true && last.publicMatch === true && last.verified === true) return last;
    await sleep(2_500);
  }
  throw new Error(`Riverifica pubblica non confermata entro ${timeoutMs} ms: ${last?.reason || "nessun dettaglio"}.`);
}

async function expectRejectedPreview(targetUrl, original, marker) {
  const response = await fetch(`${appUrl}/api/wordpress/taxonomy-preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...credentials,
      url: targetUrl,
      field: "meta_description",
      value: original,
      mode: "rollback",
      expectedCurrent: `${marker}-STALE`,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json();
  if (response.status !== 409 || data.code !== "STALE_ROLLBACK") {
    throw new Error(`Stale-state non bloccato come atteso: HTTP ${response.status}, code ${data.code || "assente"}.`);
  }
}

async function assertTokenConsumed(token) {
  const response = await fetch(`${appUrl}/api/wordpress/taxonomy-apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ approvalToken: token, username, applicationPassword }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json();
  if (response.status !== 409 || data.code !== "APPROVAL_EXPIRED") {
    throw new Error(`Token tassonomia riutilizzabile: HTTP ${response.status}, code ${data.code || "assente"}.`);
  }
}

async function rollback(target, adapter, original, marker) {
  const preview = await request("/api/wordpress/taxonomy-preview", {
    ...credentials,
    url: target.url,
    field: "meta_description",
    value: original,
    mode: "rollback",
    expectedCurrent: marker,
  });
  if (preview.mode !== "rollback" || !preview.approvalToken) throw new Error(`${target.label}: anteprima rollback non valida.`);

  let applied;
  try {
    applied = await request("/api/wordpress/taxonomy-apply", {
      approvalToken: preview.approvalToken,
      username,
      applicationPassword,
    });
  } catch (error) {
    if (!isUncertainWriteError(error)) throw error;
    console.warn(`[${target.label}] Rollback con esito incerto (${error.code || error.data?.code}); riverifico prima di qualsiasi altra azione.`);
    const state = await verifyOnce(target.url, adapter, original);
    if (!sameValue(state.current, original)) throw error;
    console.warn(`[${target.label}] Il rollback incerto ha comunque ripristinato il valore originale nel backend.`);
    await verifyEventually(target.url, adapter, original);
    return;
  }

  assertPersistenceProof(applied, adapter, `${target.label}: rollback`);
  if (applied.mode !== "rollback" || applied.staleChecked !== true || applied.singleField !== true) {
    throw new Error(`${target.label}: rollback non confermato come stale-safe single-field.`);
  }
  await verifyEventually(target.url, adapter, original);
}

async function safeRecovery(target, adapter, original, marker) {
  console.warn(`[${target.label}] Recovery fail-closed: riverifico il valore backend prima di qualsiasi rollback…`);
  let state;
  try {
    state = await verifyOnce(target.url, adapter, marker);
  } catch (error) {
    console.error(`[${target.label}] INTERVENTO MANUALE RICHIESTO: impossibile rileggere lo stato corrente (${error.message}). Nessun rollback automatico eseguito.`);
    console.error(`[${target.label}] Valore originale registrato: ${diagnosticValue(original)}`);
    return { recovered: false, manual: true };
  }

  const current = state.current;
  console.warn(`[${target.label}] Stato recovery · originale=${diagnosticValue(original)} · marker=${diagnosticValue(marker)} · corrente=${diagnosticValue(current)}`);

  if (sameValue(current, original)) {
    console.warn(`[${target.label}] Il valore originale è già presente. Nessun rollback necessario.`);
    return { recovered: true, manual: false };
  }
  if (!sameValue(current, marker)) {
    console.error(`[${target.label}] INTERVENTO MANUALE RICHIESTO: il valore corrente non è né l'originale né il marker SeoGrow. Nessun rollback automatico eseguito per non sovrascrivere una modifica concorrente.`);
    return { recovered: false, manual: true };
  }

  await rollback(target, adapter, original, marker);
  console.warn(`[${target.label}] Ripristino di sicurezza completato dopo conferma che il marker SeoGrow era ancora il valore corrente.`);
  return { recovered: true, manual: false };
}

async function runTarget(target) {
  console.log(`\n[${target.label}] Ispezione ${target.url}`);
  const inspection = await request("/api/wordpress/inspect-taxonomy", {
    ...credentials,
    url: target.url,
  });
  if (inspection.resource !== "taxonomy" || inspection.term?.taxonomy !== target.expectedTaxonomy) {
    throw new Error(`${target.label}: identità tassonomia inattesa (${inspection.term?.taxonomy || "assente"}).`);
  }
  if (inspection.writable !== true || !["rank-math-only", "yoast-only"].includes(inspection.ownership)) {
    throw new Error(`${target.label}: ownership non univoca (${inspection.ownership || "assente"}).`);
  }
  const adapter = inspection.ownership === "rank-math-only" ? "rank-math" : "yoast";
  if (expectedAdapter && adapter !== expectedAdapter) {
    throw new Error(`${target.label}: adapter ${adapter}, ma il test richiede ${expectedAdapter}.`);
  }
  if (adapter === "rank-math") await requireRankMathPersistenceCapability();

  const marker = `SeoGrow E2E ${target.label} ${new Date().toISOString()}`;
  let original;
  let applied = false;
  try {
    const preview = await request("/api/wordpress/taxonomy-preview", {
      ...credentials,
      url: target.url,
      field: "meta_description",
      value: marker,
      mode: "apply",
    });
    if (!preview.approvalToken || preview.field !== "meta_description" || preview.adapter !== adapter) {
      throw new Error(`${target.label}: anteprima apply non coerente.`);
    }
    original = preview.previewBefore;
    console.log(`[${target.label}] Piano E2E · originale=${diagnosticValue(original)} · marker=${diagnosticValue(marker)}`);

    let result;
    try {
      result = await request("/api/wordpress/taxonomy-apply", {
        approvalToken: preview.approvalToken,
        username,
        applicationPassword,
      });
      applied = true;
    } catch (error) {
      if (isUncertainWriteError(error)) {
        applied = true;
        console.warn(`[${target.label}] Apply con esito post-write incerto (${error.code || error.data?.code}); attivo recovery fail-closed.`);
      }
      throw error;
    }

    assertPersistenceProof(result, adapter, `${target.label}: apply`);
    if (result.staleChecked !== true || result.singleField !== true || result.adapter !== adapter) {
      throw new Error(`${target.label}: apply non confermato come stale-safe single-field.`);
    }
    console.log(`[${target.label}] Apply confermato · before=${diagnosticValue(result.before)} · after=${diagnosticValue(result.after)}`);

    await assertTokenConsumed(preview.approvalToken);
    await verifyEventually(target.url, adapter, marker);
    await expectRejectedPreview(target.url, original, marker);
    await rollback(target, adapter, original, marker);
    applied = false;
    console.log(`[${target.label}] OK · ${adapter} · Term #${inspection.term.id} · apply/verify/stale/rollback verificati.`);
  } finally {
    if (applied && original !== undefined) {
      try {
        const recovery = await safeRecovery(target, adapter, original, marker);
        if (recovery.recovered) applied = false;
      } catch (rollbackError) {
        console.error(`[${target.label}] INTERVENTO MANUALE RICHIESTO: recovery non completata (${rollbackError.message}).`);
        console.error(`[${target.label}] Valore originale registrato: ${diagnosticValue(original)}`);
      }
    }
  }
}

await health();
const connection = await request("/api/wordpress/connection-check", credentials);
if (connection?.ok !== true) throw new Error("Connection-check WordPress non riuscito.");
if (!connection.connector?.version || Number.parseInt(connection.connector.version.split(".")[0], 10) < 1) {
  throw new Error("SeoGrow Connector non rilevato dal sito di prova.");
}
console.log(`SeoGrow E2E connesso a ${site.hostname} come ${connection.user?.name || username}; Connector ${connection.connector.version}.`);

for (const target of targets) await runTarget(target);

console.log(`\nE2E tassonomie WordPress completato: ${targets.map((target) => target.label).join(" + ")} ripristinati ai valori iniziali.`);
