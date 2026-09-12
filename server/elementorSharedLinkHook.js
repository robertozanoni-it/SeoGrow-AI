import crypto from "node:crypto";
import { safeBase, basePath, resolveEntity } from "./wordpressInspectFastHook.js";
import { attestElementorCoverage } from "./elementorCoverageAttestationHook.js";
import { readLinkEvidencePage } from "./linkEvidenceHook.js";
import {
  BROKEN_LINK_CLEANUP_MODES,
  normalizeBrokenLinkCleanupMode,
  prepareElementorBrokenExternalLink,
} from "../src/brokenLinkRemediation.js";

const HOOKED = Symbol.for("seogrow.elementorSharedLinkHook");
const APPROVALS = new Map();
const TTL_MS = 30 * 60_000;
const MAX_IMPACT_URLS = 300;
const IMPACT_CONCURRENCY = 4;

const canonical = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || url.username || url.password) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
};

const externalTarget = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
};

const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();

function authHeaders(username, password) {
  return {
    authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": "seoGrowAI/1.4-wordpress-remediation",
  };
}

function connectorEndpoint(base, route, query = {}) {
  const url = new URL(`${basePath(base)}/wp-json/seogrow/v1/${route}`, base.origin);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

async function connectorJson(base, headers, route, { method = "GET", query, body } = {}) {
  const response = await fetch(connectorEndpoint(base, route, query), {
    method,
    headers,
    redirect: "manual",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25_000),
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    await response.body?.cancel?.();
    throw new Error("WordPress ha restituito un redirect inatteso durante la correzione del template condiviso.");
  }
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch (error) { throw new Error(`Risposta Connector non valida (HTTP ${response.status}).`, { cause: error }); }
  if (!response.ok || data?.ok !== true) {
    const failure = new Error(data?.message || data?.error || data?.code || `Connector HTTP ${response.status}`);
    failure.code = data?.code || `HTTP_${response.status}`;
    failure.status = response.status;
    throw failure;
  }
  return data;
}

function cleanupApprovals() {
  const now = Date.now();
  for (const [token, value] of APPROVALS.entries()) {
    if (now - value.createdAt > TTL_MS) APPROVALS.delete(token);
  }
}

function interpretedConditions(candidate, sourceEntity) {
  const conditions = Array.isArray(candidate?.conditions) ? candidate.conditions : [];
  const sourceId = Number(sourceEntity?.id || 0);
  const sourceType = String(sourceEntity?.type || "").toLowerCase() === "post" ? "post" : "page";
  if (candidate?.conditionsObserved !== true || !conditions.length) {
    return { resolved: false, applies: null, reason: "Display Conditions non esposte dal Connector." };
  }
  let hasInclude = false;
  let included = false;
  let excluded = false;
  for (const raw of conditions) {
    const parts = String(raw || "").split("/").filter(Boolean);
    if (parts.length < 2 || !["include", "exclude"].includes(parts[0])) {
      return { resolved: false, applies: null, reason: `Condizione Elementor non supportata: ${raw}` };
    }
    const operator = parts[0];
    if (operator === "include") hasInclude = true;
    if (parts.length === 2 && parts[1] === "general") {
      if (operator === "include") included = true;
      else excluded = true;
      continue;
    }
    if (parts.length === 4 && parts[1] === "singular" && ["page", "post"].includes(parts[2]) && /^\d+$/.test(parts[3])) {
      const matches = parts[2] === sourceType && Number(parts[3]) === sourceId;
      if (matches && operator === "include") included = true;
      if (matches && operator === "exclude") excluded = true;
      continue;
    }
    return { resolved: false, applies: null, reason: `Condizione Elementor non supportata in scrittura condivisa: ${raw}` };
  }
  return {
    resolved: true,
    applies: !excluded && (!hasInclude || included),
    reason: excluded ? "La pagina sorgente è esclusa dalle Display Conditions." : "Display Conditions risolte per la pagina sorgente.",
  };
}

async function scanPublicImpact(urls, targetUrl) {
  const candidates = [...new Set((Array.isArray(urls) ? urls : []).map(canonical).filter(Boolean))];
  if (!candidates.length || candidates.length > MAX_IMPACT_URLS) {
    throw new Error("Coverage pubblica non utilizzabile per enumerare in sicurezza l'impatto del template condiviso.");
  }
  const rows = new Array(candidates.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < candidates.length) {
      const index = cursor;
      cursor += 1;
      const sourceUrl = candidates[index];
      try {
        rows[index] = await readLinkEvidencePage(sourceUrl, targetUrl);
      } catch (error) {
        rows[index] = { ok: false, sourceUrl, error: error?.message || "Pagina non verificabile." };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMPACT_CONCURRENCY, candidates.length) }, worker));
  const failures = rows.filter((row) => row?.ok !== true);
  if (failures.length) {
    const error = new Error(`Impact analysis incompleta: ${failures.length} pagine della coverage non sono state riverificate.`);
    error.code = "SHARED_LINK_IMPACT_INCOMPLETE";
    throw error;
  }
  const affected = rows.filter((row) => Number(row.occurrenceCount || 0) > 0);
  if (affected.some((row) => Number(row.occurrenceCount || 0) !== 1)) {
    const error = new Error("Il link 404 compare più di una volta in almeno una pagina pubblica: correzione condivisa bloccata per evitare rimozioni parziali.");
    error.code = "SHARED_LINK_PUBLIC_AMBIGUITY";
    throw error;
  }
  return {
    inspected: rows.length,
    affectedUrls: affected.map((row) => row.sourceUrl),
    affected,
  };
}

