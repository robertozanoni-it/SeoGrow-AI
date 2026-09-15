import { applyJournaledCorrection } from "./correctionJournal.js";
import { correctionCredentials } from "./correctionCredentials.js";
import { workspaceStorage } from "./workspaceDatabase.js";
import { apiFetch } from "./api.js";
import { brokenExternalTarget, prepareElementorBrokenExternalLink, removeExactAnchor } from "./brokenLinkRemediation.js";
import { elementorOwnershipDetail } from "./elementorImpactClient.js";
import { remediationContextDecision } from "./remediationPlanSafety.js";
import { assessCoreOwnership, chooseElementorContentCandidate, countTextWords, inspectEditableElementor, serializeElementor } from "./wordpressOwnership.js";

const issueText = (issue) => `${issue?.type || ""} ${issue?.label || ""} ${issue?.detail || ""}`.toLowerCase();
const contentCandidatePreview = (value, max = 260) => {
  const text = String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const isNonEditableWordPressUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (/\/(?:category|categoria|tag|author|autore|date|feed)(?:\/|$)/i.test(path)) return true;
    if (/\/page\/\d+$/i.test(path) || /\/(?:search)(?:\/|$)/i.test(path)) return true;
    return ["s", "cat", "tag", "paged", "author", "feed"].some((key) => url.searchParams.has(key));
  } catch { return true; }
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

export const preparationFailure = (error) => {
  const message = error instanceof Error ? error.message : "Preparazione correzione non riuscita.";
  const code = String(error?.code || "");
  if (code === "CONTENT_WIDGET_SELECTION_REQUIRED") return {
    status: "selection_required",
    category: "selection",
    reason: message,
    contentCandidates: Array.isArray(error?.contentCandidates) ? error.contentCandidates : [],
  };
  if (/AI_OUTPUT_|AI_INVALID_RESPONSE|AI_PROVIDER_ERROR|AI_REFUSAL/.test(code)) return { status: "generation_error", category: "generation", reason: message };
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

export async function inspectWordPress(targetUrl, credentials) {
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
    const message = data.error || "Ispezione WordPress non riuscita.";
    const error = new Error(message);
    error.code = response.status === 401 || response.status === 403
      ? "AUTH"
      : /nessuna pagina o articolo wordpress trovato/i.test(message)
        ? "NON_EDITABLE_RESOURCE"
        : "INSPECT";
    throw error;
  }
  return data;
}

export async function inspectFrontend(targetUrl) {
  const response = await apiFetch("/api/frontend/inspect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ispezione frontend non riuscita.");
  return data;
}

export async function inspectLinkEvidence(sourceUrl, targetUrl) {
  const response = await apiFetch("/api/frontend/link-evidence", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceUrl, targetUrl }), cache: "no-store",
  });
  const evidence = await response.json();
  if (!response.ok || evidence.ok !== true) throw Object.assign(new Error(evidence.error || "Verifica attuale del link non disponibile."), { code: "LINK_EVIDENCE_UNAVAILABLE" });
  return evidence;
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

async function generateCorePatch(kind, issue, entity, targetUrl, contentOverride, remediationMeasurement, manualValue) {
  const response = await apiFetch("/api/wordpress/generate-patch-v2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(manualValue !== undefined ? { manualValue } : {}),
      topic: `Remediation WordPress ${kind}`,
      context: JSON.stringify({ issue, page: pageContext(entity, targetUrl, contentOverride, remediationMeasurement) }),
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.content) {
    const error = new Error(data.error || "Generazione patch non riuscita.");
    error.code = data.code || "GENERATION_FAILED";
    error.quality = data.quality || null;
    error.candidate = data.candidate || "";
    throw error;
  }
  const parsed = data.changes ? { changes: data.changes } : JSON.parse(String(data.content));
  if (!parsed?.changes || typeof parsed.changes !== "object") throw new Error("La patch WordPress è vuota.");
  return { changes: parsed.changes, quality: data.quality || null };
}

