import { pinnedHttpsFetch } from "./pinnedHttpsFetch.js";
import {
  ELEMENTOR_RECONCILIATION_MAX_URLS,
  extractSitemapLocs,
  normalizeCoverageUrl,
  reconcileElementorCoverage,
} from "./elementorCoverageReconciliation.js";

const ROUTE = "/api/wordpress/elementor-public-coverage";
const MAX_SITEMAPS = 10;
const COVERAGE_CONCURRENCY = 3;
const MAX_REDIRECTS = 4;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NON_HTML_EXTENSIONS = /\.(?:avif|bmp|css|csv|docx?|eot|gif|gz|ico|jpe?g|js|json|m4a|m4v|mov|mp3|mp4|ogg|ogv|otf|pdf|png|pptx?|rar|rss|svg|tar|tiff?|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)(?:$|[?#])/i;

const sameSiteUrl = (value, siteUrl) => normalizeCoverageUrl(value, siteUrl);

export function isPotentialHtmlDocumentUrl(value, siteUrl = value) {
  const normalized = sameSiteUrl(value, siteUrl);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    const path = url.pathname.toLowerCase();
    if (NON_HTML_EXTENSIONS.test(`${path}${url.search}`)) return false;
    if (/\/(?:wp-admin|wp-json)(?:\/|$)/i.test(path)) return false;
    if (/\/(?:wp-login\.php|xmlrpc\.php)$/i.test(path)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchText(input, {
  siteUrl = input,
  maxBytes = 2 * 1024 * 1024,
  timeout = 15_000,
  maxRedirects = MAX_REDIRECTS,
} = {}) {
  let current = sameSiteUrl(input, siteUrl);
  if (!current) throw new Error(`URL HTTPS same-site non valida: ${input}`);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await pinnedHttpsFetch(current, {
      timeout,
      maxBytes,
      headers: {
        accept: "application/xml,text/xml,text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
        "user-agent": "seoGrowAI/1.4-elementor-public-coverage",
      },
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel?.();
      if (!location) throw new Error(`HTTP ${response.status} senza Location per ${current}`);
      const redirected = sameSiteUrl(new URL(location, current).href, siteUrl);
      if (!redirected) throw new Error(`Redirect fuori dal sito non consentito per ${current}`);
      current = redirected;
      continue;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status} per ${current}`);
    return {
      text: await response.text(),
      finalUrl: current,
      contentType: String(response.headers.get("content-type") || "").toLowerCase(),
    };
  }

  throw new Error(`Troppi redirect per ${input}`);
}

function extractInternalLinks(html, pageUrl, siteUrl) {
  const source = String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:script|style|template|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|template|noscript)>/gi, " ");
  const urls = new Set();
  for (const match of source.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const raw = String(match[1] || "").trim();
    if (!raw || /^(?:#|mailto:|tel:|javascript:|data:)/i.test(raw)) continue;
    try {
      const absolute = new URL(raw, pageUrl).href;
      const normalized = sameSiteUrl(absolute, siteUrl);
      if (normalized && isPotentialHtmlDocumentUrl(normalized, siteUrl)) urls.add(normalized);
    } catch {
      // URL malformata: non diventa evidenza.
    }
  }
  return [...urls];
}

async function readSitemapTree(siteUrl, explicitSitemapUrl = "") {
  const site = new URL(siteUrl);
  const initialCandidates = explicitSitemapUrl
    ? [sameSiteUrl(explicitSitemapUrl, siteUrl)]
    : [
        new URL("/sitemap.xml", site).href,
        new URL("/sitemap_index.xml", site).href,
      ];
  const pending = initialCandidates.filter(Boolean);
  const fetched = new Set();
  const attempted = new Set();
  const pageUrls = new Set();
  const failures = [];

  while (pending.length && fetched.size < MAX_SITEMAPS) {
    const sitemapUrl = pending.shift();
    if (!sitemapUrl || attempted.has(sitemapUrl) || fetched.has(sitemapUrl)) continue;
    attempted.add(sitemapUrl);
    try {
      const result = await fetchText(sitemapUrl, { siteUrl });
      const xml = result.text;
      fetched.add(result.finalUrl);
      attempted.add(result.finalUrl);
      const locs = extractSitemapLocs(xml, siteUrl, {
        maxUrls: ELEMENTOR_RECONCILIATION_MAX_URLS + MAX_SITEMAPS + 1,
      });
      if (/<sitemapindex\b/i.test(xml)) {
        for (const loc of locs) {
          if (pending.length + fetched.size >= MAX_SITEMAPS) break;
          if (!fetched.has(loc)) pending.push(loc);
        }
      } else if (/<urlset\b/i.test(xml)) {
        for (const loc of locs) pageUrls.add(loc);
      } else {
        failures.push({ url: result.finalUrl || sitemapUrl, reason: "Formato sitemap non riconosciuto" });
      }
    } catch (error) {
      failures.push({ url: sitemapUrl, reason: error?.message || "Sitemap non leggibile" });
    }
  }

  return {
    sitemapUrls: [...pageUrls],
    sitemapFiles: [...fetched],
    failures,
    truncated: pending.length > 0 || pageUrls.size > ELEMENTOR_RECONCILIATION_MAX_URLS,
  };
}

export async function inspectElementorPublicCoverage({ siteUrl, sitemapUrl = "" } = {}) {
  const normalizedSite = sameSiteUrl(siteUrl, siteUrl);
  if (!normalizedSite) throw new Error("siteUrl HTTPS pubblico valido obbligatorio.");

  const sitemap = await readSitemapTree(normalizedSite, sitemapUrl);
  const declaredSitemapUrls = sitemap.sitemapUrls;
  const effectiveSitemapUrls = new Set(
    declaredSitemapUrls.filter((url) => isPotentialHtmlDocumentUrl(url, normalizedSite)),
  );
  const ignoredAssetUrls = new Set(
    declaredSitemapUrls.filter((url) => !isPotentialHtmlDocumentUrl(url, normalizedSite)),
  );
  const queue = [...effectiveSitemapUrls].slice(0, ELEMENTOR_RECONCILIATION_MAX_URLS);
  const scheduled = new Set(queue);
  const discoveredUrls = new Set(queue);
  const crawledUrls = new Set();
  const ignoredNonHtmlUrls = new Set();
  const failures = [...sitemap.failures];
  let traversalTruncated = effectiveSitemapUrls.size > ELEMENTOR_RECONCILIATION_MAX_URLS;
  let cursor = 0;

  const schedule = (value) => {
    const normalized = sameSiteUrl(value, normalizedSite);
    if (!normalized || !isPotentialHtmlDocumentUrl(normalized, normalizedSite)) {
      if (normalized) ignoredAssetUrls.add(normalized);
      return;
    }
    if (scheduled.has(normalized)) return;
    if (scheduled.size >= ELEMENTOR_RECONCILIATION_MAX_URLS) {
      traversalTruncated = true;
      return;
    }
    scheduled.add(normalized);
    discoveredUrls.add(normalized);
    queue.push(normalized);
  };

  const inspectPage = async (requestedUrl) => {
    try {
      const result = await fetchText(requestedUrl, {
        siteUrl: normalizedSite,
        maxBytes: 8 * 1024 * 1024,
        timeout: 15_000,
      });
      const isHtml = !result.contentType || /(?:text\/html|application\/xhtml\+xml)/i.test(result.contentType);
      if (!isHtml) {
        discoveredUrls.delete(requestedUrl);
        effectiveSitemapUrls.delete(requestedUrl);
        ignoredNonHtmlUrls.add(result.finalUrl || requestedUrl);
        return;
      }

      const finalUrl = sameSiteUrl(result.finalUrl || requestedUrl, normalizedSite) || requestedUrl;
      if (finalUrl !== requestedUrl) {
        const wasSitemapUrl = effectiveSitemapUrls.delete(requestedUrl);
        discoveredUrls.delete(requestedUrl);
        if (wasSitemapUrl) effectiveSitemapUrls.add(finalUrl);
        discoveredUrls.add(finalUrl);
        scheduled.add(finalUrl);
      }
      crawledUrls.add(finalUrl);

      for (const discovered of extractInternalLinks(result.text, finalUrl, normalizedSite)) {
        schedule(discovered);
      }
    } catch (error) {
      failures.push({ url: requestedUrl, reason: error?.message || "Pagina non ispezionabile" });
    }
  };

  while (cursor < queue.length) {
    const batch = queue.slice(cursor, cursor + COVERAGE_CONCURRENCY);
    cursor += batch.length;
    await Promise.all(batch.map(inspectPage));
  }

  const coverageUrls = [...crawledUrls].toSorted();
  const publicDiscoveredUrls = [...discoveredUrls].toSorted();
  const effectiveSitemap = [...effectiveSitemapUrls].toSorted();
  const reconciliation = reconcileElementorCoverage({
    siteUrl: normalizedSite,
    sitemapUrls: effectiveSitemap,
    crawledUrls: coverageUrls,
    discoveredUrls: publicDiscoveredUrls,
    failures,
    queueDrained: cursor >= queue.length,
    sitemapReconciled: effectiveSitemap.length > 0 && sitemap.failures.length === 0,
    truncated: sitemap.truncated || traversalTruncated,
  });

  return {
    ok: true,
    readOnly: true,
    siteUrl: normalizedSite,
    sitemapFiles: sitemap.sitemapFiles,
    declaredSitemapUrls,
    effectiveSitemapUrls: effectiveSitemap,
    // Compatibilità con l'attestazione esistente: sitemapUrls espone il set pubblico
    // completo già ispezionato; declaredSitemapUrls conserva il contenuto reale della sitemap.
    sitemapUrls: coverageUrls,
    coverageUrls,
    crawledUrls: coverageUrls,
    discoveredUrls: publicDiscoveredUrls,
    ignoredAssetUrls: [...ignoredAssetUrls].toSorted(),
    ignoredNonHtmlUrls: [...ignoredNonHtmlUrls].toSorted(),
    failures,
    publicCoverageReconciled: reconciliation.verified,
    reconciliation,
    authoritativeWordPressInventoryVerified: false,
    completeSiteEnumeration: false,
    affectedPagesEnumerated: false,
    sharedWriteAllowed: false,
    note: reconciliation.verified
      ? "Coverage pubblica sitemap+crawl HTML ricorsivo riconciliata. Asset/download sono esclusi dal perimetro Elementor; eventuali pagine HTML interne scoperte fuori sitemap sono incluse e ispezionate. Non equivale ancora a inventario WordPress autorevole: completeSiteEnumeration resta false."
      : reconciliation.reason,
  };
}

export function registerRoutes(app) {
  app.post(ROUTE, async (req, res) => {
    try {
      const result = await inspectElementorPublicCoverage(req.body || {});
      res.json(result);
    } catch (error) {
      res.status(400).json({
        ok: false,
        readOnly: true,
        error: error?.message || "Verifica coverage pubblica Elementor non riuscita.",
        completeSiteEnumeration: false,
        affectedPagesEnumerated: false,
        sharedWriteAllowed: false,
      });
    }
  });
}

export {
  ROUTE as ELEMENTOR_PUBLIC_COVERAGE_ROUTE,
  extractInternalLinks,
  readSitemapTree,
};
