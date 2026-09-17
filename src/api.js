import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import { normalizeGdprResponse } from "./gdprResponseIntegrity.js";
import { normalizeSiteAnalysisResponse } from "./seoResponseIntegrity.js";
import { normalizeClientId } from "./reliabilityModel.js";
import {
  buildEditorialProjectContext,
  serializeEditorialProjectContext,
} from "./modules/content/index.js";

const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const scopedRequests = new Set();

const selectedClientId = () => {
  try {
    return normalizeClientId(JSON.parse(localStorage.getItem(SELECTED_CLIENT_KEY)));
  } catch {
    return null;
  }
};

const readWorkspaceJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const clientScopedValue = (store, clientId, fallback = null) =>
  store?.[clientId] ?? store?.[String(clientId)] ?? fallback;

const latestByDate = (value, fields) => {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return [...rows].toSorted((left, right) => {
    const leftAt = fields.map((field) => Date.parse(left?.[field] || "") || 0).find(Boolean) || 0;
    const rightAt = fields.map((field) => Date.parse(right?.[field] || "") || 0).find(Boolean) || 0;
    return rightAt - leftAt;
  })[0] || null;
};

const isWordPressRemediationGenerate = (topic) => /^Remediation WordPress\b/i.test(String(topic || "").trim());

export const prepareEditorialGenerateBody = (body) => {
  if (typeof body !== "string") return body;
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return body;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || isWordPressRemediationGenerate(payload.topic)) return body;

  const clientId = selectedClientId();
  if (!clientId) {
    const error = new Error("Generazione bloccata: seleziona un progetto prima di creare contenuti.");
    error.code = "PROJECT_CONTEXT_REQUIRED";
    throw error;
  }
  const clients = readWorkspaceJson("seogrow-clients", []);
  const client = Array.isArray(clients) ? clients.find((item) => normalizeClientId(item?.id) === clientId) : null;
  if (!client) {
    const error = new Error("Generazione bloccata: il progetto selezionato non è disponibile nel workspace.");
    error.code = "PROJECT_CONTEXT_REQUIRED";
    throw error;
  }

  let incoming = null;
  try {
    incoming = typeof payload.context === "string" ? JSON.parse(payload.context) : payload.context;
  } catch {
    incoming = null;
  }
  const workflowContext = incoming?.taskOrigine && typeof incoming.taskOrigine === "object"
    ? {
        taskId: incoming.taskOrigine.id,
        title: incoming.taskOrigine.titolo,
        query: incoming.taskOrigine.query,
        sourceUrl: incoming.taskOrigine.pagina,
        targetUrl: incoming.taskOrigine.destinazione,
      }
    : incoming?.workflow || null;

  const gscStore = readWorkspaceJson("seogrow-gsc-v1", {});
  const analysesStore = readWorkspaceJson("seogrow-analyses-v2", {});
  const rankingsStore = readWorkspaceJson("seogrow-rankings-v1", {});
  const topicalStore = readWorkspaceJson("seogrow-topical-maps-v1", {});
  const analysis = latestByDate(clientScopedValue(analysesStore, clientId, []), ["analyzedAt", "startedAt"]);
  const ranking = latestByDate(clientScopedValue(rankingsStore, clientId, []), ["checkedAt"]);
  const context = buildEditorialProjectContext({
    client,
    dataset: clientScopedValue(gscStore, clientId, null),
    analysis,
    rankings: ranking,
    topicalMap: clientScopedValue(topicalStore, clientId, null),
    workflowContext,
    planItem: incoming?.selected || null,
  });
  payload.context = serializeEditorialProjectContext(context);
  return JSON.stringify(payload);
};

const requestPath = (input) => {
  try {
    const raw = typeof input === "string" ? input : input?.url;
    return new URL(String(raw || ""), window.location.href).pathname;
  } catch {
    return String(input || "").split("?")[0];
  }
};

export const isProjectScopedRequest = (input) => {
  const value = String(input || "");
  return [
    "/api/dataforseo/",
    "/api/geo/simulate",
    "/api/generate",
    "/api/audit",
    "/api/site-analysis",
    "/api/frontend/inspect",
    "/api/wordpress/",
  ].some((path) => value.includes(path));
};

const assertProjectStillSelected = (entry) => {
  if (!entry) return;
  const current = selectedClientId();
  if (entry.clientId && current === entry.clientId) return;
  const reason = new DOMException(
    entry.clientId ? "Progetto cambiato" : "Progetto non selezionato",
    "AbortError",
  );
  if (!entry.controller.signal.aborted) entry.controller.abort(reason);
  throw reason;
};

if (typeof window !== "undefined" && !window.__seogrowProjectAbortInstalled) {
  window.__seogrowProjectAbortInstalled = true;
  window.addEventListener("seogrow-storage-ok", (event) => {
    if (event?.detail?.key !== SELECTED_CLIENT_KEY) return;
    const current = selectedClientId();
    for (const entry of [...scopedRequests]) {
      if (!entry.clientId || entry.clientId !== current) {
        entry.controller.abort(new DOMException("Progetto cambiato", "AbortError"));
      }
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
    return JSON.stringify({
      ...parsed,
      page: {
        ...page,
        title: compact(page.title, 1000),
        excerpt: compact(page.excerpt, 1600),
        content: compact(page.content, 7000),
      },
    });
  } catch {
    return null;
  }
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
      if (compactContext) {
        payload.context = compactContext;
        return JSON.stringify(payload);
      }
    }

    const headLength = 8_500;
    const tailLength = 1_500;
    payload.context = `${payload.context.slice(0, headLength)}\n\n[...contenuto ridotto automaticamente da SeoGrow per rispettare il limite AI...]\n\n${payload.context.slice(-tailLength)}`;
    return JSON.stringify(payload);
  } catch {
    return body;
  }
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
  } catch {
    return init;
  }
};

export const apiTimeoutMs = (input) => {
  const value = String(input || "");
  if (value.includes("/api/dataforseo/")) return 960_000;
  if (value.includes("/api/wordpress/elementor-coverage-attest")) return 420_000;
  if (value.includes("/api/site-analysis")) return 210_000;
  return 120_000;
};

export async function apiFetch(input, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const attempts = method === "GET" ? 2 : 1;
  let lastError;
  const inputText = String(input || "");
  const path = requestPath(input);
  const generatedInit = inputText.includes("/api/generate")
    ? { ...init, body: trimGenerateContext(prepareEditorialGenerateBody(init.body)) }
    : init;
  const preparedInit = withExplicitWordPressSiteUrl(path, generatedInit);
  const projectScoped = isProjectScopedRequest(inputText);
  const projectController = projectScoped ? new AbortController() : null;
  const scopeEntry = projectController
    ? { controller: projectController, clientId: selectedClientId() }
    : null;
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
        const response = await window.fetch(input, { ...preparedInit, signal });
        if (attempt + 1 < attempts && [502, 503, 504].includes(response.status)) {
          await response.body?.cancel();
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          continue;
        }
        const integrityResponse = path === "/api/site-analysis"
          ? await normalizeSiteAnalysisResponse(response)
          : response;
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
