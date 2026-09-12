import { matchBrokenLinkHref, singleAnchorHref } from "../src/brokenLinkHref.js";
import { pinnedHttpsFetch } from "./pinnedHttpsFetch.js";

const HOOKED = Symbol.for("seogrow.linkEvidenceHook");
const HTML_LIMIT = 4 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_ANCHORS = 15000;
const MAX_MATCHES = 20;

const decodeHtmlEntities = (value) => String(value || "")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&#(\d+);/g, (_match, decimal) => {
    const code = Number(decimal);
    return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  })
  .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => {
    const code = Number.parseInt(hex, 16);
    return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });

const cleanAnchorText = (html) => decodeHtmlEntities(String(html || "")
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " "))
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 500);

const normalizedHttpUrl = (value, base) => {
  try {
    const url = new URL(decodeHtmlEntities(String(value || "").trim()), base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
};

export function extractLinkEvidence(html, sourceUrl, targetUrl) {
  const source = normalizedHttpUrl(sourceUrl);
  const target = normalizedHttpUrl(targetUrl);
  if (!source || !target) return { occurrenceCount: 0, anchorText: "", matches: [] };

  const matches = [];
  const markup = String(html || "").replace(/<!--[\s\S]*?-->|<(script|style|template|textarea|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const anchorPattern = /<a\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/a\s*>/gi;
  let scanned = 0;
  let occurrenceCount = 0;
  let firstAnchorText = "";
  let match;
  while ((match = anchorPattern.exec(markup)) !== null && scanned < MAX_ANCHORS) {
    scanned += 1;
    const attrs = match[1] || "";
    const rawHref = singleAnchorHref(attrs);
    const resolved = normalizedHttpUrl(rawHref, source);
    if (!resolved || (resolved !== target && !matchBrokenLinkHref(resolved, target))) continue;
    occurrenceCount += 1;
    const anchorText = cleanAnchorText(match[2]);
    if (!firstAnchorText && anchorText) firstAnchorText = anchorText;
    if (matches.length < MAX_MATCHES) matches.push({ href: resolved, anchorText });
  }

  return {
    occurrenceCount,
    anchorText: firstAnchorText,
    matches,
    truncated: occurrenceCount > matches.length || scanned >= MAX_ANCHORS,
    scanComplete: scanned < MAX_ANCHORS,
  };
}

async function fetchHtml(input) {
  let current = new URL(String(input || ""));
  if (current.protocol !== "https:") throw new Error("La pagina sorgente deve usare HTTPS.");
  current.username = "";
  current.password = "";
  current.hash = "";

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await pinnedHttpsFetch(current, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "cache-control": "no-cache, no-store",
        pragma: "no-cache",
        "user-agent": "seoGrowAI/1.4-frontend-verification",
      },
      timeout: 12_000,
      maxBytes: HTML_LIMIT,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Troppi redirect durante la lettura della pagina.");
      const next = new URL(location, current);
      if (next.protocol !== "https:") throw new Error("Redirect della pagina verso un URL non HTTPS.");
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`Pagina sorgente non leggibile (HTTP ${response.status}).`);
    const contentType = response.headers.get("content-type") || "";
    if (!/(?:text\/html|application\/xhtml\+xml)/i.test(contentType)) throw new Error("La pagina sorgente non restituisce HTML.");
    return { html: await response.text(), finalUrl: current.href };
  }
  throw new Error("Pagina sorgente non leggibile.");
}

export function assessLinkEvidenceHtml(html, source, finalUrl, evidence) {
  const comparable = value => { const url = new URL(value); url.pathname = url.pathname.replace(/\/+$/, "") || "/"; return url.href; };
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] || "";
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || "";
  const readable = cleanAnchorText(body);
  return evidence.scanComplete === true && comparable(finalUrl) === comparable(source) && /<\/html\s*>/i.test(html) && readable.length >= 80 &&
    !/captcha|verify you are human|access denied|just a moment|checking your browser|login|log in|sign in/i.test(`${title} ${readable}`);
}

export async function readLinkEvidencePage(sourceUrl, targetUrl) {
  const source = normalizedHttpUrl(sourceUrl);
  const target = normalizedHttpUrl(targetUrl);
  if (!source || !target) throw new Error("Pagina sorgente o link da verificare non valido.");
  const { html, finalUrl } = await fetchHtml(source);
  const evidence = extractLinkEvidence(html, finalUrl, target);
  return {
    ok: true, readOnly: true,
    checkedAt: new Date().toISOString(), requestedSourceUrl: source,
    verificationSafe: assessLinkEvidenceHtml(html, source, finalUrl, evidence),
    sourceUrl: finalUrl,
    targetUrl: target,
    ...evidence,
  };
}

export function registerRoutes(app) {
  if (app[HOOKED]) return;
  app[HOOKED] = true;

  app.post("/api/frontend/link-evidence", async (req, res) => {
    try {
      return res.json(await readLinkEvidencePage(req.body?.sourceUrl, req.body?.targetUrl));
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : "Verifica link non riuscita.",
      });
    }
  });
}
