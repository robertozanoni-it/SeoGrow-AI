const DEFAULT_MAX_URLS = 75;

const normalizedHost = (hostname) => String(hostname || "").toLowerCase().replace(/^www\./, "");

export function normalizeCoverageUrl(value, siteUrl) {
  try {
    const site = new URL(String(siteUrl || ""));
    const url = new URL(String(value || ""), site);
    if (url.protocol !== "https:") return "";
    if (normalizedHost(url.hostname) !== normalizedHost(site.hostname)) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

export function extractSitemapLocs(xml, siteUrl, { maxUrls = DEFAULT_MAX_URLS + 1 } = {}) {
  const source = String(xml || "");
  const urls = [];
  const seen = new Set();
  const pattern = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
  let match;
  while ((match = pattern.exec(source)) && urls.length < maxUrls) {
    const decoded = String(match[1] || "")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .trim();
    const normalized = normalizeCoverageUrl(decoded, siteUrl);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }
  return urls;
}

const normalizeSet = (values, siteUrl) => {
  const result = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeCoverageUrl(value, siteUrl);
    if (normalized) result.add(normalized);
  }
  return result;
};

export function reconcileElementorCoverage({
  siteUrl,
  sitemapUrls,
  crawledUrls,
  discoveredUrls,
  failures = [],
  queueDrained = false,
  sitemapReconciled = false,
  truncated = false,
  maxUrls = DEFAULT_MAX_URLS,
} = {}) {
  const sitemap = normalizeSet(sitemapUrls, siteUrl);
  const crawled = normalizeSet(crawledUrls, siteUrl);
  const discovered = normalizeSet(discoveredUrls, siteUrl);
  const limit = Number.isSafeInteger(Number(maxUrls)) && Number(maxUrls) > 0
    ? Number(maxUrls)
    : DEFAULT_MAX_URLS;
  const failureCount = Array.isArray(failures) ? failures.length : Number(failures) || 0;

  const overLimit = sitemap.size > limit || crawled.size > limit || discovered.size > limit;
  const everySitemapUrlCrawled = sitemap.size > 0 && [...sitemap].every((url) => crawled.has(url));
  const everyDiscoveredUrlCrawled = discovered.size > 0 && [...discovered].every((url) => crawled.has(url));
  const everyCrawledUrlDiscovered = [...crawled].every((url) => discovered.has(url));
  const extraDiscoveredUrls = [...discovered].filter((url) => !sitemap.has(url)).toSorted();
  const noUndeclaredDiscoveries = extraDiscoveredUrls.length === 0;
  const noExtraCrawledUrls = everyCrawledUrlDiscovered;
  const totalsMatch = discovered.size === crawled.size;

  const verified =
    sitemapReconciled === true &&
    queueDrained === true &&
    truncated !== true &&
    !overLimit &&
    failureCount === 0 &&
    everySitemapUrlCrawled &&
    everyDiscoveredUrlCrawled &&
    everyCrawledUrlDiscovered &&
    totalsMatch;

  let status = "incomplete";
  let reason = "La discovery non dimostra una copertura completa e riconciliata.";
  if (overLimit || truncated === true) {
    status = "truncated";
    reason = `Il set supera il limite Elementor di ${limit} URL o la discovery è stata troncata.`;
  } else if (failureCount > 0) {
    status = "crawl-failures";
    reason = "Una o più URL della coverage non sono state ispezionate con successo.";
  } else if (sitemapReconciled !== true) {
    status = "sitemap-unreconciled";
    reason = "La sitemap non è stata riconciliata dal backend.";
  } else if (queueDrained !== true) {
    status = "queue-not-drained";
    reason = "La coda del crawl contiene ancora URL da verificare.";
  } else if (!everyDiscoveredUrlCrawled) {
    status = "uninspected-discovery";
    reason = "Il crawl ha scoperto pagine HTML interne che non sono ancora state ispezionate.";
  } else if (!everySitemapUrlCrawled || !everyCrawledUrlDiscovered || !totalsMatch) {
    status = "set-mismatch";
    reason = "Le pagine pubbliche dichiarate, scoperte e ispezionate non coincidono.";
  } else if (verified) {
    status = "verified-complete";
    reason = extraDiscoveredUrls.length
      ? `Sitemap e crawl ricorsivo sono riconciliati: ${extraDiscoveredUrls.length} pagine HTML interne aggiuntive sono state scoperte e ispezionate oltre alla sitemap.`
      : "Sitemap e crawl sono riconciliati: tutte le URL attestate sono state ispezionate, la coda è esaurita e non esistono errori.";
  }

  return {
    verified,
    complete: verified,
    status,
    reason,
    totalUrls: discovered.size,
    sitemapUrlCount: sitemap.size,
    discoveredUrls: discovered.size,
    inspectedUrls: crawled.size,
    failedUrls: failureCount,
    queueDrained: queueDrained === true,
    sitemapReconciled: sitemapReconciled === true,
    truncated: truncated === true || overLimit,
    discoveryMethod: verified ? "recursive-html-crawl+sitemap-reconciled" : "unverified",
    everySitemapUrlCrawled,
    everyDiscoveredUrlCrawled,
    everyCrawledUrlDiscovered,
    noExtraCrawledUrls,
    noUndeclaredDiscoveries,
    totalsMatch,
    coverageExpandedBeyondSitemap: extraDiscoveredUrls.length > 0,
    extraDiscoveredUrls,
  };
}

export { DEFAULT_MAX_URLS as ELEMENTOR_RECONCILIATION_MAX_URLS };