async function generateSeoValue(kind, issue, entity, targetUrl, manualValue) {
  const response = await apiFetch("/api/wordpress/generate-seo-value-v2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, issue, page: pageContext(entity, targetUrl), ...(manualValue !== undefined ? { manualValue } : {}) }),
  });
  const data = await response.json();
  if (!response.ok || !data.value || data.publishable !== true) {
    const error = new Error(data.error || "La proposta SEO richiede revisione editoriale e non può essere approvata automaticamente.");
    error.code = data.code || "EDITORIAL_REVIEW_REQUIRED";
    error.quality = data.quality || null;
    error.candidate = data.candidate || "";
    throw error;
  }
  return { value: String(data.value).trim(), quality: data.quality || null };
}

async function chooseVerifiedElementorContentWidget(targetUrl, state, selectedWidgetId = "") {
  if (state.widgets.length > 8) throw ownershipUndetermined("content", "La pagina contiene più di 8 text-editor Elementor candidati; serve selezione assistita prima di modificare.");
  const probes = await Promise.all(state.widgets.map((widget) => verifyFrontend(targetUrl, { content: widget.value })));
  const selected = chooseElementorContentCandidate(state.widgets, probes);
  const explicitId = String(selectedWidgetId || "").trim();
  if (explicitId) {
    const explicit = (selected.candidates || []).find((candidate) => candidate.id === explicitId);
    if (!explicit) throw ownershipUndetermined("content", "Il blocco Elementor scelto non è più verificato nel frontend corrente. Riapri la selezione e scegli un candidato ancora valido.");
    return explicit;
  }
  if (selected.candidate) return selected.candidate;
  if ((selected.candidates || []).length > 1) {
    const error = new Error(selected.reason);
    error.code = "CONTENT_WIDGET_SELECTION_REQUIRED";
    error.contentCandidates = selected.candidates.map((candidate) => ({
      id: candidate.id,
      words: candidate.words,
      preview: contentCandidatePreview(candidate.value),
    }));
    throw error;
  }
  throw ownershipUndetermined("content", selected.reason);
}

async function elementorPlan(kind, issue, entity, targetUrl, state, frontend, options = {}) {
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
    const selected = await chooseVerifiedElementorContentWidget(targetUrl, state, options.contentWidgetId);
    const previous = selected.item.settings.editor;
    const measurement = contentMeasurement(frontend, previous);
    let generated;
    try { generated = await generateCorePatch("content", issue, entity, targetUrl, previous, measurement, options.manualValue); }
    catch (error) { error.manualOriginal = previous; error.contentWidgetId = selected.id; throw error; }
    if (typeof generated.changes?.content !== "string" || !generated.changes.content.trim() || generated.changes.content === previous) return null;
    selected.item.settings.editor = generated.changes.content;
    return {
      adapter: "Elementor single text-editor",
      changes: { meta: { _elementor_data: serializeElementor(state.parsed) } },
      quality: generated.quality,
      contentWidget: {
        id: selected.id,
        beforeWords: selected.words,
        beforePreview: contentCandidatePreview(previous),
      },
    };
  }
  return null;
}

