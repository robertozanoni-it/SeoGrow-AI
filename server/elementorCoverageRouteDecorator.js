import { evaluateElementorCoverageProof } from "./elementorCoverageProof.js";
import { resolveElementorCoverageAttestation } from "./elementorCoverageRegistry.js";
import { basePath, safeBase } from "./wordpressInspectFastHook.js";

const TARGET_ROUTE = "/api/wordpress/elementor-impact-inspect";
const MAX_H1_SOURCE_DOCUMENTS = 30;
const MAX_H1_SOURCE_NODES = 5_000;
const RAW_HTML_H1_KEYS = new Set(["editor", "html", "content", "text"]);

const candidateCount = (body) => Array.isArray(body?.candidateUrls) ? body.candidateUrls.length : 0;

function stripInertMarkupForH1(value) {
  let output = String(value || "");
  const inertBlock = /<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
  for (let pass = 0; pass < 6; pass += 1) {
    const next = output.replace(inertBlock, " ");
    if (next === output) break;
    output = next;
  }
  return output;
}

export function inspectElementorAuthoredH1(value, { maxNodes = MAX_H1_SOURCE_NODES } = {}) {
  let root;
  if (value === "" || value === null || value === undefined) root = [];
  else if (typeof value === "string") {
    try { root = JSON.parse(value); } catch {
      return { complete: false, h1Count: 0, dynamicH1Unknown: false, nodesVisited: 0, status: "malformed-elementor-data" };
    }
  } else if (Array.isArray(value) || (value && typeof value === "object")) root = value;
  else return { complete: false, h1Count: 0, dynamicH1Unknown: false, nodesVisited: 0, status: "unsupported-elementor-data" };

  const limit = Number.isSafeInteger(Number(maxNodes)) && Number(maxNodes) > 0 ? Number(maxNodes) : MAX_H1_SOURCE_NODES;
  const stack = [root];
  let nodesVisited = 0;
  let h1Count = 0;
  let dynamicH1Unknown = false;

  while (stack.length) {
    const node = stack.pop();
    nodesVisited += 1;
    if (nodesVisited > limit) {
      return { complete: false, h1Count, dynamicH1Unknown, nodesVisited: limit, status: "node-limit-exceeded" };
    }
    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) stack.push(node[index]);
      continue;
    }
    if (!node || typeof node !== "object") continue;

    const settings = node.settings;
    if (settings && typeof settings === "object" && !Array.isArray(settings)) {
      const headerSize = String(settings.header_size || "").trim().toLowerCase();
      if (headerSize === "h1") h1Count += 1;

      const dynamic = settings.__dynamic__;
      if (dynamic && typeof dynamic === "object" && !Array.isArray(dynamic)) {
        if (dynamic.header_size) dynamicH1Unknown = true;
        for (const key of RAW_HTML_H1_KEYS) {
          if (dynamic[key]) dynamicH1Unknown = true;
        }
      }

      for (const key of RAW_HTML_H1_KEYS) {
        const raw = settings[key];
        if (typeof raw !== "string" || !raw) continue;
        const activeMarkup = stripInertMarkupForH1(raw);
        h1Count += (activeMarkup.match(/<h1\b[^>]*>/gi) || []).length;
      }
    }

    for (const raw of Object.values(node)) {
      if (raw && typeof raw === "object") stack.push(raw);
    }
  }

  return {
    complete: true,
    h1Count,
    dynamicH1Unknown,
    nodesVisited,
    status: dynamicH1Unknown ? "complete-with-dynamic-h1-uncertainty" : "complete-authored-h1-scan",
  };
}