export async function prepareSharedElementorLinkPreview({
  siteUrl,
  sourceUrl,
  targetUrl,
  username,
  applicationPassword,
  mode = BROKEN_LINK_CLEANUP_MODES.PRESERVE_TEXT,
} = {}) {
  if (!username || !applicationPassword) throw new Error("Inserisci utente e password applicativa WordPress.");
  const source = canonical(sourceUrl);
  const target = externalTarget(targetUrl);
  if (!source || !target) throw new Error("Pagina sorgente o link 404 non valido.");
  const cleanupMode = normalizeBrokenLinkCleanupMode(mode);
  const base = await safeBase(siteUrl || source);
  if (base.hostname.toLowerCase() !== new URL(source).hostname.toLowerCase()) {
    throw new Error("La pagina sorgente non appartiene al sito WordPress collegato.");
  }
  const headers = authHeaders(username, applicationPassword);
  const resolved = await resolveEntity(base, headers, source);
  const localRaw = resolved?.entity?.meta?._elementor_data;
  if (localRaw !== undefined && localRaw !== null && localRaw !== "") {
    const local = prepareElementorBrokenExternalLink(localRaw, target, cleanupMode);
    if (local.state === "invalid") throw new Error("_elementor_data locale non è leggibile: ownership condivisa non dimostrabile.");
    if (local.count > 0) throw new Error("Il link è presente nel documento Elementor locale: usa la correzione locale invece del template condiviso.");
  }

  const sourceEvidence = await readLinkEvidencePage(source, target);
  if (Number(sourceEvidence.occurrenceCount || 0) !== 1) {
    throw new Error("La pagina sorgente non espone una singola occorrenza verificabile del link 404.");
  }

  const coverage = await attestElementorCoverage({
    siteUrl: base.href,
    username,
    applicationPassword,
  });
  if (coverage?.verified !== true || coverage?.completeSiteEnumeration !== true || !Array.isArray(coverage.candidateUrls)) {
    throw new Error("Coverage completa del sito non attestata: il template condiviso resta in sola lettura.");
  }

  const scan = await connectorJson(base, headers, "elementor-shared-link-scan", {
    query: { targetUrl: target },
  });
  const matches = Array.isArray(scan.matches) ? scan.matches : [];
  if (matches.length !== 1) {
    const error = new Error(matches.length
      ? `Il link 404 compare in ${matches.length} template Elementor condivisi. Serve una scelta esplicita del template.`
      : "Nessun template Elementor condiviso contiene esattamente il link 404.");
    error.code = "SHARED_LINK_TEMPLATE_AMBIGUOUS";
    throw error;
  }
  const candidate = matches[0];
  if (Number(candidate?.occurrenceCount || 0) !== 1 || typeof candidate?.elementorData !== "string") {
    throw new Error("Il template condiviso non contiene una singola occorrenza modificabile del link 404.");
  }
  const transformed = prepareElementorBrokenExternalLink(candidate.elementorData, target, cleanupMode);
  if (transformed.state !== "valid" || transformed.count !== 1 || !transformed.serialized || transformed.serialized === candidate.elementorData) {
    throw new Error("SeoGrow non riesce a costruire una trasformazione deterministica del template condiviso.");
  }
  const candidateAnchor = cleanText(transformed.anchors[0]);
  const frontendAnchor = cleanText(sourceEvidence.anchorText);
  if (!candidateAnchor || !frontendAnchor || candidateAnchor !== frontendAnchor) {
    throw new Error("Anchor text del template condiviso e anchor text del frontend non coincidono: ownership non confermata.");
  }

  const conditions = interpretedConditions(candidate, resolved.entity);
  if (conditions.resolved && conditions.applies === false) {
    throw new Error(`Il template trovato non risulta applicabile alla pagina sorgente. ${conditions.reason}`);
  }

  const impact = await scanPublicImpact(coverage.candidateUrls, target);
  const normalizedAffected = new Set(impact.affectedUrls.map(canonical));
  const normalizedSource = canonical(sourceEvidence.sourceUrl || source);
  if (!normalizedAffected.has(normalizedSource)) {
    throw new Error("La pagina sorgente non è inclusa nell'impatto pubblico enumerato: correzione condivisa bloccata.");
  }

  cleanupApprovals();
  const approvalToken = crypto.randomUUID();
  const approval = {
    createdAt: Date.now(),
    siteUrl: base.href,
    sourceUrl: normalizedSource,
    targetUrl: target,
    mode: cleanupMode,
    template: {
      id: Number(candidate.id),
      title: String(candidate.title || ""),
      type: String(candidate.type || ""),
      link: String(candidate.link || ""),
      conditionsObserved: candidate.conditionsObserved === true,
      conditions: Array.isArray(candidate.conditions) ? candidate.conditions : [],
      conditionsResolved: conditions.resolved,
      conditionsReason: conditions.reason,
    },
    beforeData: candidate.elementorData,
    afterData: transformed.serialized,
    anchorText: candidateAnchor,
    affectedUrls: impact.affectedUrls,
    inspectedUrls: impact.inspected,
  };
  APPROVALS.set(approvalToken, approval);

  return {
    ok: true,
    approvalToken,
    expiresInSeconds: Math.floor(TTL_MS / 1000),
    adapter: "Elementor shared template link cleanup",
    resource: "elementor_library",
    id: approval.template.id,
    targetUrl: target,
    sourceUrl: approval.sourceUrl,
    changed: ["meta._elementor_data"],
    previewBefore: { meta: { _elementor_data: approval.beforeData } },
    previewAfter: { meta: { _elementor_data: approval.afterData } },
    linkCleanup: {
      targetUrl: target,
      action: cleanupMode,
      anchorText: candidateAnchor,
      sharedTemplate: true,
      template: approval.template,
      affectedUrls: approval.affectedUrls,
      affectedCount: approval.affectedUrls.length,
      completeSiteEnumeration: true,
      conditionsResolved: conditions.resolved,
    },
    sharedTemplate: approval.template,
    affectedUrls: approval.affectedUrls,
    affectedPagesEnumerated: true,
    completeSiteEnumeration: true,
    requiresExplicitApproval: true,
    message: `Template Elementor #${approval.template.id} individuato con ownership verificata. ${approval.affectedUrls.length} pagina/e pubbliche mostrano attualmente il link.` ,
  };
}

