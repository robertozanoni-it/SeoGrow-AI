import dns from "node:dns/promises";
import http from "node:http";
import { publicHeadMetadata } from "./publicHeadMetadata.js";
import { pinnedHttpsFetch } from "./pinnedHttpsFetch.js";
import { isPrivateOrReservedAddress } from "./networkSafety.js";
import { isLegalPage } from "../src/modules/audit/data.js";

const INSTALL_KEY = Symbol.for("seogrow.auditTraceabilityDecorator");
const OBSERVATION_KEY = Symbol.for("seogrow.auditTraceObservation");
const PAGE_ROUTE = "/api/audit";
const SITE_ROUTE = "/api/site-analysis";
const PROGRESS_ROUTE = "/api/analysis-progress/:id";
const MAX_PAGE_LINK_CHECKS = 80;
const MAX_SITE_H2_PAGES = 200;
const progress = new Map();

const validProgressId = (value) => typeof value === "string" && /^[a-zA-Z0-9-]{20,80}$/.test(value);
const timestamp = () => new Date().toISOString();
const clean = (value) => String(value || "").trim();
const cleanLower = (value) => clean(value).toLocaleLowerCase("it");
const normalizedUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return String(value || "").trim();
  }
};

function setProgress(id, value) {
  if (!validProgressId(id)) return;
  const now = Date.now();
  for (const [key, item] of progress) if (now - Number(item.updatedAt || 0) > 60 * 60_000) progress.delete(key);
  progress.set(id, {
    ...value,
    done: Math.max(0, Number(value?.done) || 0),
    total: Math.max(0, Number(value?.total) || 0),
    updatedAt: now,
    observed: true,
  });
}

function routeStack(app) {
  return app?.router?.stack || app?._router?.stack || [];
}

function matchingRouteLayers(app, path, method) {
  const wantedMethod = String(method || "get").toLowerCase();
  return routeStack(app).filter((layer) =>
    layer?.route?.path === path && layer?.route?.methods?.[wantedMethod],
  );
}

function wrapLastHandler(app, path, method, makeWrapper) {
  const layers = matchingRouteLayers(app, path, method);
  if (!layers.length) throw new Error(`Route Audit non trovata: ${method.toUpperCase()} ${path}`);
  for (const layer of layers) {
    const handlers = Array.isArray(layer.route?.stack) ? layer.route.stack : [];
    const target = [...handlers].reverse().find((item) => typeof item?.handle === "function");
    if (!target) throw new Error(`Handler Audit non trovato: ${method.toUpperCase()} ${path}`);
    const original = target.handle;
    target.handle = makeWrapper(original);
  }
}

function assertPublicAddressList(addresses) {
  if (!addresses.length || addresses.some((item) => isPrivateOrReservedAddress(item.address))) {
    throw new Error("Indirizzo remoto non pubblico.");
  }
}

async function pinnedHttpFetch(input, options = {}) {
  const url = input instanceof URL ? new URL(input.href) : new URL(String(input || ""));
  if (url.protocol !== "http:") throw new Error("Endpoint HTTP non valido.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".local")) {
    throw new Error("Indirizzo locale non consentito.");
  }
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  assertPublicAddressList(addresses);
  const target = addresses[0];
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set("host", url.host);
  const maxBytes = Number(options.maxBytes || 8 * 1024 * 1024);

  return await new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.address,
      family: target.family,
      port: url.port ? Number(url.port) : 80,
      path: `${url.pathname}${url.search}`,
      method,
      headers: Object.fromEntries(headers.entries()),
    }, (response) => {
      response.on("error", reject);
      response.on("aborted", () => reject(new Error("Risposta remota interrotta.")));
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new Error("Risposta remota troppo grande."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item));
          else if (value != null) responseHeaders.set(name, String(value));
        }
        try {
          const withoutBody = method === "HEAD" || [204, 205, 304].includes(response.statusCode);
          resolve(new Response(withoutBody ? null : Buffer.concat(chunks), {
            status: response.statusCode || 500,
            statusText: response.statusMessage || "",
            headers: responseHeaders,
          }));
        } catch (error) {
          reject(error);
        }
      });
    });
    const abort = () => request.destroy(options.signal?.reason instanceof Error ? options.signal.reason : new Error("Richiesta annullata."));
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    request.setTimeout(Number(options.timeout || 15_000), () => request.destroy(new Error("Timeout richiesta remota.")));
    request.on("error", reject);
    request.on("close", () => options.signal?.removeEventListener?.("abort", abort));
    request.end();
  });
}

