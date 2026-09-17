import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import { normalizeGdprResponse } from "./gdprResponseIntegrity.js";
import { normalizeSiteAnalysisResponse } from "./seoResponseIntegrity.js";
import { normalizeAuditEvidenceResponse } from "./auditEvidenceContract.js";
import { normalizeClientId } from "./reliabilityModel.js";

const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const scopedRequests = new Set();

const selectedClientId = () => {
  try { return normalizeClientId(JSON.parse(localStorage.getItem(SELECTED_CLIENT_KEY))); }
  catch { return null; }
};

const requestPath = (input) => {
  try {
    const raw = typeof input === "string" ? input : input?.url;
    return new URL(String(raw || ""), window.location.href).pathname;
  } catch { return String(input || "").split("?")[0]; }
};

export const isProjectScopedRequest = (input) => {
  const value = String(input || "");
  return [
    "/api/dataforseo/", "/api/geo/simulate", "/api/generate", "/api/audit",
    "/api/site-analysis", "/api/frontend/inspect", "/api/wordpress/",
  ].some((path) => value.includes(path));
};

const assertProjectStillSelected = (entry) => {
  if (!entry) return;
  const current = selectedClientId();
  if (entry.clientId && current === entry.clientId) return;
  const reason = new DOMException(entry.clientId ? "Progetto cambiato" : "Progetto non selezionato", "AbortError");
  if (!entry.controller.signal.aborted) entry.controller.abort(reason);
  throw reason;
};

if (typeof window !== "undefined" && !window.__seogrowProjectAbortInstalled) {
  window.__seogrowProjectAbortInstalled = true;
  window.addEventListener("seogrow-storage-ok", (event) => {
    if (event?.detail?.key !== SELECTED_CLIENT_KEY) return;
    const current = selectedClientId();
    for (const entry of [...scopedRequests]) {
      if (!entry.clientId || entry.clientId !== current)
        entry.controller.abort(new DOMException("Progetto cambiato", "AbortError"));
    }
  });
}

const compactStructuredRemediationContext = (context) => {
  try {
    const parsed = JSON.parse(context);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const page = parsed.page && typeof parsed.page === "object" ? parsed.page : {};
    const compact = (value, max) => {
      const text = String(value ?? "");
      if (text.length <= max) return text;
      const head = Math.floor(max * 0.72);
      const tail = max - head;
      return `${text.slice(0, head)}\n[...contenuto ridotto automaticamente da SeoGrow...]\n${text.slice(-tail)}`;
    };
    return JSON.stringify({ ...parsed, page: { ...page, title: compact(page.title, 1000), excerpt: compact(page.excerpt, 1600), content: compact(page.content, 7000) } });
  } catch { return null; }
};

export const trimGenerateContext = (body) => {
  if (typeof body !== "string") return body;
  try {
    const payload = JSON.parse(body);
    if (!payload || typeof payload !== "object" || typeof payload.context !== "string") return body;
    const maxContext = 10_500;
    if (payload.context.length <= maxContext) return body;
    if (/^Remediation WordPress\s+(?:title|content|excerpt|h1)$/i.test(String(payload.topic || ""))) {
      const compactContext = compactStructuredRemediationContext(payload.context);
      if (compactContext) { payload.context = compactContext; return JSON.stringify(payload); }
    }
    const headLength = 8_500;
    const tailLength = 1_500;
    payload.context = `${payload.context.slice(0, headLength)}\n\n[...contenuto ridotto automaticamente da SeoGrow per rispettare il limite AI...]\n\n${payload.context.slice(-tailLength)}`;
    return JSON.stringify(payload);
  } catch { return body; }
};

const wordpressSiteUrlFromUi = () => {
  if (typeof document === "undefined") return "";
  return document.querySelector(".audit-unified-credentials input[autocomplete='url']")?.value?.trim() || "";
};

export const withExplicitWordPressSiteUrl = (path, init) => {
  if (path !== "/api/wordpress/inspect-fast" || String(init?.method || "GET").toUpperCase() !== "POST" || typeof init?.body !== "string") return init;
  try {
    const payload = JSON.parse(init.body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.siteUrl) return init;
    const siteUrl = wordpressSiteUrlFromUi();
    if (!siteUrl) return init;
    return { ...init, body: JSON.stringify({ ...payload, siteUrl }) };
  } catch { return init; }
};

export const apiTimeoutMs = (input) => {
  const value = String(input || "");
  if (value.includes("/api/dataforseo/")) return 960_000;
  if (value.includes("/api/wordpress/elementor-coverage-attest")) return 420_000;
  if (value.includes("/api/site-analysis")) return 210_000;
  return 120_000;
};

const pageAuditUrl = (init) => {
  try { return JSON.parse(init?.body || "{}").url || ""; }
  catch { return ""; }
};

const responseFromJson = (source, data) => {
  const headers = new Headers(source.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status: source.status, statusText: source.statusText, headers });
};