async function writeShared(base, headers, approval, operation, expectedCurrent, changes) {
  return connectorJson(base, headers, "elementor-shared-link-write", {
    method: "POST",
    body: {
      id: approval.template.id,
      targetUrl: approval.targetUrl,
      mode: approval.mode,
      operation,
      expectedCurrent,
      changes,
    },
  });
}

async function verifyAffectedUrls(approval) {
  const rows = [];
  for (const url of approval.affectedUrls) {
    try {
      rows.push(await readLinkEvidencePage(url, approval.targetUrl));
    } catch (error) {
      rows.push({ ok: false, sourceUrl: url, error: error?.message || "Riverifica frontend non riuscita." });
    }
  }
  return rows;
}

export async function applySharedElementorLinkApproval({ approvalToken, username, applicationPassword } = {}) {
  cleanupApprovals();
  const token = String(approvalToken || "");
  const approval = APPROVALS.get(token);
  if (!approval) {
    const error = new Error("Anteprima shared Elementor scaduta, sostituita o già utilizzata. Rigenera la correzione.");
    error.code = "APPROVAL_EXPIRED";
    throw error;
  }
  APPROVALS.delete(token);
  if (!username || !applicationPassword) throw new Error("Inserisci utente e password applicativa WordPress.");
  const base = await safeBase(approval.siteUrl);
  const headers = authHeaders(username, applicationPassword);

  const applied = await writeShared(base, headers, approval, "apply", approval.beforeData, approval.afterData);
  await new Promise((resolve) => setTimeout(resolve, 900));
  let verification = await verifyAffectedUrls(approval);
  if (verification.some((row) => row?.ok !== true || Number(row.occurrenceCount || 0) !== 0)) {
    await new Promise((resolve) => setTimeout(resolve, 1600));
    verification = await verifyAffectedUrls(approval);
  }
  const failed = verification.filter((row) => row?.ok !== true || Number(row.occurrenceCount || 0) !== 0);
  if (failed.length) {
    try {
      await writeShared(base, headers, approval, "rollback", approval.afterData, approval.beforeData);
      const error = new Error(`La modifica del template non ha eliminato il link da ${failed.length} pagina/e pubbliche. SeoGrow ha ripristinato automaticamente il template precedente.`);
      error.code = "SHARED_LINK_FRONTEND_ROLLED_BACK";
      throw error;
    } catch (rollbackError) {
      if (rollbackError?.code === "SHARED_LINK_FRONTEND_ROLLED_BACK") throw rollbackError;
      const error = new Error("La verifica frontend è fallita e il rollback automatico non è stato confermato. Controlla subito il template Elementor prima di altre modifiche.");
      error.code = "SHARED_LINK_ROLLBACK_UNCERTAIN";
      throw error;
    }
  }

  return {
    ok: true,
    liveApplied: true,
    adapter: "Elementor shared template link cleanup",
    resource: "elementor_library",
    id: approval.template.id,
    sourceUrl: approval.sourceUrl,
    targetUrl: approval.targetUrl,
    changed: ["meta._elementor_data"],
    before: { meta: { _elementor_data: applied.beforeData || approval.beforeData } },
    after: { meta: { _elementor_data: applied.afterData || approval.afterData } },
    sharedTemplate: approval.template,
    linkCleanup: {
      targetUrl: approval.targetUrl,
      action: approval.mode,
      anchorText: approval.anchorText,
      sharedTemplate: true,
      affectedUrls: approval.affectedUrls,
      affectedCount: approval.affectedUrls.length,
    },
    affectedUrls: approval.affectedUrls,
    affectedPagesEnumerated: true,
    frontendVerified: true,
    staleChecked: true,
    atomicGuaranteed: applied.atomicGuaranteed === true,
    message: `Template Elementor condiviso aggiornato e verificato su ${approval.affectedUrls.length} pagina/e pubbliche.`,
  };
}