async function safeRequestOnce(url, options = {}) {
  const parsed = url instanceof URL ? new URL(url.href) : new URL(String(url || ""));
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Protocollo non valido.");
  const headers = {
    "user-agent": "seoGrowAI/1.4-audit-traceability",
    accept: "text/html,application/xhtml+xml,*/*;q=0.5",
    ...(options.headers || {}),
  };
  if (parsed.protocol === "https:") {
    const response = await pinnedHttpsFetch(parsed, { ...options, headers, redirect: "manual" });
    return { response, requestedUrl: parsed.href };
  }
  const response = await pinnedHttpFetch(parsed, { ...options, headers });
  return { response, requestedUrl: parsed.href };
}

async function safeAuditFetch(input, options = {}) {
  let current = new URL(String(input || ""));
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const { response } = await safeRequestOnce(current, options);
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: current.href };
    }
    const location = response.headers.get("location");
    if (!location) return { response, finalUrl: current.href };
    await response.body?.cancel?.().catch?.(() => undefined);
    current = new URL(location, current);
    if (!["http:", "https:"].includes(current.protocol)) throw new Error("Redirect con protocollo non valido.");
  }
  throw new Error("Troppi reindirizzamenti.");
}

function stripInertMarkup(value) {
  return String(value || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
}

function firstMatch(html, regex) {
  return String(html || "").match(regex)?.[1]?.replace(/\s+/g, " ").trim() || "";
}

function visibleWords(html) {
  return stripInertMarkup(html)
    .replace(/<(?:nav|footer|aside)\b[\s\S]*?<\/(?:nav|footer|aside)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function pageLinks(html, sourceUrl) {
  const cleaned = stripInertMarkup(html);
  const baseHref = firstMatch(cleaned, /<base\b[^>]*href=["']([^"']+)["']/i);
  let base = sourceUrl;
  try { if (baseHref) base = new URL(baseHref, sourceUrl).href; } catch { base = sourceUrl; }
  const links = [];
  for (const match of cleaned.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/gi)) {
    const href = (match[1] || match[2] || "").replaceAll("&amp;", "&").trim();
    if (!href || /^(?:#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    try {
      const target = new URL(href, base);
      target.hash = "";
      if (!["http:", "https:"].includes(target.protocol)) continue;
      links.push(target.href);
    } catch {
      // URL non riproducibile: non diventa una issue autonoma senza target verificabile.
    }
  }
  return [...new Set(links)];
}

function canonicalFromHtml(html, sourceUrl) {
  const raw = firstMatch(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
    firstMatch(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (!raw) return { raw: "", url: "", error: "" };
  try {
    const url = new URL(raw, sourceUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocollo non valido");
    return { raw, url: url.href, error: "" };
  } catch {
    return { raw, url: "", error: "Canonical non valida" };
  }
}

async function checkLinkStatus(url, signal) {
  try {
    let result = await safeAuditFetch(url, { method: "HEAD", timeout: 10_000, maxBytes: 1024, signal });
    if ([403, 405, 501].includes(result.response.status)) {
      result = await safeAuditFetch(url, { method: "GET", timeout: 10_000, maxBytes: 4096, signal, headers: { range: "bytes=0-1023" } });
    }
    return {
      url,
      status: result.response.status,
      finalUrl: result.finalUrl,
      temporary: result.response.status === 429 || result.response.status >= 500,
    };
  } catch (error) {
    return { url, status: null, finalUrl: "", temporary: true, error: error.message || String(error) };
  }
}

async function observePage(url, progressId, { checkLinks = true, signal } = {}) {
  const startedAt = timestamp();
  setProgress(progressId, { phase: "Download pagina", done: 0, total: 3, discovering: true });
  const { response, finalUrl } = await safeAuditFetch(url, { method: "GET", timeout: 15_000, maxBytes: 8 * 1024 * 1024, signal });
  const contentType = response.headers.get("content-type") || "";
  const html = /(?:text\/html|application\/xhtml\+xml)/i.test(contentType) ? await response.text() : "";
  setProgress(progressId, { phase: "Lettura HTML e intestazioni", done: 1, total: 3, discovering: true });

  const active = stripInertMarkup(html);
  const metadata = publicHeadMetadata(html);
  const canonical = canonicalFromHtml(html, finalUrl);
  const robots = firstMatch(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i) ||
    firstMatch(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["']/i);
  const xRobotsTag = response.headers.get("x-robots-tag") || "";
  const links = html ? pageLinks(html, finalUrl) : [];
  const selectedLinks = checkLinks ? links.slice(0, MAX_PAGE_LINK_CHECKS) : [];
  const observation = {
    requestedUrl: url,
    url: finalUrl,
    observedAt: timestamp(),
    startedAt,
    status: response.status,
    contentType,
    title: metadata.title || "",
    titleCount: Number(metadata.titleCount || 0),
    description: metadata.metaDescription || "",
    metaDescriptionCount: Number(metadata.metaDescriptionCount || 0),
    canonical,
    robots,
    xRobotsTag,
    noindex: /(?:noindex|\bnone\b)/i.test(`${robots} ${xRobotsTag}`),
    h1: (active.match(/<h1\b[^>]*>/gi) || []).length,
    h2: (active.match(/<h2\b[^>]*>/gi) || []).length,
    words: visibleWords(html),
    linksDiscovered: links.length,
    linksChecked: 0,
    linksTruncated: links.length > selectedLinks.length,
    linkResults: [],
  };
  setProgress(progressId, {
    phase: checkLinks && selectedLinks.length ? "Verifica link HTTP" : "Controlli SEO pagina",
    done: 2,
    total: 3 + selectedLinks.length,
    discovering: false,
  });

  if (selectedLinks.length) {
    let cursor = 0;
    let done = 0;
    const workers = Array.from({ length: Math.min(4, selectedLinks.length) }, async () => {
      while (cursor < selectedLinks.length) {
        const target = selectedLinks[cursor++];
        observation.linkResults.push(await checkLinkStatus(target, signal));
        done += 1;
        observation.linksChecked = done;
        setProgress(progressId, { phase: "Verifica link HTTP", done: 2 + done, total: 3 + selectedLinks.length, discovering: false });
      }
    });
    await Promise.all(workers);
  }
  return observation;
}

function severity(value) {
  const normalized = cleanLower(value);
  if (["alta", "high", "critical", "critica", "error"].includes(normalized)) return "alta";
  if (["bassa", "low", "info", "informativa"].includes(normalized)) return "bassa";
  return "media";
}

function severityRank(value) {
  return { alta: 3, media: 2, bassa: 1 }[severity(value)] || 0;
}

function inferType(issue = {}) {
  if (issue.type) return String(issue.type).trim().toLowerCase();
  const text = `${issue.label || ""} ${issue.title || ""}`.toLowerCase();
  if (/meta description/.test(text)) return "description";
  if (/title/.test(text)) return "title";
  if (/\bh1\b/.test(text)) return "h1";
  if (/\bh2\b/.test(text)) return "h2";
  if (/canonical/.test(text)) return "canonical";
  if (/noindex|robots/.test(text)) return "indexability";
  if (/404|410|http/.test(text)) return "http-status";
  if (/link/.test(text)) return "broken-link";
  return "audit";
}

function evidenceField(type) {
  if (/title/.test(type)) return "title";
  if (/description|meta/.test(type)) return "meta-description";
  if (/h1/.test(type)) return "h1";
  if (/h2/.test(type)) return "h2";
  if (/canonical/.test(type)) return "canonical";
  if (/index|robots/.test(type)) return "robots";
  if (/link/.test(type)) return "link-http-status";
  if (/http-status/.test(type)) return "http-status";
  if (/orphan/.test(type)) return "sitemap-and-link-graph";
  return "audit-observation";
}

function observedValue(issue, payload, observation) {
  const type = inferType(issue);
  if (/^title$|duplicate-title/.test(type)) return observation?.title ?? payload?.title ?? issue.detail ?? issue.label;
  if (/description/.test(type)) return observation?.description ?? payload?.description ?? issue.detail ?? issue.label;
  if (/^h1$/.test(type)) return observation?.h1 ?? payload?.h1 ?? issue.detail ?? issue.label;
  if (/^h2$/.test(type)) return observation?.h2 ?? issue.detail ?? issue.label;
  if (/canonical/.test(type)) return observation?.canonical?.url || observation?.canonical?.raw || payload?.canonical || issue.detail || issue.label;
  if (/index|robots/.test(type)) return [observation?.robots, observation?.xRobotsTag].filter(Boolean).join(" · ") || issue.detail || issue.label;
  if (/link/.test(type)) return `${issue.targetUrl || ""}${issue.observedStatus != null ? ` · HTTP ${issue.observedStatus}` : ""}`.trim() || issue.detail || issue.label;
  if (/http-status/.test(type)) return issue.observedStatus != null ? `HTTP ${issue.observedStatus}` : issue.detail || issue.label;
  return issue.detail || issue.label || "Osservazione Audit SeoGrow";
}

function issueKey(issue) {
  return [
    inferType(issue),
    normalizedUrl(issue.sourceUrl || issue.url || ""),
    normalizedUrl(issue.targetUrl || ""),
  ].join("::");
}

function sourceKind(type) {
  if (/link|http-status/.test(type)) return "http";
  if (/orphan|duplicate/.test(type)) return "derived";
  return "html";
}

function normalizeIssue(issue, payload, observation) {
  const type = inferType(issue);
  const sourceUrl = issue.sourceUrl || issue.url || observation?.url || payload?.url || "";
  const observedAt = issue.observedAt || observation?.observedAt || payload?.analyzedAt || payload?.fetchedAt || timestamp();
  const field = evidenceField(type);
  const value = observedValue(issue, payload, observation);
  const nature = sourceKind(type) === "derived" ? "derived" : "observed";
  const evidence = Array.isArray(issue.evidence) && issue.evidence.length
    ? issue.evidence
    : [{ source: sourceKind(type) === "http" ? "HTTP live" : sourceKind(type) === "derived" ? "Audit crawl + dataset" : "HTML live", field, observed: value, url: sourceUrl, at: observedAt, nature }];
  return {
    ...issue,
    type,
    severity: severity(issue.severity),
    label: issue.label || issue.title || type,
    url: issue.url || sourceUrl,
    sourceUrl,
    observedAt,
    auditCheck: type,
    reproducible: true,
    evidence,
    dataSource: {
      kind: sourceKind(type),
      source: evidence[0]?.source || "Audit SeoGrow",
      field,
      url: sourceUrl,
      observedAt,
    },
    dedupeKey: issueKey({ ...issue, type, sourceUrl }),
  };
}

function dedupeIssues(items, payload, observation) {
  const byKey = new Map();
  for (const raw of items || []) {
    if (!raw || typeof raw !== "object") continue;
    const normalized = normalizeIssue(raw, payload, observation);
    if (isLegalPage(normalized.sourceUrl || normalized.url) || (normalized.targetUrl && isLegalPage(normalized.targetUrl))) continue;
    const key = normalized.dedupeKey;
    const current = byKey.get(key);
    if (!current || severityRank(normalized.severity) > severityRank(current.severity)) byKey.set(key, normalized);
  }
  return [...byKey.values()];
}

function pageObservationIssues(observation) {
  if (!observation || isLegalPage(observation.url)) return [];
  const issues = [];
  if (observation.status >= 400) {
    issues.push({ type: "http-status", severity: [404, 410].includes(observation.status) ? "alta" : observation.status >= 500 || observation.status === 429 ? "media" : "alta", label: `Pagina restituisce HTTP ${observation.status}`, sourceUrl: observation.url, observedStatus: observation.status, detail: `La richiesta live ha restituito HTTP ${observation.status}.` });
  }
  if (observation.words >= 250 && observation.h2 === 0) {
    issues.push({ type: "h2", severity: "bassa", label: "Nessun H2 rilevato nel contenuto", sourceUrl: observation.url, detail: `${observation.words} parole visibili e 0 H2 nel markup attivo.` });
  }
  if (observation.noindex) {
    issues.push({ type: "indexability", severity: "media", label: "Pagina impostata noindex", sourceUrl: observation.url, detail: [observation.robots, observation.xRobotsTag].filter(Boolean).join(" · "), diagnosisState: "needs-confirmation" });
  }
  if (observation.canonical.error) {
    issues.push({ type: "canonical-invalid", severity: "alta", label: "Canonical non valida", sourceUrl: observation.url, detail: observation.canonical.raw });
  } else if (observation.canonical.url) {
    try {
      const source = new URL(observation.url);
      const target = new URL(observation.canonical.url);
      if (source.hostname.replace(/^www\./, "") !== target.hostname.replace(/^www\./, "")) {
        issues.push({ type: "canonical-external", severity: "alta", label: "Canonical verso un altro dominio", sourceUrl: observation.url, detail: observation.canonical.url });
      } else if (normalizedUrl(source.href) !== normalizedUrl(target.href)) {
        issues.push({ type: "canonical-different", severity: "media", label: "Canonical differente dall’URL analizzato", sourceUrl: observation.url, detail: observation.canonical.url, diagnosisState: "needs-confirmation" });
      }
    } catch {
      // canonical.error copre i casi non parseable.
    }
  }
  const sourceHost = (() => { try { return new URL(observation.url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  for (const link of observation.linkResults || []) {
    const broken = !link.status || [404, 410].includes(link.status) || link.status === 429 || link.status >= 500;
    if (!broken || isLegalPage(link.url)) continue;
    let external = false;
    try { external = new URL(link.url).hostname.replace(/^www\./, "") !== sourceHost; } catch { external = true; }
    issues.push({
      type: external ? "broken-external-link" : "broken-link",
      severity: link.temporary ? "media" : "alta",
      label: `${external ? "Link esterno" : "Link interno"} non raggiungibile${link.status ? ` (${link.status})` : ""}`,
      sourceUrl: observation.url,
      targetUrl: link.url,
      observedStatus: link.status,
      detail: link.error || (link.status ? `HTTP ${link.status}` : "Nessuna risposta HTTP verificabile"),
    });
  }
  return issues;
}

function traceabilitySummary(issues) {
  const reproducible = issues.filter((issue) => issue.reproducible === true && issue.dataSource?.url && issue.evidence?.length).length;
  return {
    issueCount: issues.length,
    reproducibleIssues: reproducible,
    complete: reproducible === issues.length,
    contract: "issue -> sourceUrl -> dataSource -> evidence -> observedAt",
  };
}

function pageResultFromObservation(observation) {
  const issues = dedupeIssues(pageObservationIssues(observation), { url: observation.url, analyzedAt: observation.observedAt }, observation);
  return {
    url: observation.url,
    fetchedAt: observation.observedAt,
    analyzedAt: observation.observedAt,
    score: null,
    httpStatus: observation.status,
    title: observation.title,
    titleCount: observation.titleCount,
    description: observation.description,
    metaDescriptionCount: observation.metaDescriptionCount,
    canonical: observation.canonical.url || observation.canonical.raw,
    robots: observation.robots,
    xRobotsTag: observation.xRobotsTag,
    noindex: observation.noindex,
    h1: observation.h1,
    h2: observation.h2,
    linksChecked: observation.linksChecked,
    linksDiscovered: observation.linksDiscovered,
    issues,
    auditCoverage: { mode: "page", source: "live HTTP + HTML", checks: ["http-status", "title", "meta-description", "h1", "h2", "canonical", "noindex", "links"], linksTruncated: observation.linksTruncated },
    traceability: traceabilitySummary(issues),
  };
}

async function completePagePayload(payload, observation) {
  if (!observation) return payload;
  if (isLegalPage(observation.url)) {
    return { ...payload, url: observation.url, analyzedAt: payload?.analyzedAt || observation.observedAt, legalOnly: true, legalPages: [{ url: observation.url }], issues: [], score: null, h2: observation.h2, traceability: traceabilitySummary([]) };
  }
  if (payload?.error && observation.status >= 400) return pageResultFromObservation(observation);
  if (!payload || typeof payload !== "object" || payload.error) return payload;
  const before = Array.isArray(payload.issues) ? payload.issues.length : 0;
  const issues = dedupeIssues([...(payload.issues || []), ...pageObservationIssues(observation)], payload, observation);
  return {
    ...payload,
    analyzedAt: payload.analyzedAt || observation.observedAt,
    httpStatus: observation.status,
    robots: observation.robots,
    xRobotsTag: observation.xRobotsTag,
    noindex: observation.noindex,
    h2: observation.h2,
    linksChecked: observation.linksChecked,
    linksDiscovered: observation.linksDiscovered,
    brokenLinks: observation.linkResults.filter((item) => !item.status || [404, 410].includes(item.status) || item.status === 429 || item.status >= 500),
    issues,
    auditCoverage: { mode: "page", source: "live HTTP + HTML", checks: ["http-status", "title", "meta-description", "h1", "h2", "canonical", "noindex", "links"], linksTruncated: observation.linksTruncated, issueCountBeforeDedupe: before, issueCountAfterDedupe: issues.length },
    traceability: traceabilitySummary(issues),
  };
}

function failureIssues(payload) {
  return (Array.isArray(payload?.failures) ? payload.failures : []).flatMap((failure) => {
    if (isLegalPage(failure?.url) || !Number.isFinite(Number(failure?.status)) || Number(failure.status) < 400) return [];
    const status = Number(failure.status);
    return [{ type: "http-status", severity: [404, 410].includes(status) ? "alta" : status >= 500 || status === 429 ? "media" : "alta", label: `Pagina non disponibile (HTTP ${status})`, sourceUrl: failure.url, observedStatus: status, detail: failure.reason || `HTTP ${status}` }];
  });
}

async function observeSiteH2(payload, progressId, signal) {
  const pages = (Array.isArray(payload?.pages) ? payload.pages : []).filter((page) => page?.url && !isLegalPage(page.url)).slice(0, MAX_SITE_H2_PAGES);
  const observations = new Map();
  if (!pages.length) return observations;
  setProgress(progressId, { phase: "Verifica H2 ed evidenze", done: 0, total: pages.length, discovering: false });
  let cursor = 0;
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(4, pages.length) }, async () => {
    while (cursor < pages.length) {
      const page = pages[cursor++];
      try {
        const observation = await observePage(page.url, "", { checkLinks: false, signal });
        observations.set(normalizedUrl(page.url), observation);
      } catch (error) {
        observations.set(normalizedUrl(page.url), { url: page.url, observedAt: timestamp(), error: error.message || String(error) });
      }
      done += 1;
      setProgress(progressId, { phase: "Verifica H2 ed evidenze", done, total: pages.length, discovering: false });
    }
  }));
  return observations;
}

async function completeSitePayload(payload, progressId, signal) {
  if (!payload || typeof payload !== "object" || payload.error) return payload;
  const observations = await observeSiteH2(payload, progressId, signal);
  const pages = (payload.pages || []).map((page) => {
    const observation = observations.get(normalizedUrl(page.url));
    return observation && !observation.error
      ? { ...page, h2: observation.h2, h2ObservedAt: observation.observedAt }
      : page;
  });
  const h2Issues = pages.flatMap((page) => {
    if (isLegalPage(page.url) || Number(page.words || 0) < 250 || page.h2 !== 0) return [];
    return [{ type: "h2", severity: "bassa", label: "Nessun H2 rilevato nel contenuto", sourceUrl: page.url, detail: `${page.words} parole visibili e 0 H2 nel markup attivo.` }];
  });
  const before = Array.isArray(payload.issues) ? payload.issues.length : 0;
  const issues = dedupeIssues([...(payload.issues || []), ...failureIssues(payload), ...h2Issues], payload, null);
  return {
    ...payload,
    pages,
    issues,
    summary: issues.reduce((acc, issue) => { acc[issue.type] = (acc[issue.type] || 0) + 1; return acc; }, {}),
    auditCoverage: {
      mode: "site",
      source: "live crawl + HTTP + HTML + sitemap",
      checks: ["http-status", "title", "meta-description", "h1", "h2", "canonical", "noindex", "internal-links", "external-links", "404"],
      h2PagesObserved: [...observations.values()].filter((item) => item && !item.error).length,
      h2PagesRequested: observations.size,
      issueCountBeforeDedupe: before,
      issueCountAfterDedupe: issues.length,
    },
    traceability: traceabilitySummary(issues),
  };
}

function pageHandlerWrapper(original) {
  return async function auditTracePageHandler(req, res, next) {
    const progressId = req?.body?.progressId;
    const controller = new AbortController();
    req.once?.("aborted", () => controller.abort());
    let observation = null;
    try {
      observation = await observePage(req?.body?.url, progressId, { checkLinks: true, signal: controller.signal });
      req[OBSERVATION_KEY] = observation;
    } catch (error) {
      req[OBSERVATION_KEY] = { error: error.message || String(error), observedAt: timestamp() };
      setProgress(progressId, { phase: "Controlli pagina parziali", done: 1, total: 2, discovering: false });
    }

    const originalJson = res.json.bind(res);
    let sent = false;
    res.json = (payload) => {
      if (sent) return res;
      sent = true;
      void completePagePayload(payload, observation)
        .then((completed) => {
          if (payload?.error && observation?.status >= 400) res.status(200);
          const total = Math.max(1, Number(progress.get(progressId)?.total) || 1);
          setProgress(progressId, { phase: "Analisi completata", done: total, total, discovering: false });
          originalJson(completed);
        })
        .catch(() => originalJson(payload));
      return res;
    };
    return original(req, res, next);
  };
}

function siteHandlerWrapper(original) {
  return async function auditTraceSiteHandler(req, res, next) {
    const progressId = req?.body?.progressId;
    const controller = new AbortController();
    req.once?.("aborted", () => controller.abort());
    const originalJson = res.json.bind(res);
    let sent = false;
    res.json = (payload) => {
      if (sent) return res;
      sent = true;
      if (!payload || payload.error) {
        originalJson(payload);
        return res;
      }
      void completeSitePayload(payload, progressId, controller.signal)
        .then((completed) => {
          const total = Math.max(1, Number(progress.get(progressId)?.total) || Number(completed?.pages?.length) || 1);
          setProgress(progressId, { phase: "Analisi completata", done: total, total, discovering: false });
          originalJson(completed);
        })
        .catch(() => originalJson(payload));
      return res;
    };
    return original(req, res, next);
  };
}

function progressHandlerWrapper(original) {
  return function auditTraceProgressHandler(req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      const traced = progress.get(req?.params?.id);
      if (traced) {
        res.status(200);
        return originalJson(traced);
      }
      return originalJson(payload);
    };
    return original(req, res, next);
  };
}

export function installAuditTraceabilityDecorator(app) {
  if (!app || typeof app.post !== "function") throw new Error("Express app non valida per Audit traceability decorator.");
  if (app[INSTALL_KEY]) return;
  wrapLastHandler(app, PAGE_ROUTE, "post", pageHandlerWrapper);
  wrapLastHandler(app, SITE_ROUTE, "post", siteHandlerWrapper);
  wrapLastHandler(app, PROGRESS_ROUTE, "get", progressHandlerWrapper);
  app[INSTALL_KEY] = true;
}

export const AUDIT_TRACEABILITY_ROUTES = Object.freeze({ PAGE_ROUTE, SITE_ROUTE, PROGRESS_ROUTE });
export { dedupeIssues, normalizeIssue, pageObservationIssues, traceabilitySummary };
