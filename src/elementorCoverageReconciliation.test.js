import test from "node:test";
import assert from "node:assert/strict";
import {
  extractSitemapLocs,
  normalizeCoverageUrl,
  reconcileElementorCoverage,
} from "../server/elementorCoverageReconciliation.js";

const siteUrl = "https://www.example.com";
const urls = [
  "https://example.com/",
  "https://example.com/a/",
  "https://example.com/b/",
];

test("normalizzazione coverage accetta solo HTTPS same-host", () => {
  assert.equal(normalizeCoverageUrl("https://example.com/a/#x", siteUrl), "https://example.com/a/");
  assert.equal(normalizeCoverageUrl("http://example.com/a/", siteUrl), "");
  assert.equal(normalizeCoverageUrl("https://evil.example.net/a/", siteUrl), "");
});

test("parser sitemap deduplica loc e decodifica entity XML", () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://example.com/</loc></url>
    <url><loc>https://www.example.com/a/?x=1&amp;y=2</loc></url>
    <url><loc>https://example.com/</loc></url>
    <url><loc>https://evil.example.net/</loc></url>
  </urlset>`;
  assert.deepEqual(extractSitemapLocs(xml, siteUrl), [
    "https://example.com/",
    "https://www.example.com/a/?x=1&y=2",
  ]);
});

test("coverage completa richiede sitemap e discovery HTML interamente ispezionate", () => {
  const result = reconcileElementorCoverage({
    siteUrl,
    sitemapUrls: urls,
    crawledUrls: urls,
    discoveredUrls: urls,
    failures: [],
    queueDrained: true,
    sitemapReconciled: true,
    truncated: false,
  });
  assert.equal(result.verified, true);
  assert.equal(result.status, "verified-complete");
  assert.equal(result.discoveryMethod, "recursive-html-crawl+sitemap-reconciled");
  assert.equal(result.totalUrls, 3);
  assert.equal(result.sitemapUrlCount, 3);
});

test("pagina HTML interna fuori sitemap è ammessa solo dopo essere stata ispezionata", () => {
  const hidden = "https://example.com/hidden/";
  const pending = reconcileElementorCoverage({
    siteUrl,
    sitemapUrls: urls,
    crawledUrls: urls,
    discoveredUrls: [...urls, hidden],
    queueDrained: true,
    sitemapReconciled: true,
  });
  assert.equal(pending.verified, false);
  assert.equal(pending.status, "uninspected-discovery");

  const verified = reconcileElementorCoverage({
    siteUrl,
    sitemapUrls: urls,
    crawledUrls: [...urls, hidden],
    discoveredUrls: [...urls, hidden],
    queueDrained: true,
    sitemapReconciled: true,
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.status, "verified-complete");
  assert.equal(verified.totalUrls, 4);
  assert.equal(verified.sitemapUrlCount, 3);
  assert.equal(verified.coverageExpandedBeyondSitemap, true);
  assert.deepEqual(verified.extraDiscoveredUrls, [hidden]);
});

test("sitemap non interamente ispezionata resta bloccata", () => {
  const result = reconcileElementorCoverage({
    siteUrl,
    sitemapUrls: urls,
    crawledUrls: urls.slice(0, 2),
    discoveredUrls: urls,
    queueDrained: true,
    sitemapReconciled: true,
  });
  assert.equal(result.verified, false);
  assert.equal(result.status, "uninspected-discovery");
});

test("errori, coda residua e truncation falliscono chiusi", () => {
  assert.equal(reconcileElementorCoverage({
    siteUrl,
    sitemapUrls: urls,
    crawledUrls: urls,
    discoveredUrls: urls,
    failures: [{ url: urls[2] }],
    queueDrained: true,
    sitemapReconciled: true,
  }).status, "crawl-failures");

  assert.equal(reconcileElementorCoverage({
    siteUrl,
    sitemapUrls: urls,
    crawledUrls: urls,
    discoveredUrls: urls,
    queueDrained: false,
    sitemapReconciled: true,
  }).status, "queue-not-drained");

  assert.equal(reconcileElementorCoverage({
    siteUrl,
    sitemapUrls: urls,
    crawledUrls: urls,
    discoveredUrls: urls,
    queueDrained: true,
    sitemapReconciled: true,
    truncated: true,
  }).status, "truncated");
});

test("fino a 75 URL HTML possono ottenere coverage completa Elementor", () => {
  const supported = Array.from({ length: 75 }, (_, index) => `https://example.com/p-${index}/`);
  const result = reconcileElementorCoverage({
    siteUrl,
    sitemapUrls: supported.slice(0, 70),
    crawledUrls: supported,
    discoveredUrls: supported,
    queueDrained: true,
    sitemapReconciled: true,
  });
  assert.equal(result.verified, true);
  assert.equal(result.coverageExpandedBeyondSitemap, true);
});

test("più di 75 URL HTML non può diventare coverage completa Elementor", () => {
  const large = Array.from({ length: 76 }, (_, index) => `https://example.com/p-${index}/`);
  const result = reconcileElementorCoverage({
    siteUrl,
    sitemapUrls: large.slice(0, 75),
    crawledUrls: large,
    discoveredUrls: large,
    queueDrained: true,
    sitemapReconciled: true,
  });
  assert.equal(result.verified, false);
  assert.equal(result.status, "truncated");
});