function h1SourceIds(body = {}) {
  const targetId = Number(body?.targetEntity?.id);
  const ids = [];
  if (Number.isSafeInteger(targetId) && targetId > 0) ids.push(targetId);
  for (const document of Array.isArray(body?.documents) ? body.documents : []) {
    const id = Number(document?.id);
    if (Number.isSafeInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
    if (ids.length >= MAX_H1_SOURCE_DOCUMENTS) break;
  }
  return ids;
}

async function readElementorH1SourceEvidence(body = {}) {
  const ids = h1SourceIds(body);
  const targetEntityId = Number(body?.targetEntity?.id);
  if (!ids.length || !Number.isSafeInteger(targetEntityId) || targetEntityId <= 0) {
    return {
      complete: false,
      readOnly: true,
      sharedWriteAllowed: false,
      targetEntityId: null,
      documents: [],
      totalAuthoredH1: null,
      dynamicH1Unknown: true,
      status: "h1-source-target-unavailable",
    };
  }

  try {
    const base = await safeBase(body?.siteUrl);
    const url = new URL(`${basePath(base)}/wp-json/seogrow/v1/elementor-reference-data`, base.origin);
    url.searchParams.set("ids", ids.join(","));
    const username = String(body?.username || "").trim();
    const password = String(body?.applicationPassword || "");
    if (!username || !password) throw new Error("Credenziali WordPress mancanti per H1 source evidence.");
    const authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: {
        authorization,
        accept: "application/json",
        "user-agent": "seoGrowAI/1.4-h1-source-evidence",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      throw new Error("WordPress ha restituito un redirect inatteso durante H1 source evidence.");
    }
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch {
      throw new Error(`H1 source evidence: risposta JSON non valida (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(data?.message || data?.code || `HTTP ${response.status}`);
    if (data?.source !== "seogrow-connector" || data?.resource !== "elementor-reference-data" || data?.readOnly !== true || data?.sharedWriteAllowed !== false || data?.complete !== true) {
      throw new Error("Contratto Elementor reference-data non valido per H1 source evidence.");
    }
    const rows = Array.isArray(data?.documents) ? data.documents : [];
    if (rows.length !== ids.length || Number(data?.requestedDocuments) !== ids.length) {
      throw new Error("Set documenti H1 source evidence incompleto.");
    }

    const documents = [];
    let totalAuthoredH1 = 0;
    let dynamicH1Unknown = false;
    for (const id of ids) {
      const matches = rows.filter((row) => Number(row?.id) === id);
      if (matches.length !== 1) throw new Error(`Documento Elementor #${id} non univoco nella source evidence.`);
      const row = matches[0];
      if (row?.ok !== true || row?.readOnly !== true || row?.sharedWriteAllowed !== false) {
        throw new Error(String(row?.error || `Documento Elementor #${id} non verificabile.`));
      }
      const scan = inspectElementorAuthoredH1(row.elementorData);
      if (scan.complete !== true) throw new Error(`Scansione H1 incompleta per documento Elementor #${id}.`);
      totalAuthoredH1 += scan.h1Count;
      dynamicH1Unknown ||= scan.dynamicH1Unknown === true;
      documents.push({
        id,
        role: id === targetEntityId ? "target" : "shared-rendered-document",
        postType: String(row?.postType || ""),
        h1Count: scan.h1Count,
        dynamicH1Unknown: scan.dynamicH1Unknown,
        complete: true,
      });
    }

    return {
      complete: !dynamicH1Unknown,
      readOnly: true,
      sharedWriteAllowed: false,
      targetEntityId,
      documents,
      totalAuthoredH1,
      dynamicH1Unknown,
      status: dynamicH1Unknown ? "dynamic-h1-source-uncertain" : "verified-authored-h1-source",
    };
  } catch (error) {
    return {
      complete: false,
      readOnly: true,
      sharedWriteAllowed: false,
      targetEntityId,
      documents: [],
      totalAuthoredH1: null,
      dynamicH1Unknown: true,
      status: "h1-source-evidence-unavailable",
      error: error instanceof Error ? error.message : String(error || "H1 source evidence non disponibile."),
    };
  }
}

export function finalizeElementorImpactCoverage(payload, requestBody = {}) {
  if (!payload || typeof payload !== "object" || payload.ok !== true) return payload;

  const coverage = payload.observedUrlCoverage && typeof payload.observedUrlCoverage === "object"
    ? payload.observedUrlCoverage
    : {};
  const proof = requestBody?.coverageProof && typeof requestBody.coverageProof === "object"
    ? requestBody.coverageProof
    : {};
  const serverAttestation = resolveElementorCoverageAttestation({
    provenanceId: proof?.provenanceId,
    siteUrl: requestBody?.siteUrl,
  });
  const evaluated = evaluateElementorCoverageProof({
    proof,
    serverAttestation,
    provided: candidateCount(requestBody),
    accepted: coverage.accepted,
    inspected: coverage.inspected,
    failed: coverage.failed,
  });

  const displayConditionsResolved = payload.displayConditionsResolved === true;
  const affectedPagesEnumerated = evaluated.completeSiteEnumeration === true && displayConditionsResolved;
  const documents = Array.isArray(payload.documents)
    ? payload.documents.map((document) => {
        if (!document || typeof document !== "object") return document;
        const documentEnumerated = affectedPagesEnumerated &&
          document.ok === true &&
          document.displayConditionsResolved === true;
        return {
          ...document,
          observedCandidateCoverage: {
            ...(document.observedCandidateCoverage && typeof document.observedCandidateCoverage === "object"
              ? document.observedCandidateCoverage
              : {}),
            completeSiteEnumeration: evaluated.completeSiteEnumeration,
            coverageStatus: evaluated.status,
            provenanceId: evaluated.serverAttestation?.provenanceId || "",
          },
          affectedPagesEnumerated: documentEnumerated,
          sharedWriteAllowed: false,
        };
      })
    : [];

  return {
    ...payload,
    documents,
    observedUrlCoverage: {
      ...coverage,
      coverageStatus: evaluated.status,
      coverageReason: evaluated.reason,
      coverageSource: evaluated.source,
      provenanceId: evaluated.serverAttestation?.provenanceId || "",
      serverVerified: evaluated.serverVerified,
      provenanceMatches: evaluated.provenanceMatches,
      completeSiteEnumeration: evaluated.completeSiteEnumeration,
    },
    affectedPagesEnumerated,
    sharedWriteAllowed: false,
  };
}

export async function enrichElementorImpactWithH1Source(payload, requestBody = {}) {
  const finalized = finalizeElementorImpactCoverage(payload, requestBody);
  if (!finalized || typeof finalized !== "object" || finalized.ok !== true) return finalized;
  const h1SourceEvidence = await readElementorH1SourceEvidence(requestBody);
  return {
    ...finalized,
    h1SourceEvidence,
    sharedWriteAllowed: false,
  };
}

export function registerElementorImpactRoutesWithCoverage(app, elementorImpactModule) {
  if (!app || typeof app.post !== "function") throw new Error("Express app non valida per Elementor coverage decorator.");
  if (!elementorImpactModule || typeof elementorImpactModule.registerRoutes !== "function") {
    throw new Error("Modulo Elementor impact non valido.");
  }

  const originalPost = app.post;
  const callOriginalPost = (path, ...handlers) => originalPost.call(app, path, ...handlers);
  app.post = (path, ...handlers) => {
    if (path !== TARGET_ROUTE || handlers.length === 0) return callOriginalPost(path, ...handlers);
    const lastIndex = handlers.length - 1;
    const wrapped = handlers.map((handler, index) => {
      if (index !== lastIndex || typeof handler !== "function") return handler;
      return async function elementorCoverageWrappedHandler(req, res, next) {
        const originalJson = res.json.bind(res);
        res.json = async (payload) => originalJson(await enrichElementorImpactWithH1Source(payload, req?.body || {}));
        return handler(req, res, next);
      };
    });
    return callOriginalPost(path, ...wrapped);
  };

  try {
    elementorImpactModule.registerRoutes(app);
  } finally {
    app.post = originalPost;
  }
}

export { TARGET_ROUTE as ELEMENTOR_IMPACT_ROUTE };
