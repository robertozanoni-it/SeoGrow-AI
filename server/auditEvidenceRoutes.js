import crypto from "node:crypto";
import { isLegalPage } from "../src/modules/audit/data.js";
import { normalizeHttpUrl } from "../src/reliabilityModel.js";
import { pinnedHttpsFetch } from "./pinnedHttpsFetch.js";
import { stripAlwaysHiddenMarkup, visibleH1Count } from "./frontendVerificationHook.js";

const progress = new Map();
const MAX_PROGRESS = 200;
const PROGRESS_TTL = 60 * 60_000;
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_LINK_CHECKS = 240;
const USER_AGENT = "SeoGrowAI/1.4-audit-evidence";

const text = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const attr = (tag, name) => {
  const match = String(tag || "").match(new RegExp(`\\b${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "i"));
  return String(match?.[1] || match?.[2] || "").trim();
};
const htmlEntity = (value) => String(value || "")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");
const timestamp = () => new Date().toISOString();

const cleanupProgress = () => {
  const now = Date.now();
  for (const [id, state] of progress) if (now - state.updatedAt > PROGRESS_TTL) progress.delete(id);
};
const reporter = (id) => {
  cleanupProgress();
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{20,80}$/.test(id) || progress.size >= MAX_PROGRESS || progress.has(id)) return () => {};
  return (state) => progress.set(id, { ...state, updatedAt: Date.now() });
};

async function safeFetch(input, { method = "GET", signal, maxBytes = MAX_HTML_BYTES } = {}, redirects = 0) {
  const url = input instanceof URL ? new URL(input.href) : new URL(String(input || ""));
  if (url.protocol !== "https:") throw new Error("L’audit verificabile richiede un URL HTTPS pubblico.");
  const response = await pinnedHttpsFetch(url, {
    method,
    signal,
    maxBytes,
    timeout: 20_000,
    headers: { "user-agent": USER_AGENT, accept: method === "GET" ? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" : "*/*" },
  });
  if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get("location")) {
    if (redirects >= 5) throw new Error("Troppi redirect durante l’audit.");
    const next = new URL(response.headers.get("location"), url);
    return safeFetch(next, { method: response.status === 303 ? "GET" : method, signal, maxBytes }, redirects + 1);
  }
  Object.defineProperty(response, "url", { value: url.href });
  return response;
}

const canonicalUrl = (value, base) => {
  try { return normalizeHttpUrl(new URL(value, base).href, { stripSlash: false }); }
  catch { return ""; }
};

function pageKind(url) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (/(?:privacy|cookie|termini|terms|gdpr|legal|impressum)/.test(path)) return "legal";
    if (/\/(?:category|categoria|tag|author|autore|date)(?:\/|$)/.test(path)) return "archive";
    return "content";
  } catch { return "unknown"; }
}

function parsePage(html, url, response) {
  const raw = String(html || "");
  const visible = stripAlwaysHiddenMarkup(raw);
  const title = htmlEntity(text(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""));
  const metas = [...raw.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const description = htmlEntity(attr(metas.find((tag) => /^description$/i.test(attr(tag, "name"))) || "", "content"));
  const robots = htmlEntity(attr(metas.find((tag) => /^robots$/i.test(attr(tag, "name"))) || "", "content"));
  const xRobotsTag = response.headers.get("x-robots-tag") || "";
  const canonicalTag = [...raw.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]).find((tag) => /(?:^|\s)canonical(?:\s|$)/i.test(attr(tag, "rel")));
  const canonical = canonicalUrl(attr(canonicalTag || "", "href"), url);
  const h1 = visibleH1Count(visible);
  const h2 = (visible.match(/<h2\b[^>]*>/gi) || []).length;
  const links = [];
  for (const match of visible.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(match[0], "href");
    if (!href || /^(?:mailto:|tel:|javascript:|#)/i.test(href)) continue;
    const resolved = canonicalUrl(href, url);
    if (resolved) links.push(resolved);
  }
  const images = [...visible.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const missingAlt = images.filter((tag) => !attr(tag, "alt").trim()).length;
  const bodyText = text(visible
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " "));
  const words = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;
  return {
    url,
    status: response.status,
    title,
    titleLength: [...title].length,
    description,
    descriptionLength: [...description].length,
    canonical,
    robots,
    xRobotsTag,
    noindex: /\bnoindex\b/i.test(`${robots} ${xRobotsTag}`),
    h1,
    h2,
    links: [...new Set(links)],
    images: images.length,
    missingAlt,
    words,
    contentType: response.headers.get("content-type") || "",
    pageKind: pageKind(url),
  };
}

const severityRank = { high: 0, medium: 1, low: 2 };
const severityLabel = (value) => value === "high" ? "alta" : value === "medium" ? "media" : "bassa";
const issueKey = (item) => [item.type, normalizeHttpUrl(item.sourceUrl || "", { stripSlash: true }), normalizeHttpUrl(item.targetUrl || "", { stripSlash: true }), item.evidence?.observed || ""].join("::");
const dedupeIssues = (items) => {
  const map = new Map();
  for (const item of items) {
    const key = issueKey(item);
    const previous = map.get(key);
    if (!previous || severityRank[item.severityClass] < severityRank[previous.severityClass]) map.set(key, item);
  }
  return [...map.values()];
};
const evidence = (source, observed, expected, rule) => ({ source, observed: String(observed ?? ""), expected: String(expected ?? ""), rule });
const makeIssue = ({ type, severity = "medium", label, detail, sourceUrl, targetUrl = "", source, observed, expected, rule, diagnosisState = "confirmed" }) => ({
  type,
  severity: severityLabel(severity),
  severityClass: severity,
  label,
  detail,
  sourceUrl,
  ...(targetUrl ? { targetUrl } : {}),
  diagnosisState,
  evidence: evidence(source, observed, expected, rule),
  evidenceNature: "observed",
  reproducible: true,
});

function pageIssues(page) {
  const issues = [];
  const reviewItems = [];
  const push = (input) => issues.push(makeIssue({ ...input, sourceUrl: page.url }));
  const review = (input) => reviewItems.push(makeIssue({ ...input, sourceUrl: page.url, diagnosisState: "needs-confirmation" }));
  if (page.status >= 400) push({ type: "http-status", severity: "high", label: `HTTP ${page.status}`, detail: `La pagina risponde HTTP ${page.status}.`, source: "HTTP status", observed: page.status, expected: "200-399", rule: "status >= 400" });
  if (!page.title) push({ type: "title", severity: "high", label: "Title mancante", detail: "Il tag <title> non è presente o è vuoto.", source: "HTML <title>", observed: "assente", expected: "presente", rule: "title.trim().length > 0" });
  else if (page.titleLength < 30 || page.titleLength > 65) push({ type: "title-length", severity: "low", label: `Title di ${page.titleLength} caratteri`, detail: "La lunghezza del title è fuori dalla fascia operativa 30–65 caratteri.", source: "HTML <title>", observed: page.titleLength, expected: "30-65", rule: "30 <= titleLength <= 65" });
  if (!page.description) push({ type: "meta_description", severity: "medium", label: "Meta description mancante", detail: "La meta description non è presente o è vuota.", source: "meta[name=description]", observed: "assente", expected: "presente", rule: "description.trim().length > 0" });
  else if (page.descriptionLength < 70 || page.descriptionLength > 170) push({ type: "meta-description-length", severity: "low", label: `Meta description di ${page.descriptionLength} caratteri`, detail: "La lunghezza della description è fuori dalla fascia operativa 70–170 caratteri.", source: "meta[name=description]", observed: page.descriptionLength, expected: "70-170", rule: "70 <= descriptionLength <= 170" });
  if (page.h1 !== 1) push({ type: "h1", severity: "high", label: `${page.h1} H1 rilevati`, detail: "La pagina dovrebbe esporre un solo H1 visibile nel DOM osservato.", source: "DOM visibile <h1>", observed: page.h1, expected: 1, rule: "visibleH1Count === 1" });
  if (page.h2 === 0) {
    const payload = { type: "h2", severity: page.words >= 300 ? "medium" : "low", label: "0 H2 rilevati", detail: page.words >= 300 ? "Pagina con almeno 300 parole senza H2: verifica la gerarchia del contenuto." : "Nessun H2 rilevato; su contenuti brevi può essere intenzionale.", source: "DOM visibile <h2>", observed: 0, expected: page.words >= 300 ? ">=1 per contenuti >=300 parole" : "valutazione editoriale", rule: "h2Count === 0" };
    if (page.words >= 300) push(payload); else review(payload);
  }
  if (!page.canonical) push({ type: "canonical", severity: "medium", label: "Canonical mancante", detail: "Nessun link rel=canonical valido è stato osservato.", source: "link[rel=canonical]", observed: "assente", expected: page.url, rule: "canonical URL presente" });
  else if (normalizeHttpUrl(page.canonical, { stripSlash: true }) !== normalizeHttpUrl(page.url, { stripSlash: true })) review({ type: "canonical-different", severity: "medium", label: "Canonical verso URL diversa", detail: `Canonical osservata: ${page.canonical}`, targetUrl: page.canonical, source: "link[rel=canonical]", observed: page.canonical, expected: page.url, rule: "canonical diversa richiede conferma dell’intento" });
  if (page.noindex) review({ type: "noindex", severity: "high", label: "Pagina impostata noindex", detail: `Direttiva osservata: ${[page.robots, page.xRobotsTag].filter(Boolean).join(" · ")}`, source: page.xRobotsTag ? "meta robots + X-Robots-Tag" : "meta robots", observed: `${page.robots} ${page.xRobotsTag}`.trim(), expected: "index se la pagina deve posizionarsi", rule: "robots contiene noindex" });
  if (page.missingAlt > 0) push({ type: "image-alt", severity: "low", label: `${page.missingAlt} immagini senza alt`, detail: `${page.missingAlt} immagini su ${page.images} non hanno un attributo alt valorizzato.`, source: "DOM <img>", observed: page.missingAlt, expected: 0, rule: "img senza alt valorizzato === 0" });
  return { issues, reviewItems };
}

async function checkLink(url, signal) {
  let response = await safeFetch(url, { method: "HEAD", signal, maxBytes: 1024 });
  if ([405, 501].includes(response.status)) response = await safeFetch(url, { method: "GET", signal, maxBytes: 128 * 1024 });
  return response.status;
}

async function checkLinks(pages, report, signal) {
  const refs = new Map();
  for (const page of pages) for (const target of page.links) {
    if (!refs.has(target)) refs.set(target, new Set());
    refs.get(target).add(page.url);
  }
  const entries = [...refs.entries()].slice(0, MAX_LINK_CHECKS);
  const issues = [];
  report({ phase: "Verifica link e 404", done: 0, total: entries.length, discovering: false, unit: "link" });
  let done = 0;
  const workers = Array.from({ length: Math.min(6, entries.length || 1) }, async () => {
    while (entries.length) {
      const [target, sources] = entries.shift();
      try {
        const status = await checkLink(target, signal);
        if (status >= 400) for (const sourceUrl of sources) {
          const external = new URL(target).origin !== new URL(sourceUrl).origin;
          issues.push(makeIssue({
            type: external ? "broken-external-link" : "broken-link",
            severity: status === 404 ? "high" : "medium",
            label: `${external ? "Link esterno" : "Link interno"} non raggiungibile (${status})`,
            detail: `${target} risponde HTTP ${status}.`,
            sourceUrl,
            targetUrl: target,
            source: "HTTP link check",
            observed: status,
            expected: "200-399",
            rule: "link target status >= 400",
          }));
        }
      } catch (error) {
        for (const sourceUrl of sources) issues.push(makeIssue({ type: "link-check-error", severity: "low", label: "Link non verificabile", detail: `${target}: ${error.message}`, sourceUrl, targetUrl: target, source: "HTTP link check", observed: error.message, expected: "risposta HTTP verificabile", rule: "richiesta link completata" }));
      } finally {
        done += 1;
        report({ phase: "Verifica link e 404", done, total: done + entries.length, discovering: false, unit: "link" });
      }
    }
  });
  await Promise.all(workers);
  return issues;
}

function duplicateMetadata(pages, field, type, label) {
  const buckets = new Map();
  for (const page of pages) {
    const value = String(page[field] || "").trim().toLocaleLowerCase("it");
    if (!value) continue;
    if (!buckets.has(value)) buckets.set(value, []);
    buckets.get(value).push(page);
  }
  const issues = [];
  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    for (const page of group) issues.push(makeIssue({ type, severity: "medium", label, detail: `${field === "title" ? "Title" : "Meta description"} condivisa da ${group.length} URL osservate.`, sourceUrl: page.url, source: field === "title" ? "HTML <title> cross-page" : "meta description cross-page", observed: page[field], expected: "valore distinto per pagina", rule: `${field} identico su almeno 2 URL crawl` }));
  }
  return issues;
}

const scoreFor = (issues) => Math.max(0, Math.round(100 - issues.reduce((sum, issue) => sum + ({ high: 12, medium: 5, low: 2 }[issue.severityClass] || 0), 0)));

async function auditOne(url, report, signal) {
  report({ phase: "Lettura pagina", done: 0, total: 1, discovering: false, unit: "pagina" });
  const response = await safeFetch(url, { signal });
  const html = await response.text();
  const page = parsePage(html, url, response);
  const base = pageIssues(page);
  report({ phase: "Pagina analizzata", done: 1, total: 1, discovering: false, unit: "pagina" });
  const linkIssues = await checkLinks([page], report, signal);
  const issues = dedupeIssues([...base.issues, ...linkIssues]);
  const reviewItems = dedupeIssues(base.reviewItems);
  return {
    ...page,
    auditContractVersion: 2,
    sourceKind: "live-http-crawl",
    analyzedAt: timestamp(),
    pagesChecked: 1,
    legalPagesExcluded: 0,
    issues,
    reviewItems,
    score: scoreFor(issues),
    scoreMethodology: "100 meno penalità deterministiche: alta 12, media 5, bassa 2.",
    coverage: { pagesObserved: 1, linksObserved: page.links.length, linkChecksCappedAt: MAX_LINK_CHECKS, checks: ["HTTP", "title", "meta-description", "H1", "H2", "canonical", "noindex", "links", "404"] },
  };
}

async function auditSite(startUrl, maxPages, report, signal) {
  const origin = new URL(startUrl).origin;
  const queue = [normalizeHttpUrl(startUrl, { stripSlash: false })];
  const seen = new Set();
  const pages = [];
  let excludedLegal = 0;
  report({ phase: "Scoperta e crawl pagine", done: 0, total: 1, discovering: true, unit: "pagina" });
  while (queue.length && pages.length < maxPages) {
    if (signal?.aborted) throw new Error("Richiesta annullata.");
    const url = queue.shift();
    const key = normalizeHttpUrl(url, { stripSlash: true });
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (isLegalPage(url)) { excludedLegal += 1; continue; }
    try {
      const response = await safeFetch(url, { signal });
      const type = response.headers.get("content-type") || "";
      if (!/text\/html|application\/xhtml\+xml/i.test(type) && response.status < 400) continue;
      const html = await response.text();
      const page = parsePage(html, url, response);
      pages.push(page);
      for (const link of page.links) {
        try {
          const parsed = new URL(link);
          if (parsed.origin !== origin || isLegalPage(link)) { if (parsed.origin === origin && isLegalPage(link)) excludedLegal += 1; continue; }
          const normalized = normalizeHttpUrl(link, { stripSlash: false });
          if (normalized && !seen.has(normalizeHttpUrl(normalized, { stripSlash: true })) && queue.length + pages.length < maxPages * 3) queue.push(normalized);
        } catch { /* invalid link ignored */ }
      }
    } catch (error) {
      pages.push({ url, status: 0, title: "", titleLength: 0, description: "", descriptionLength: 0, canonical: "", robots: "", xRobotsTag: "", noindex: false, h1: 0, h2: 0, links: [], images: 0, missingAlt: 0, words: 0, pageKind: pageKind(url), fetchError: error.message });
    }
    report({ phase: "Scoperta e crawl pagine", done: pages.length, total: Math.max(pages.length + queue.length, 1), discovering: queue.length > 0 && pages.length < maxPages, unit: "pagina" });
  }
  const issues = [];
  const reviewItems = [];
  for (const page of pages) {
    if (page.fetchError) issues.push(makeIssue({ type: "crawl-error", severity: "high", label: "Pagina non leggibile", detail: page.fetchError, sourceUrl: page.url, source: "HTTPS crawl", observed: page.fetchError, expected: "pagina leggibile", rule: "fetch pagina completato" }));
    else {
      const current = pageIssues(page);
      issues.push(...current.issues);
      reviewItems.push(...current.reviewItems);
    }
  }
  issues.push(...duplicateMetadata(pages, "title", "duplicate-title", "Title duplicato"));
  issues.push(...duplicateMetadata(pages, "description", "duplicate-description", "Meta description duplicata"));
  issues.push(...await checkLinks(pages, report, signal));
  const cleanIssues = dedupeIssues(issues);
  const cleanReview = dedupeIssues(reviewItems);
  report({ phase: "Riepilogo finale", done: pages.length, total: pages.length, discovering: false, unit: "pagina" });
  return {
    url: startUrl,
    auditContractVersion: 2,
    sourceKind: "live-http-crawl",
    analyzedAt: timestamp(),
    pagesChecked: pages.length,
    legalPagesExcluded: excludedLegal,
    pages,
    issues: cleanIssues,
    reviewItems: cleanReview,
    score: scoreFor(cleanIssues),
    scoreMethodology: "100 meno penalità deterministiche: alta 12, media 5, bassa 2.",
    coverage: { pagesObserved: pages.length, linksObserved: new Set(pages.flatMap((page) => page.links || [])).size, linkChecksCappedAt: MAX_LINK_CHECKS, maxPages, checks: ["HTTP", "title", "meta-description", "H1", "H2", "canonical", "noindex", "links", "404", "duplicate-title", "duplicate-description"], legalPagesExcluded: excludedLegal },
  };
}

export function registerRoutes(app) {
  app.get("/api/audit-evidence/progress/:id", (req, res) => {
    res.set("Cache-Control", "no-store");
    cleanupProgress();
    const state = progress.get(req.params.id);
    if (!state) return res.status(404).json({ error: "Analisi non disponibile" });
    res.json(state);
  });

  app.post("/api/audit-evidence/page", async (req, res) => {
    const report = reporter(req.body?.progressId);
    const controller = new AbortController();
    req.once("close", () => { if (!res.writableEnded) controller.abort(); });
    try {
      const url = new URL(req.body?.url);
      const result = await auditOne(url.href, report, controller.signal);
      report({ phase: "Analisi completata", done: 1, total: 1, discovering: false, unit: "pagina", complete: true });
      res.json(result);
    } catch (error) {
      report({ phase: "Analisi non riuscita", done: 0, total: 1, discovering: false, complete: true, error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/audit-evidence/site", async (req, res) => {
    const report = reporter(req.body?.progressId);
    const controller = new AbortController();
    req.once("close", () => { if (!res.writableEnded) controller.abort(); });
    try {
      const url = new URL(req.body?.url);
      const maxPages = Math.min(200, Math.max(1, Number(req.body?.maxPages) || 75));
      const result = await auditSite(url.href, maxPages, report, controller.signal);
      report({ phase: "Analisi completata", done: result.pagesChecked, total: result.pagesChecked, discovering: false, unit: "pagina", complete: true });
      res.json(result);
    } catch (error) {
      report({ phase: "Analisi non riuscita", done: 0, total: 1, discovering: false, complete: true, error: error.message });
      res.status(500).json({ error: error.message });
    }
  });
}

export const auditEvidenceContract = Object.freeze({ version: 2, checks: ["HTTP", "title", "meta-description", "H1", "H2", "canonical", "noindex", "links", "404"] });
