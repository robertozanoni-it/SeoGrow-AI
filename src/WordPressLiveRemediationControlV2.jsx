import { remediationIssueKind, remediationSourceUrl } from "./remediationIssueKind.js";
import { assertSeoPatchLengths, SEO_TEXT_LIMITS, seoFieldKind, seoCharacterCount } from "./seoTextPolicy.js";
import { correctionPresentation, readableCorrectionFields } from "./correctionPresentation.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import { correctionCredentials } from "./correctionCredentials.js";
import { applyJournaledCorrection } from "./correctionJournal.js";
import { AUTO_FIX_LIMIT, selectedAutoFixIssues } from "./autoFixPlan.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Eye, ShieldCheck, Wrench } from "lucide-react";
import { apiFetch } from "./api";
import {
  attachElementorImpactEvidence,
  elementorOwnershipDetail,
  inspectElementorCoverageAttestation,
  inspectElementorImpactEvidence,
} from "./elementorImpactClient";
import { buildElementorImpactCandidateUrls } from "./elementorImpactCandidates";
import { navigatePage } from "./navigationUx.js";
import { normalizeAnalysisHistory } from "./platform";
import { listCorrections, setLastBatch, stableIssueKey } from "./remediationStore";
import {
  assertNoPreviewConflicts,
  detectPreviewConflicts,
  previewIdentity,
  remediationContextDecision,
} from "./remediationPlanSafety";
import { normalizeClientId, safeHttpHref } from "./reliabilityModel";
import {
  assessCoreOwnership,
  chooseElementorContentCandidate,
  countTextWords,
  inspectEditableElementor,
  serializeElementor,
} from "./wordpressOwnership";
import "./WordPressLiveRemediationControl.css";
import "./WordPressLiveRemediationControlV2.css";

const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";
const SITE_HISTORY_KEY = "seogrow-analyses-v2";

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

const resolveTarget = () => typeof document === "undefined" ? null : document.querySelector(".audit-unified-remediation");
const auditTimestamp = (entry) => entry?.item?.analyzedAt || entry?.item?.startedAt || "";

const candidates = (clientId) => {
  const pages = readJson(PAGE_HISTORY_KEY, {})[clientId] || [];
  const sites = normalizeAnalysisHistory(readJson(SITE_HISTORY_KEY, {})[clientId]);
  return [
    ...(Array.isArray(pages) ? pages.map((item) => ({ type: "page", item })) : []),
    ...sites.map((item) => ({ type: "site", item })),
  ].toSorted((a, b) => Date.parse(auditTimestamp(b) || 0) - Date.parse(auditTimestamp(a) || 0));
};

const selectAudit = (clientId, requested) => {
  const list = candidates(clientId);
  if (!requested) return list[0] || null;
  if (normalizeClientId(requested.clientId) !== normalizeClientId(clientId)) return null;
  if (!["page", "site"].includes(requested.auditType) || !requested.analyzedAt) return null;
  const matches = list.filter((entry) => entry.type === requested.auditType && String(auditTimestamp(entry)) === String(requested.analyzedAt));
  return matches.length === 1 ? matches[0] : null;
};

const issueUrl = remediationSourceUrl;
const issueText = (issue) => `${issue?.type || ""} ${issue?.label || ""} ${issue?.detail || ""}`.toLowerCase();
const classifyIssue = remediationIssueKind;

const isNonEditableWordPressUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (/\/(?:category|categoria|tag|author|autore|date|feed)(?:\/|$)/i.test(path)) return true;
    if (/\/page\/\d+$/i.test(path) || /\/(?:search)(?:\/|$)/i.test(path)) return true;
    return ["s", "cat", "tag", "paged", "author", "feed"].some((key) => url.searchParams.has(key));
  } catch { return true; }
};

const readCredentials = () => {
  const root = document.querySelector(".audit-unified-credentials");
  const inputs = [...(root?.querySelectorAll("input") || [])];
  return {
    url: inputs.find((input) => input.autocomplete === "url")?.value?.trim() || "",
    username: inputs.find((input) => input.autocomplete === "username")?.value?.trim() || "",
    applicationPassword: inputs.find((input) => input.type === "password")?.value || "",
  };
};

const pluginMeta = (entity) => entity?.meta && typeof entity.meta === "object" ? entity.meta : {};
const ownershipUndetermined = (kind, detail) => {
  const error = new Error(`Ownership frontend non determinabile per "${kind}". ${detail} Nessuna modifica è stata autorizzata.`);
  error.code = "OWNERSHIP_UNDETERMINED";
  return error;
};