async function supplementPageAudit(response, init, signal) {
  if (!response?.ok) return response;
  let data;
  try { data = await response.clone().json(); }
  catch { return response; }
  const url = data?.url || pageAuditUrl(init);
  if (!url || data?.legalOnly) return response;
  try {
    const inspectionResponse = await apiFetch("/api/frontend/inspect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });
    const inspection = await inspectionResponse.json();
    if (!inspectionResponse.ok) throw new Error(inspection.error || "Ispezione frontend non riuscita");
    const issues = Array.isArray(data.issues) ? [...data.issues] : [];
    const reviewItems = Array.isArray(data.reviewItems) ? [...data.reviewItems] : [];
    if (inspection.pageKind === "content" && Number(inspection.words) >= 300 && Number(inspection.h2) === 0) {
      issues.push({
        type: "h2",
        severity: "bassa",
        label: "Nessun H2 rilevato",
        sourceUrl: inspection.url || url,
        observedValue: "0 H2 visibili",
        detail: `Pagina di contenuto con ${inspection.words} parole visibili senza sottotitoli H2.`,
      });
    }
    if (inspection.noindex) {
      reviewItems.push({
        type: "indexability",
        severity: "bassa",
        label: "Pagina impostata noindex",
        sourceUrl: inspection.url || url,
        observedValue: [inspection.robots, inspection.googlebot, inspection.xRobotsTag].filter(Boolean).join(" · ") || "noindex",
        detail: "Direttiva noindex osservata nell'HTML pubblico o nelle intestazioni HTTP.",
        diagnosisState: "needs-confirmation",
        evidenceNature: "observed-signal",
        reviewReason: "Il noindex può essere intenzionale: verificare intento, sitemap e link interni prima di modificarlo.",
      });
    }
    return responseFromJson(response, {
      ...data,
      h2: Number(inspection.h2) || 0,
      noindex: Boolean(inspection.noindex),
      robots: inspection.robots || "",
      xRobotsTag: inspection.xRobotsTag || "",
      canonicalCount: Number(inspection.canonicalCount) || 0,
      frontendEvidence: {
        source: "HTML pubblico",
        url: inspection.url || url,
        status: inspection.status,
        visibilityModel: inspection.visibilityModel,
        visibilityConfidence: inspection.visibilityConfidence,
      },
      auditCoverage: { ...(data.auditCoverage || {}), frontend: "observed" },
      issues,
      reviewItems,
    });
  } catch (error) {
    return responseFromJson(response, {
      ...data,
      auditCoverage: { ...(data.auditCoverage || {}), frontend: "unavailable" },
      auditCoverageWarning: error instanceof Error ? error.message : "Ispezione frontend non disponibile",
    });
  }
}

export async function apiFetch(input, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const attempts = method === "GET" ? 2 : 1;
  let lastError;
  const inputText = String(input || "");
  const path = requestPath(input);
  const generatedInit = inputText.includes("/api/generate") ? { ...init, body: trimGenerateContext(init.body) } : init;
  const preparedInit = withExplicitWordPressSiteUrl(path, generatedInit);
  const projectScoped = isProjectScopedRequest(inputText);
  const projectController = projectScoped ? new AbortController() : null;
  const scopeEntry = projectController ? { controller: projectController, clientId: selectedClientId() } : null;
  if (scopeEntry) scopedRequests.add(scopeEntry);

  try {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutMs = apiTimeoutMs(inputText);
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      const signals = [controller.signal];
      if (preparedInit.signal) signals.push(preparedInit.signal);
      if (projectController) signals.push(projectController.signal);
      const removeListeners = [];
      const signal = (() => {
        if (signals.length === 1) return signals[0];
        if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
        const combined = new AbortController();
        const abort = (event) => combined.abort(event?.target?.reason);
        for (const item of signals) {
          if (item.aborted) { combined.abort(item.reason); break; }
          item.addEventListener("abort", abort, { once: true });
          removeListeners.push(() => item.removeEventListener("abort", abort));
        }
        return combined.signal;
      })();
      try {
        assertProjectStillSelected(scopeEntry);
        if (signal.aborted) throw signal.reason || new DOMException("Richiesta annullata", "AbortError");
        let response = await window.fetch(input, { ...preparedInit, signal });
        if (attempt + 1 < attempts && [502, 503, 504].includes(response.status)) {
          await response.body?.cancel();
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          continue;
        }
        if (path === "/api/audit") response = await supplementPageAudit(response, preparedInit, signal);
        const auditResponse = ["/api/audit", "/api/site-analysis"].includes(path)
          ? await normalizeSiteAnalysisResponse(response)
          : response;
        const integrityResponse = ["/api/audit", "/api/site-analysis"].includes(path)
          ? await normalizeAuditEvidenceResponse(auditResponse)
          : auditResponse;
        const normalized = await normalizeGdprResponse(integrityResponse, path, preparedInit);
        assertProjectStillSelected(scopeEntry);
        return normalized;
      } catch (error) {
        lastError = error;
        if (attempt + 1 >= attempts || preparedInit.signal?.aborted || projectController?.signal.aborted)
          throw new Error(
            error.name === "AbortError"
              ? projectController?.signal.aborted
                ? "Richiesta annullata perché hai cambiato progetto."
                : preparedInit.signal?.aborted
                  ? "Richiesta annullata."
                  : "La richiesta ha superato il tempo massimo. Riprova."
              : error.message,
            { cause: error },
          );
      } finally {
        window.clearTimeout(timeout);
        for (const remove of removeListeners) remove();
      }
    }
    throw lastError;
  } finally {
    if (scopeEntry) scopedRequests.delete(scopeEntry);
  }
}