export async function buildPlan(kind, issue, inspected, targetUrl, frontendContext, options = {}) {
  const entity = inspected.entity || {};
  const contextDecision = remediationContextDecision(issue, frontendContext || {}, targetUrl);
  if (!contextDecision.allowed) {
    const error = new Error(contextDecision.reason);
    error.code = contextDecision.code;
    throw error;
  }

  if (kind === "external_link") {
    const brokenUrl = brokenExternalTarget(issue);
    if (!brokenUrl) {
      const error = new Error("Il problema non contiene una destinazione esterna 404 valida da correggere.");
      error.code = "BROKEN_LINK_TARGET_MISSING";
      throw error;
    }

    const elementorRaw = pluginMeta(entity)._elementor_data;
    const elementor = prepareElementorBrokenExternalLink(elementorRaw, brokenUrl, options.linkCleanupMode);
    const evidence = options.linkEvidence;
    if (evidence && (evidence.targetUrl !== brokenUrl || evidence.requestedSourceUrl !== new URL(targetUrl).href)) throw ownershipUndetermined("external_link", "L’evidenza appartiene a una pagina o destinazione diversa: ricontrolla questo singolo problema.");
    const localAbsent = elementor.state === "valid" ? elementor.count === 0 : elementor.state === "absent" && typeof entity?.content?.raw === "string" && removeExactAnchor(entity.content.raw, brokenUrl, "unlink-preserve-text").count === 0;
    if (localAbsent && evidence?.verificationSafe === true && evidence?.scanComplete === true && evidence?.occurrenceCount === 0) return { alreadyResolved: true, linkResolution: "absent-confirmed", reason: "Link non più presente nel documento WordPress e nell’HTML pubblico ricontrollato. Nessuna modifica necessaria. Aggiorna l’audit per riallineare l’elenco dei problemi." };
    if (evidence && (evidence.verificationSafe !== true || evidence.occurrenceCount !== 1)) throw ownershipUndetermined("external_link", "La verifica attuale non conferma una singola occorrenza pubblica modificabile. Rileggi la pagina prima di scrivere.");
    if (elementor.state === "invalid") {
      throw ownershipUndetermined("external_link", "_elementor_data non è leggibile in modo strutturato: il link non viene modificato.");
    }
    if (elementor.state === "valid" && elementor.count > 1) {
      throw ownershipUndetermined("external_link", `La destinazione 404 compare ${elementor.count} volte nel documento Elementor. Serve scegliere esplicitamente quale collegamento rimuovere.`);
    }
    if (elementor.state === "valid" && elementor.count === 1) {
      return {
        adapter: "Elementor link cleanup",
        changes: { meta: { _elementor_data: elementor.serialized } },
        quality: null,
        linkCleanup: {
          targetUrl: brokenUrl,
          action: elementor.action,
          anchorText: elementor.anchors[0] || "",
        },
      };
    }
    if (elementor.state === "valid") {
      throw ownershipUndetermined("external_link", "La pagina usa Elementor ma la destinazione 404 non è presente nel documento locale. Potrebbe provenire da un template condiviso; il fallback su post_content è bloccato.");
    }

    const coreContent = entity?.content?.raw || "";
    const core = removeExactAnchor(coreContent, brokenUrl, options.linkCleanupMode);
    if (core.count > 1) {
      throw ownershipUndetermined("external_link", `La destinazione 404 compare ${core.count} volte in post_content. Serve scegliere esplicitamente quale collegamento rimuovere.`);
    }
    if (core.count === 1) {
      return {
        adapter: "WordPress core link cleanup",
        changes: { content: core.value },
        quality: null,
        linkCleanup: {
          targetUrl: brokenUrl,
          action: core.action,
          anchorText: core.anchors[0] || "",
        },
      };
    }
    throw ownershipUndetermined("external_link", "La destinazione 404 non compare in una sorgente WordPress locale modificabile. Nessun collegamento viene rimosso automaticamente.");
  }

  if (["content", "h1"].includes(kind)) {
    const ownership = await verifyCoreOwnership(kind, targetUrl, inspected);
    const resolvedReason = alreadyResolvedReason(kind, issue, ownership);
    if (resolvedReason) return { alreadyResolved: true, reason: resolvedReason };
    const elementorState = inspectEditableElementor(kind, entity);
    if (elementorState.state === "invalid") throw ownershipUndetermined(kind, "_elementor_data è presente ma non è strutturato in modo valido e sicuro.");
    if (elementorState.state === "valid" && elementorState.widgets.length > 0) {
      const elementor = await elementorPlan(kind, issue, entity, targetUrl, elementorState, ownership.frontend, options);
      if (elementor) return elementor;
      throw ownershipUndetermined(kind, "Sono presenti widget Elementor pertinenti, ma non è stato possibile preparare una modifica senza ambiguità. Il fallback su post_content è bloccato.");
    }
    if (elementorState.state === "valid" && elementorState.hasDocument) {
      throw ownershipUndetermined(kind, `${elementorOwnershipDetail(entity)} Il fallback su post_content è bloccato.`);
    }
    if (ownership.ok) {
      const coreContent = entity?.content?.raw || entity?.content?.rendered || "";
      const generated = await generateCorePatch(kind, issue, entity, targetUrl, undefined, kind === "content" ? contentMeasurement(ownership.frontend, coreContent) : undefined, options.manualValue);
      return { adapter: "WordPress core", ...generated };
    }
    throw ownershipUndetermined(kind, "La verifica frontend non dimostra che post_content sia la sorgente principale della pagina.");
  }

  if (kind === "title") {
    const seoPlugin = metaKey(entity, "title");
    if (seoPlugin) {
      const generated = await generateSeoValue("seo_title", issue, entity, targetUrl, options.manualValue);
      return { adapter: seoPlugin[1], changes: { meta: { [seoPlugin[0]]: generated.value } }, quality: generated.quality };
    }
    const ownership = await verifyCoreOwnership(kind, targetUrl, inspected);
    const resolvedReason = alreadyResolvedReason(kind, issue, ownership);
    if (resolvedReason) return { alreadyResolved: true, reason: resolvedReason };
    if (ownership.ok) {
      const generated = await generateCorePatch(kind, issue, entity, targetUrl, undefined, undefined, options.manualValue);
      return { adapter: "WordPress core", ...generated };
    }
    const plugin = metaKey(entity, "title");
    if (!plugin) throw new Error("Il title SEO è gestito dal frontend ma Rank Math/Yoast non espongono un campo REST scrivibile per questa pagina.");
    const generated = await generateSeoValue("seo_title", issue, entity, targetUrl, options.manualValue);
    return { adapter: plugin[1], changes: { meta: { [plugin[0]]: generated.value } }, quality: generated.quality };
  }

  if (kind === "excerpt") {
    const generated = await generateCorePatch("excerpt", issue, entity, targetUrl, undefined, undefined, options.manualValue);
    return { adapter: "WordPress core", ...generated };
  }

  if (kind === "meta_description") {
    const plugin = metaKey(entity, kind);
    if (!plugin) throw new Error("Rank Math/Yoast non espongono la meta description come campo REST scrivibile per questa pagina.");
    const generated = await generateSeoValue("meta_description", issue, entity, targetUrl, options.manualValue);
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

export const flattenState = (state, fields) => {
  const flat = {};
  for (const field of fields || []) {
    if (field.startsWith("meta.")) flat[field] = state?.meta?.[field.slice(5)];
    else flat[field] = state?.[field];
  }
  return flat;
};

export function createWordPressCorrection(item, credentials, batchId, correctionId = "") {
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
      return {
        id: correctionId || `correction-${crypto.randomUUID()}`,
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
}

export async function applyPreparedCorrection(pendingRecord, preview, credentials, assertContext = async () => {}) {
  const write = async () => {
    await assertContext();
      return await applyJournaledCorrection(pendingRecord, async () => {
        await assertContext();
        correctionCredentials(pendingRecord, {
          clientId: Number(JSON.parse(workspaceStorage.getItem("seogrow-selected-client-v1") || "null")),
          siteUrl: credentials.url, username: credentials.username, applicationPassword: credentials.applicationPassword,
        });
        const response = await apiFetch("/api/wordpress/live-apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ approvalToken: preview.approvalToken, username: credentials.username, applicationPassword: credentials.applicationPassword }),
        });
        const applied = await response.json();
        if (!response.ok || applied.ok !== true) {
          const error = new Error(applied.error || "Applicazione live non riuscita.");
          error.code = applied.code || "APPLY_FAILED";
          throw error;
        }
        return {
          adapter: applied.adapter || pendingRecord.adapter,
          before: flattenState(applied.before, applied.changed || pendingRecord.fields),
          after: flattenState(applied.after, applied.changed || pendingRecord.fields),
          rollbackChanges: applied.before,
        };
      });
  };
  const locks = globalThis.navigator?.locks;
  if (!locks?.request) throw Object.assign(new Error("Lock risorsa non disponibile: scrittura bloccata."), { definitelyNoWrite: true });
  const site = new URL(pendingRecord.siteUrl).href.replace(/\/+$/, "");
  return locks.request(`seogrow-write:${site}:${pendingRecord.resource}:${pendingRecord.entityId}`, { ifAvailable: true }, async lock => {
    if (!lock) throw Object.assign(new Error("Una scrittura su questa risorsa è già in corso."), { code: "RESOURCE_LOCKED", definitelyNoWrite: true });
    return write();
  });
}