const metaKey = (entity, kind) => {
  const meta = pluginMeta(entity);
  const has = (key) => Object.prototype.hasOwnProperty.call(meta, key);
  const choices = {
    title: [["rank_math_title", "Rank Math"], ["_yoast_wpseo_title", "Yoast"]],
    meta_description: [["rank_math_description", "Rank Math"], ["_yoast_wpseo_metadesc", "Yoast"]],
    canonical: [["rank_math_canonical_url", "Rank Math"], ["_yoast_wpseo_canonical", "Yoast"]],
    noindex: [["rank_math_robots", "Rank Math"], ["_yoast_wpseo_meta-robots-noindex", "Yoast"]],
  };
  const matches = (choices[kind] || []).filter(([key]) => has(key));
  if (matches.length > 1) throw ownershipUndetermined(kind, `Sono esposti contemporaneamente ${matches.map(([, adapter]) => adapter).join(" e ")}; SeoGrow non sceglie un plugin SEO per priorità arbitraria.`);
  return matches[0] || null;
};

const pageContext = (entity, targetUrl, contentOverride, remediationMeasurement) => ({
  title: entity?.title?.raw || entity?.title?.rendered || "",
  content: contentOverride ?? entity?.content?.raw ?? entity?.content?.rendered ?? "",
  excerpt: entity?.excerpt?.raw || entity?.excerpt?.rendered || "",
  url: targetUrl,
  ...(remediationMeasurement ? { remediationMeasurement } : {}),
});

const preparationFailure = (error) => {
  const message = error instanceof Error ? error.message : "Preparazione correzione non riuscita.";
  const code = String(error?.code || "");
  if (/EDITORIAL_REVIEW_REQUIRED|SEO_TEXT_LIMIT_EXCEEDED/.test(code)) return { status: "quality_error", category: "quality", reason: message };
  if (/CANONICAL_|INDEX_INTENT/.test(code)) return { status: "context_error", category: "context", reason: message };
  if (code === "OWNERSHIP_UNDETERMINED" || /ownership/i.test(message)) return { status: "ownership_error", category: "ownership", reason: message };
  if (/401|403|credenzial|autentic|password|unauthorized|forbidden/i.test(message)) return { status: "auth_error", category: "authentication", reason: message };
  if (/timeout|timed out|tempo.*scad/i.test(message)) return { status: "timeout_error", category: "timeout", reason: message };
  if (/openai|generaz|modello|ai\b/i.test(message)) return { status: "generation_error", category: "generation", reason: message };
  if (/adapter|non dispone|non espongono/i.test(message)) return { status: "adapter_error", category: "adapter", reason: message };
  return { status: "error", category: "runtime", reason: message };
};

const contentMeasurement = (frontend, fieldContent) => {
  const frontendWords = Number(frontend?.words);
  const minimumWords = Number(frontend?.minimumWords);
  const fieldWords = countTextWords(fieldContent);
  if (![frontendWords, minimumWords, fieldWords].every((value) => Number.isSafeInteger(value) && value >= 0) || fieldWords > frontendWords) {
    throw ownershipUndetermined("content", "Il conteggio corrente di frontend e campo modificabile non è coerente; il target non può essere calcolato in sicurezza.");
  }
  return { frontendWords, fieldWords, minimumWords, marginWords: minimumWords >= 180 ? 30 : 20 };
};

async function inspectWordPress(targetUrl, credentials) {
  if (isNonEditableWordPressUrl(targetUrl)) {
    const error = new Error("Archivio/tassonomia/paginazione WordPress: questa URL non è una pagina o un articolo modificabile via REST.");
    error.code = "NON_EDITABLE_ARCHIVE";
    throw error;
  }
  const response = await apiFetch("/api/wordpress/inspect-fast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      siteUrl: credentials.url,
      url: targetUrl,
      username: credentials.username,
      applicationPassword: credentials.applicationPassword,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Ispezione WordPress non riuscita.");
    error.code = response.status === 401 || response.status === 403 ? "AUTH" : "INSPECT";
    throw error;
  }
  return data;
}

async function inspectFrontend(targetUrl) {
  const response = await apiFetch("/api/frontend/inspect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ispezione frontend non riuscita.");
  return data;
}

async function verifyFrontend(targetUrl, expected) {
  const response = await apiFetch("/api/wordpress/verify-frontend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: targetUrl, expected }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Controllo ownership frontend non riuscito.");
  return data;
}

async function verifyCoreOwnership(kind, targetUrl, inspected) {
  if (!["title", "content", "h1"].includes(kind)) return { ok: true, frontend: null };
  const entity = inspected.entity || {};
  const expected = kind === "title"
    ? { title: entity.title?.raw || entity.title?.rendered || "" }
    : { content: entity.content?.raw || entity.content?.rendered || "" };
  const frontend = await verifyFrontend(targetUrl, expected);
  return assessCoreOwnership(kind, entity, frontend);
}