export async function rollbackSharedElementorLink({
  siteUrl,
  username,
  applicationPassword,
  id,
  targetUrl,
  mode,
  expectedCurrent,
  restoreValue,
} = {}) {
  if (!username || !applicationPassword) throw new Error("Inserisci utente e password applicativa WordPress.");
  const base = await safeBase(siteUrl);
  const headers = authHeaders(username, applicationPassword);
  const approval = {
    template: { id: Number(id) },
    targetUrl: externalTarget(targetUrl),
    mode: normalizeBrokenLinkCleanupMode(mode),
  };
  if (!Number.isSafeInteger(approval.template.id) || approval.template.id <= 0 || !approval.targetUrl || !expectedCurrent || !restoreValue) {
    throw new Error("Snapshot shared Elementor insufficiente per il rollback.");
  }
  return writeShared(base, headers, approval, "rollback", expectedCurrent, restoreValue);
}

export function registerRoutes(app) {
  if (app[HOOKED]) return;
  app[HOOKED] = true;
  app.post("/api/wordpress/elementor-shared-link-preview", async (req, res) => {
    try {
      return res.json(await prepareSharedElementorLinkPreview(req.body || {}));
    } catch (error) {
      return res.status(error?.status || 400).json({
        ok: false,
        error: error?.message || "Preparazione shared Elementor non riuscita.",
        code: error?.code || "SHARED_LINK_PREVIEW_FAILED",
        sharedWriteAllowed: false,
      });
    }
  });
  app.post("/api/wordpress/elementor-shared-link-apply", async (req, res) => {
    try {
      return res.json(await applySharedElementorLinkApproval(req.body || {}));
    } catch (error) {
      const uncertain = error?.code === "SHARED_LINK_ROLLBACK_UNCERTAIN";
      return res.status(uncertain ? 500 : 409).json({
        ok: false,
        error: error?.message || "Applicazione shared Elementor non riuscita.",
        code: error?.code || "SHARED_LINK_APPLY_FAILED",
        writeUncertain: uncertain,
      });
    }
  });
}