const alreadyResolvedReason = (kind, issue, ownership) => {
  const frontend = ownership?.frontend;
  if (!frontend) return "";
  const verificationSafe = frontend.verificationSafe !== false && frontend.requiresBrowserVerification !== true;
  if (!verificationSafe && ["h1", "content"].includes(kind)) return "";
  if (kind === "h1") {
    const label = String(issue?.label || "");
    if ((/\b0\s*H1\b/i.test(label) || /\b(?:[2-9]|[1-9]\d+)\s*H1\b/i.test(label)) && Number(frontend.h1) === 1)
      return "Il problema H1 dell’audit non è più presente nel frontend corrente. Esegui un nuovo audit per aggiornare il report.";
  }
  if (kind === "content" && /brev|parole|word/.test(issueText(issue))) {
    const words = Number(frontend.words);
    const minimumWords = Number(frontend.minimumWords);
    if (Number.isFinite(words) && Number.isFinite(minimumWords) && minimumWords > 0 && words >= minimumWords)
      return `Il contenuto breve non è più presente nel frontend corrente (${words} parole, soglia ${minimumWords}). Esegui un nuovo audit per confermare.`;
  }
  return "";
};

async function generateCorePatch(kind, issue, entity, targetUrl, contentOverride, remediationMeasurement) {
  const response = await apiFetch("/api/wordpress/generate-patch-v2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      topic: `Remediation WordPress ${kind}`,
      context: JSON.stringify({ issue, page: pageContext(entity, targetUrl, contentOverride, remediationMeasurement) }),
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.content) {
    const error = new Error(data.error || "Generazione patch non riuscita.");
    error.code = data.code || "GENERATION_FAILED";
    throw error;
  }
  const parsed = data.changes ? { changes: data.changes } : JSON.parse(String(data.content));
  if (!parsed?.changes || typeof parsed.changes !== "object") throw new Error("La patch WordPress è vuota.");
  return { changes: parsed.changes, quality: data.quality || null };
}

async function generateSeoValue(kind, issue, entity, targetUrl) {
  const response = await apiFetch("/api/wordpress/generate-seo-value-v2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, issue, page: pageContext(entity, targetUrl) }),
  });
  const data = await response.json();
  if (!response.ok || !data.value || data.publishable !== true) {
    const error = new Error(data.error || "La proposta SEO richiede revisione editoriale e non può essere approvata automaticamente.");
    error.code = data.code || "EDITORIAL_REVIEW_REQUIRED";
    error.quality = data.quality || null;
    throw error;
  }
  return { value: String(data.value).trim(), quality: data.quality || null };
}

async function chooseVerifiedElementorContentWidget(targetUrl, state) {
  if (state.widgets.length > 8) throw ownershipUndetermined("content", "La pagina contiene più di 8 text-editor Elementor candidati; serve selezione assistita prima di modificare.");
  const probes = await Promise.all(state.widgets.map((widget) => verifyFrontend(targetUrl, { content: widget.value })));
  const selected = chooseElementorContentCandidate(state.widgets, probes);
  if (!selected.candidate) throw ownershipUndetermined("content", selected.reason);
  return selected.candidate;
}

async function elementorPlan(kind, issue, entity, targetUrl, state, frontend) {
  if (!state?.parsed || !state.widgets.length) return null;
  if (kind === "h1") {
    const headings = state.widgets.map((candidate) => candidate.item);
    const h1 = headings.filter((item) => String(item.settings?.header_size || "h2").toLowerCase() === "h1");
    const label = String(issue?.label || "");
    const frontendH1 = Number(frontend?.h1);
    const missing = /\b0\s*H1\b/i.test(label);
    const multiple = /\b(?:[2-9]|[1-9]\d+)\s*H1\b/i.test(label);
    if (missing || h1.length === 0) {
      if (frontendH1 !== 0 || !headings.length) throw ownershipUndetermined("h1", `Gli H1 Elementor modificabili non coincidono con il frontend (${Number.isFinite(frontendH1) ? frontendH1 : "non verificabile"}).`);
      headings[0].settings.header_size = "h1";
    } else if (multiple || h1.length > 1) {
      if (h1.length <= 1 || frontendH1 !== h1.length) throw ownershipUndetermined("h1", "Gli H1 pubblici non coincidono con gli H1 Elementor modificabili; potrebbe intervenire un template condiviso.");
      h1.slice(1).forEach((item) => { item.settings.header_size = "h2"; });
    } else return null;
    return { adapter: "Elementor", changes: { meta: { _elementor_data: serializeElementor(state.parsed) } }, quality: null };
  }
  if (kind === "content") {
    const selected = await chooseVerifiedElementorContentWidget(targetUrl, state);
    const previous = selected.item.settings.editor;
    const measurement = contentMeasurement(frontend, previous);
    const generated = await generateCorePatch("content", issue, entity, targetUrl, previous, measurement);
    if (typeof generated.changes?.content !== "string" || !generated.changes.content.trim() || generated.changes.content === previous) return null;
    selected.item.settings.editor = generated.changes.content;
    return { adapter: "Elementor", changes: { meta: { _elementor_data: serializeElementor(state.parsed) } }, quality: generated.quality };
  }
  return null;
}

async function buildPlan(kind, issue, inspected, targetUrl, frontendContext) {
  const entity = inspected.entity || {};
  const contextDecision = remediationContextDecision(issue, frontendContext || {}, targetUrl);
  if (!contextDecision.allowed) {
    const error = new Error(contextDecision.reason);
    error.code = contextDecision.code;
    throw error;
  }

  if (["content", "h1"].includes(kind)) {
    const ownership = await verifyCoreOwnership(kind, targetUrl, inspected);
    const resolvedReason = alreadyResolvedReason(kind, issue, ownership);
    if (resolvedReason) return { alreadyResolved: true, reason: resolvedReason };
    const elementorState = inspectEditableElementor(kind, entity);
    if (elementorState.state === "invalid") throw ownershipUndetermined(kind, "_elementor_data è presente ma non è strutturato in modo valido e sicuro.");
    if (elementorState.state === "valid" && elementorState.widgets.length > 0) {
      const elementor = await elementorPlan(kind, issue, entity, targetUrl, elementorState, ownership.frontend);
      if (elementor) return elementor;
      throw ownershipUndetermined(kind, "Sono presenti widget Elementor pertinenti, ma non è stato possibile preparare una modifica senza ambiguità. Il fallback su post_content è bloccato.");
    }
    if (elementorState.state === "valid" && elementorState.hasDocument) {
      throw ownershipUndetermined(kind, `${elementorOwnershipDetail(entity)} Il fallback su post_content è bloccato.`);
    }
    if (ownership.ok) {
      const coreContent = entity?.content?.raw || entity?.content?.rendered || "";
      const generated = await generateCorePatch(kind, issue, entity, targetUrl, undefined, kind === "content" ? contentMeasurement(ownership.frontend, coreContent) : undefined);
      return { adapter: "WordPress core", ...generated };
    }
    throw ownershipUndetermined(kind, "La verifica frontend non dimostra che post_content sia la sorgente principale della pagina.");
  }

  if (kind === "title") {
    const seoPlugin = metaKey(entity, "title");
    if (seoPlugin) {
      const generated = await generateSeoValue("seo_title", issue, entity, targetUrl);
      return { adapter: seoPlugin[1], changes: { meta: { [seoPlugin[0]]: generated.value } }, quality: generated.quality };
    }
    const ownership = await verifyCoreOwnership(kind, targetUrl, inspected);
    const resolvedReason = alreadyResolvedReason(kind, issue, ownership);
    if (resolvedReason) return { alreadyResolved: true, reason: resolvedReason };
    if (ownership.ok) {
      const generated = await generateCorePatch(kind, issue, entity, targetUrl);
      return { adapter: "WordPress core", ...generated };
    }
    const plugin = metaKey(entity, "title");
    if (!plugin) throw new Error("Il title SEO è gestito dal frontend ma Rank Math/Yoast non espongono un campo REST scrivibile per questa pagina.");
    const generated = await generateSeoValue("seo_title", issue, entity, targetUrl);
    return { adapter: plugin[1], changes: { meta: { [plugin[0]]: generated.value } }, quality: generated.quality };
  }

  if (kind === "excerpt") {
    const generated = await generateCorePatch("excerpt", issue, entity, targetUrl);
    return { adapter: "WordPress core", ...generated };
  }

  if (kind === "meta_description") {
    const plugin = metaKey(entity, kind);
    if (!plugin) throw new Error("Rank Math/Yoast non espongono la meta description come campo REST scrivibile per questa pagina.");
    const generated = await generateSeoValue("meta_description", issue, entity, targetUrl);
    return { adapter: plugin[1], changes: { meta: { [plugin[0]]: generated.value } }, quality: generated.quality };
  }

  if (kind === "canonical") {
    const plugin = metaKey(entity, kind);
    if (!plugin) throw new Error("Rank Math/Yoast non espongono la canonical come campo REST scrivibile per questa pagina.");
    return { adapter: plugin[1], changes: { meta: { [plugin[0]]: frontendContext?.url || targetUrl } }, quality: null };
  }

  if (kind === "noindex") {
    const plugin = metaKey(entity, kind);
    if (!plugin) throw new Error("Rank Math/Yoast non espongono la direttiva noindex come campo REST scrivibile per questa pagina.");
    const [key, adapter] = plugin;
    const current = pluginMeta(entity)[key];
    const next = key === "_yoast_wpseo_meta-robots-noindex"
      ? "2"
      : Array.isArray(current)
        ? [...new Set(["index", "follow", ...current.filter((item) => !/noindex/i.test(String(item)))])]
        : "index,follow";
    return { adapter, changes: { meta: { [key]: next } }, quality: null };
  }

  throw new Error("Questo problema non dispone ancora di un adapter WordPress applicabile.");
}

const flattenState = (state, fields) => {
  const flat = {};
  for (const field of fields || []) {
    if (field.startsWith("meta.")) flat[field] = state?.meta?.[field.slice(5)];
    else flat[field] = state?.[field];
  }
  return flat;
};
const previewText = (value) => JSON.stringify(value, null, 2) || "(anteprima non disponibile)";
const openAiConfigurationMissing = (item) => item?.status === "generation_error" && /openai.*non (?:è )?configurat|OPENAI_API_KEY/i.test(String(item?.reason || ""));
const h1OwnershipBlocked = (item) => item?.status === "ownership_error" && /h1/i.test(issueText(item?.issue));

export default function WordPressLiveRemediationControlV2({ batchPlan = null, onBusyChange } = {}) {
  const busyRef = useRef(false);
  const [target, setTarget] = useState(() => resolveTarget());
  const [running, setRunning] = useState(false);
  const [applyingId, setApplyingId] = useState("");
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");
  const [requestedAudit, setRequestedAudit] = useState(batchPlan);

  useEffect(() => {
    if (target) return undefined;
    let frame = 0;
    let attempts = 0;
    const find = () => {
      const next = resolveTarget();
      if (next) { setTarget(next); return; }
      attempts += 1;
      if (attempts < 120) frame = window.requestAnimationFrame(find);
    };
    find();
    return () => window.cancelAnimationFrame(frame);
  }, [target]);

  useEffect(() => {
    const open = (event) => {
      const detail = event?.detail || {};
      setRequestedAudit({
        clientId: normalizeClientId(detail.clientId),
        issueIndex: Number(detail.issueIndex || 0),
        auditType: detail.auditType || "page",
        analyzedAt: detail.analyzedAt || "",
      });
    };
    window.addEventListener("seogrow-remediation-open", open);
    return () => window.removeEventListener("seogrow-remediation-open", open);
  }, []);

  const previews = useMemo(() => results.filter((item) => item.status === "preview"), [results]);
  const conflicts = useMemo(() => detectPreviewConflicts(previews), [previews]);
  if (!target) return null;

  const currentContext = async () => {
    const clients = readJson(CLIENTS_KEY, []);
    const clientId = normalizeClientId(readJson(SELECTED_CLIENT_KEY, null));
    const client = clients.find((item) => normalizeClientId(item?.id) === clientId) || null;
    const audit = client ? selectAudit(clientId, batchPlan || requestedAudit) : null;
    const issues = Array.isArray(audit?.item?.issues) ? audit.item.issues : [];
    const corrections = clientId ? await listCorrections({ clientId }) : [];
    const verifiedKeys = new Set(corrections.filter((record) => record.status === "Verificato").flatMap((record) => [record.issueKey, record.legacyIssueKey].filter(Boolean)));
    const permitted = batchPlan ? selectedAutoFixIssues(batchPlan, batchPlan.indexes, { clientId, audit: audit?.item }) : issues;
    const activeIssues = issues.filter((issue) => !verifiedKeys.has(stableIssueKey({
      issue,
      issueType: issue?.type || "audit",
      issueLabel: issue?.label || "",
      sourceUrl: issueUrl(issue, audit?.item, client),
    })));
    return { clientId, client, audit, issues, activeIssues: activeIssues.filter(issue => permitted.includes(issue)) };
  };

  const prepare = async (all, explicitItem = null) => {
    if (busyRef.current) return;
    busyRef.current = true;
    onBusyChange?.(true);
    setRunning(true);
    try {
    const credentials = readCredentials();
    if (!credentials.url || !credentials.username || !credentials.applicationPassword) {
      setMessage("Connetti WordPress inserendo URL, utente e password applicativa prima di preparare le correzioni.");
      return;
    }
    const context = await currentContext();
    if (!context.client || !context.audit || !context.issues.length) {
      setMessage("Il progetto o l'audit richiesto non è disponibile. Seleziona esplicitamente il progetto e riapri l'audit.");
      return;
    }
    const issueKey = (issue, explicitUrl = "") => stableIssueKey({
      issue,
      issueType: issue?.type || "audit",
      issueLabel: issue?.label || "",
      sourceUrl: explicitUrl || issueUrl(issue, context.audit.item, context.client),
    });
    const domIndex = Number(document.querySelector(".audit-issue-select select")?.value || 0);
    const requestedIndex = requestedAudit && normalizeClientId(requestedAudit.clientId) === context.clientId ? Number(requestedAudit.issueIndex || 0) : domIndex;
    let selected;
    if (explicitItem?.issue) {
      const wanted = issueKey(explicitItem.issue, explicitItem.targetUrl || "");
      selected = context.activeIssues.filter((issue) => issueKey(issue) === wanted).slice(0, 1);
    } else {
      selected = all ? context.activeIssues.slice(0, AUTO_FIX_LIMIT) : [context.issues[requestedIndex]].filter((issue) => issue && context.activeIssues.includes(issue));
    }
    if (!selected.length) {
      setResults([]);
      setMessage("Nessun problema attivo da preparare.");
      return;
    }

    setRunning(true);
    setResults([]);
    const next = [];
    for (let index = 0; index < selected.length; index += 1) {
      const currentIssue = selected[index];
      const targetUrl = issueUrl(currentIssue, context.audit.item, context.client);
      setMessage(`Esaminati ${index}/${selected.length} · in elaborazione: ${currentIssue?.label || "problema SEO"}…`);
      try {
        const kind = classifyIssue(currentIssue);
        if (!kind) throw new Error("Questo problema non dispone ancora di un adapter WordPress applicabile.");
        const [inspected, frontendContext] = await Promise.all([
          inspectWordPress(targetUrl, credentials),
          inspectFrontend(targetUrl),
        ]);
        if (["content", "h1"].includes(kind)) {
          const candidateUrls = buildElementorImpactCandidateUrls({
            audit: context.audit.item,
            issue: currentIssue,
            client: context.client,
          });
          const impactEvidence = await inspectElementorImpactEvidence(inspected.entity, credentials, candidateUrls);
          if (impactEvidence) attachElementorImpactEvidence(inspected.entity, impactEvidence);
        }
        const plan = await buildPlan(kind, currentIssue, inspected, targetUrl, frontendContext);
        if (plan.changes) assertSeoPatchLengths(plan.changes);
        const contextSnapshot = {
          clientId: context.clientId,
          clientName: context.client?.name || "",
          siteUrl: credentials.url,
          auditType: context.audit.type,
          analyzedAt: auditTimestamp(context.audit),
        };
        const identity = previewIdentity({ issue: currentIssue, inspected, targetUrl, frontend: frontendContext });
        if (plan.alreadyResolved) {
          next.push({ status: "resolved", issue: currentIssue, targetUrl, reason: plan.reason, contextSnapshot, inspected, frontendContext, ...identity });
          setResults([...next]);
          continue;
        }
        const response = await apiFetch("/api/wordpress/live-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            siteUrl: credentials.url,
            targetUrl,
            username: credentials.username,
            applicationPassword: credentials.applicationPassword,
            resource: inspected.resource,
            id: inspected.entity.id,
            changes: plan.changes,
            issue: currentIssue,
            adapter: plan.adapter,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(data.error || "Anteprima WordPress non riuscita.");
          error.code = data.code || "PREVIEW_FAILED";
          throw error;
        }
        next.push({ status: "preview", issue: currentIssue, targetUrl, plan, data, contextSnapshot, inspected, frontendContext, ...identity });
      } catch (error) {
        next.push({ ...preparationFailure(error), issue: currentIssue, targetUrl, quality: error?.quality || null });
      }
      setResults([...next]);
    }

    const ready = next.filter((item) => item.status === "preview").length;
    const resolved = next.filter((item) => item.status === "resolved").length;
    const blocked = next.length - ready - resolved;
    const foundConflicts = detectPreviewConflicts(next);
    setMessage(
      `Esaminati ${next.length}/${selected.length} · pronti ${ready} · già risolti ${resolved} · bloccati ${blocked} · conflitti ${foundConflicts.length}. ${ready > 1 ? "Le anteprime si applicano una alla volta per sicurezza." : "Nessuna modifica live è stata ancora eseguita."}`,
    );
    } catch (error) {
      setResults([]); setMessage(error.message || "Preparazione non riuscita.");
    } finally { busyRef.current = false; onBusyChange?.(false); setRunning(false); }
  };

  const verifyH1Coverage = async (item) => {
    if (!h1OwnershipBlocked(item) || busyRef.current) return;
    busyRef.current = true;
    onBusyChange?.(true);
    setRunning(true);
    let rerun = false;
    try {
      const credentials = readCredentials();
      if (!credentials.url || !credentials.username || !credentials.applicationPassword) {
        setMessage("Collega WordPress prima di verificare l'origine degli H1.");
        return;
      }
      setMessage("Verifica origine H1: controllo sitemap, pagine pubbliche e inventario WordPress in sola lettura…");
      const diagnostic = await inspectElementorCoverageAttestation(credentials, { force: true });
      if (diagnostic?.verified !== true) {
        const reason = diagnostic?.error || diagnostic?.reconciliation?.reason || "Coverage completa non attestabile.";
        setResults((current) => current.map((entry) => entry === item ? {
          ...entry,
          status: "ownership_error",
          reason: `Verifica origine H1 non completata: ${reason}`,
        } : entry));
        setMessage(`Origine H1 non ancora verificabile: ${reason} Nessuna modifica è stata eseguita.`);
        return;
      }
      setMessage(`Coverage completa verificata su ${diagnostic.candidateUrls.length} URL. SeoGrow può ora riesaminare l'ownership H1 e preparare la proposta se il campo è sicuro.`);
      rerun = true;
    } catch (error) {
      setMessage(`Verifica origine H1 non completata: ${error.message || error}`);
    } finally {
      busyRef.current = false;
      onBusyChange?.(false);
      setRunning(false);
    }
    if (rerun) await prepare(false, item);
  };

  const applyOne = async (item) => {
    if (!item || item.status !== "preview" || busyRef.current) return;
    busyRef.current = true;
    onBusyChange?.(true);
    try {
    const credentials = readCredentials();
    if (!credentials.username || !credentials.applicationPassword) {
      setMessage("La password applicativa non è disponibile. Reinseriscila prima dell'approvazione.");
      return;
    }
    try {
      assertNoPreviewConflicts(previews);
      assertSeoPatchLengths(item.plan?.changes || {});
    } catch (error) {
      setMessage(error.message);
      return;
    }
    let liveContext;
    try { liveContext = await currentContext(); }
    catch (error) { setResults([]); setMessage(error.message); return; }
    const stale = normalizeClientId(item.contextSnapshot?.clientId) !== liveContext.clientId ||
      item.contextSnapshot?.auditType !== liveContext.audit?.type ||
      String(item.contextSnapshot?.analyzedAt || "") !== String(auditTimestamp(liveContext.audit) || "");
    if (stale) {
      setResults((current) => current.map((entry) => entry === item ? { ...entry, status: "stale", reason: "Audit o progetto cambiati dopo l'anteprima." } : entry));
      setMessage("Progetto o audit sono cambiati dopo la preparazione. L'anteprima selezionata è stata invalidata.");
      return;
    }
    if (!window.confirm(`Applicare ORA questa singola modifica al sito WordPress live?\n\nProblema: ${item.issue?.label || "SEO"}\nCampo/i: ${(item.data.changed || []).join(", ")}\nRisorsa WordPress: ${item.inspected?.resource || "contenuto"} #${item.inspected?.entity?.id || "?"}\n\nIl payload completo è visibile nell'anteprima.`)) return;

    const batchId = `live-remediation-${Date.now()}`;
    setLastBatch(batchId);
    setApplyingId(item.data.approvalToken);
    setMessage(`Applicazione live: ${item.issue?.label || "problema SEO"}…`);
    try {
      const data = {
        changed: item.data.changed,
        before: item.data.previewBefore,
        after: item.data.previewAfter,
        resource: item.data.resource,
        id: item.data.id,
        adapter: item.data.adapter,
      };
      const fields = data.changed || [];
      const snapshot = item.contextSnapshot || {};
      const pendingRecord = {
        id: `correction-${crypto.randomUUID()}`,
        batchId,
        clientId: snapshot.clientId,
        clientName: snapshot.clientName || "",
        platform: "wordpress",
        liveApproval: true,
        adapter: data.adapter || item.plan.adapter,
        issue: item.issue,
        issueLabel: item.issue?.label || "Problema SEO",
        issueType: item.issue?.type || "audit",
        severity: item.issue?.severity || "media",
        sourceUrl: data.sourceUrl || item.targetUrl,
        siteUrl: credentials.url,
        finalUrl: item.frontendContext?.url || "",
        canonical: item.frontendContext?.canonical || "",
        canonicalConfirmed: Boolean(item.frontendContext?.canonical),
        resource: data.resource,
        entityId: Number(data.id),
        wordpressResource: data.resource,
        wordpressId: Number(data.id),
        resourceIdentity: item.resourceIdentity,
        issueIdentity: item.issueIdentity,
        username: credentials.username,
        fields,
        before: flattenState(data.before, fields),
        after: flattenState(data.after, fields),
        rollbackChanges: data.before,
        editorialQuality: item.plan.quality || null,
        status: "Da verificare",
        appliedAt: new Date().toISOString(),
        frontendConfirmed: false,
        auditType: snapshot.auditType,
        auditAnalyzedAt: snapshot.analyzedAt,
        verificationNote: `Modifica live approvata e applicata tramite ${data.adapter || item.plan.adapter}. Scrittura e risoluzione SEO restano stati distinti.`,
      };
      const record = await applyJournaledCorrection(pendingRecord, async () => {
        correctionCredentials({ clientId: snapshot.clientId, siteUrl: snapshot.siteUrl }, {
          clientId: Number(readJson(SELECTED_CLIENT_KEY, 0)), siteUrl: credentials.url,
          username: credentials.username, applicationPassword: credentials.applicationPassword,
        });
        const response = await apiFetch("/api/wordpress/live-apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ approvalToken: item.data.approvalToken, username: credentials.username, applicationPassword: credentials.applicationPassword }),
        });
        const applied = await response.json();
        if (!response.ok) {
          const error = new Error(applied.error || "Applicazione live non riuscita.");
          error.code = applied.code || "APPLY_FAILED";
          throw error;
        }
        return {
          adapter: applied.adapter || pendingRecord.adapter,
          before: flattenState(applied.before, applied.changed || fields),
          after: flattenState(applied.after, applied.changed || fields),
          rollbackChanges: applied.before,
        };
      });
      window.dispatchEvent(new CustomEvent("seogrow-remediation-applied", { detail: { id: record.id, batchId } }));
      setResults((current) => current.map((entry) => entry === item ? { ...entry, status: "applied", data: { ...entry.data, apply: record } } : entry));
      setMessage("Modifica applicata e registrata. Stato: Da verificare. Usa la riverifica specifica e, quando richiesto, un nuovo audit prima di considerare il problema risolto.");
    } catch (error) {
      setResults((current) => current.map((entry) => entry === item ? { ...entry, status: "error", reason: error.message } : entry));
      setMessage(`Applicazione non completata: ${error.message}`);
    } finally {
      setApplyingId("");
    }
    } finally { busyRef.current = false; onBusyChange?.(false); }
  };

  return createPortal(
    <section className="wp-live-remediation panel wp-live-remediation-v2" aria-label="Remediation WordPress live con approvazione selettiva">
      <div className="wp-live-remediation-head">
        <div>
          <span><ShieldCheck /> Modalità live controllata</span>
          <h3>{batchPlan ? "4. Prepara e approva le proposte" : "2. Prepara e approva le proposte"}</h3>
          <p><strong>Cosa fare:</strong> premi il pulsante qui sotto per leggere il sito e preparare le proposte. Questa operazione non modifica WordPress. Poi segui le istruzioni nella scheda di ciascun problema.</p>
        </div>
      </div>

      <div className="wp-live-remediation-actions">
        <button data-seogrow-live="1" type="button" className="primary" disabled={running || Boolean(applyingId)} onClick={() => prepare(true)}><Eye />{running ? "Esame in corso…" : batchPlan ? "Prepara le anteprime selezionate" : "Prepara le anteprime dei problemi attivi"}</button>
        <button data-seogrow-live="1" type="button" className="secondary" disabled={running || Boolean(applyingId)} onClick={() => prepare(false)}><Wrench />Prepara solo questo problema</button>
      </div>

      {conflicts.length > 0 && <div className="wp-live-conflict" role="alert"><AlertTriangle /><div><strong>{conflicts.length} conflitti tra anteprime</strong><p>Due proposte cambiano diversamente lo stesso campo della stessa risorsa. Rigenera o scegli una sola proposta prima di approvare.</p></div></div>}

      {results.length > 0 && <div className="wp-live-preview-list">
        {results.map((item, index) => <article key={`${item.issue?.label || "issue"}-${item.resourceIdentity || index}`} className={`wp-live-preview-row ${item.status}`}>
          <div className="wp-live-preview-title">
            {item.status === "applied" || item.status === "resolved" ? <CheckCircle2 /> : <AlertTriangle />}
            <div>
              <strong>{item.issue?.label || "Problema SEO"}</strong>
              {item.targetUrl && <small>{item.targetUrl}</small>}

            </div>
          </div>
          <div className="correction-explanation"><h4>{correctionPresentation(item).title}</h4><p>{correctionPresentation(item).explanation}</p><p><strong>Prossimo passo:</strong> {correctionPresentation(item).next}</p>{item.reason && <details><summary>Dettaglio tecnico del controllo</summary><p>{item.reason}</p></details>}</div>
          {(h1OwnershipBlocked(item) || openAiConfigurationMissing(item)) && <div className="wp-live-guidance-actions">
            {h1OwnershipBlocked(item) && <button data-seogrow-live="1" type="button" className="primary" disabled={running || Boolean(applyingId)} onClick={() => verifyH1Coverage(item)}><Eye />{running ? "Verifica in corso…" : "Verifica origine H1"}</button>}
            {openAiConfigurationMissing(item) && <button type="button" className="primary" onClick={() => navigatePage("Integrazioni")}><Wrench />Configura OpenAI</button>}
          </div>}
          {item.status.endsWith('_error') && safeHttpHref(item.targetUrl) && <a className="secondary" href={safeHttpHref(item.targetUrl)} target="_blank" rel="noreferrer">Apri pagina da verificare</a>}
          {item.status === "preview" && <>
            <ol className="workflow-instructions"><li>Confronta “Adesso sul sito” con “Dopo la modifica”.</li><li>Se il risultato è corretto, premi “Applica questa modifica sul sito” e conferma. Verrà applicata solo questa proposta.</li><li>Apri Cronologia e ripristino per verificare il risultato.</li></ol>
            {readableCorrectionFields(item).map(field => <section className="correction-readable" key={field.field}><h4>{field.label}</h4>{seoFieldKind(field.field) && <p className="seo-character-counter">Dopo la modifica: <strong>{seoCharacterCount(field.after)} / {SEO_TEXT_LIMITS[seoFieldKind(field.field)]} caratteri</strong> · spazi e punteggiatura inclusi</p>}<div className="wp-live-diff"><section><strong>Adesso sul sito</strong><pre>{field.before}</pre></section><section><strong>Dopo la modifica</strong><pre>{field.after}</pre></section></div></section>)}
            <details><summary>Dettagli tecnici della modifica</summary><div className="wp-live-diff"><section><strong>Prima</strong><pre>{previewText(item.data.previewBefore)}</pre></section><section><strong>Dopo</strong><pre>{previewText(item.data.previewAfter)}</pre></section></div></details>
            <button data-seogrow-live="1" type="button" className="danger wp-live-apply-one" disabled={Boolean(applyingId) || conflicts.length > 0} onClick={() => applyOne(item)}><ShieldCheck />{applyingId === item.data.approvalToken ? "Applicazione…" : "Applica questa modifica sul sito"}</button>
          </>}
        </article>)}
      </div>}

      {message && <p className="integration-result wp-live-remediation-message" role="status">{message}</p>}
    </section>,
    target,
  );
}
