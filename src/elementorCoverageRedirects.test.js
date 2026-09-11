import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import https from "node:https";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { inspectElementorPublicCoverage } from "../server/elementorPublicCoverageHook.js";
import { coverageIdentityUrl, verifiedCoverageRedirects } from "../server/elementorCoverageRedirects.js";
import { coverageRelevantInventoryResources, validateAuthoritativeWordPressInventory, reconcileAuthoritativeInventoryWithPublicCoverage } from "../server/elementorWordPressInventory.js";
import { registerElementorCoverageAttestation, resetElementorCoverageRegistryForTests } from "../server/elementorCoverageRegistry.js";

const siteUrl = "https://example.com";
const html = (body = "<h1>Page</h1>") => ({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body });
const moved = (to, status = 301) => ({ status, headers: { location: to }, body: "" });
const sitemap = (paths) => ({ status: 200, headers: { "content-type": "application/xml" }, body: `<urlset>${paths.map((p) => `<url><loc>${siteUrl}${p}</loc></url>`).join("")}</urlset>` });
const inventoryFor = (paths, extra = []) => validateAuthoritativeWordPressInventory({
  source: "seogrow-connector", connectorVersion: "1.3.5", readOnly: true,
  inventoryScope: "all-public-queryable-post-types", complete: true, truncated: false,
  totalResources: paths.length + extra.length,
  resources: [...paths.map((p, i) => ({ id: i + 1, postType: "post", status: "publish", url: siteUrl + p })), ...extra],
}, { siteUrl });

// Exercise the real pinned HTTPS transport, crawler and reconciliation without network I/O.
function fixtureNetwork(t, routes) {
  const calls = [];
  t.mock.method(dns, "lookup", async () => [{ address: "93.184.216.34", family: 4 }]);
  t.mock.method(https, "request", (options, callback) => {
    assert.equal(options.method, "GET");
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.headers.authorization, undefined);
    calls.push(options);
    const request = new EventEmitter();
    request.write = () => assert.fail("Public coverage must not send a request body");
    request.destroy = (error) => { if (error) request.emit("error", error); request.emit("close"); };
    request.end = () => queueMicrotask(() => {
      const row = routes[options.path] || { status: 404, headers: { "content-type": "text/html" }, body: "not found" };
      if (row.error) { request.destroy(new Error(row.error)); return; }
      const response = new PassThrough();
      response.statusCode = row.status;
      response.statusMessage = "";
      response.headers = row.headers || {};
      callback(response);
      response.end(Buffer.from(row.body || ""));
      response.once("end", () => request.emit("close"));
    });
    return request;
  });
  return calls;
}

function proof(overrides = {}) {
  return {
    source: "seogrow-public-crawl", readOnly: true, verified: true,
    requestedUrl: siteUrl + "/old/", finalUrl: siteUrl + "/new/", finalStatus: 200,
    contentType: "text/html; charset=utf-8", inspectedAt: new Date().toISOString(),
    chain: [{ fromUrl: siteUrl + "/old/", toUrl: siteUrl + "/new/", status: 301 }],
    ...overrides,
  };
}
const provenCoverage = (redirects = [proof()]) => ({
  readOnly: true, siteUrl, publicCoverageReconciled: true, coverageUrls: [siteUrl + "/new/"], redirects,
});

const affectedPaths = ["/hatha-yoga-cinisello-balsamo/", "/vinyasa-yoga-a-cinisello-balsamo/", "/yoga-cinisello-balsamo/"];
const destinationPaths = ["/corso-di-hatha-yoga-a-cinisello-balsamo/", "/vinyasa-yoga-cinisello-balsamo/", "/corso-yoga-cinisello-balsamo/"];

test("regression: all three reported WordPress redirects reconcile through actual crawler evidence", async (t) => {
  const routes = { "/sitemap.xml": moved("/sitemap_index.xml"), "/sitemap_index.xml": sitemap(destinationPaths) };
  affectedPaths.forEach((p, i) => { routes[p] = moved(destinationPaths[i]); routes[destinationPaths[i]] = html(); });
  const calls = fixtureNetwork(t, routes);
  const inventory = inventoryFor(affectedPaths, [
    { id: 100, postType: "elementor_library", status: "publish", url: siteUrl + "/?elementor_library=header" },
  ]);
  const result = await inspectElementorPublicCoverage({ siteUrl, authoritativeSeedUrls: coverageRelevantInventoryResources(inventory).map((row) => row.url) });
  assert.equal(result.publicCoverageReconciled, true);
  assert.equal(result.redirects.length, 3);
  assert.equal(result.coverageUrls.length, 3);
  assert.equal(result.completeSiteEnumeration, false);
  assert.equal(result.sharedWriteAllowed, false);
  assert.ok(calls.every((row) => !row.path.includes("elementor_library")));
  const reconciliation = reconcileAuthoritativeInventoryWithPublicCoverage(inventory, result);
  assert.equal(reconciliation.verified, true);
  assert.deepEqual(reconciliation.inventoryUrlsMissingFromPublicCoverage, []);
  assert.equal(reconciliation.inventoryRedirectsVerified.length, 3);
  assert.equal(reconciliation.totalUrls, result.coverageUrls.length);
  assert.equal(reconciliation.sharedWriteAllowed, false);
  // Prove the caller's current discovery method is compatible with the real registry.
  resetElementorCoverageRegistryForTests();
  const attestation = registerElementorCoverageAttestation({
    provenanceId: "redirect-regression", siteUrl, totalUrls: reconciliation.totalUrls, complete: true, verified: true,
    discoveryProof: {
      method: "recursive-html-crawl+sitemap+frontend-wordpress-inventory-reconciled",
      discoveredUrls: result.reconciliation.discoveredUrls, inspectedUrls: result.reconciliation.inspectedUrls,
      failedUrls: result.reconciliation.failedUrls, truncated: result.reconciliation.truncated,
      sitemapReconciled: result.reconciliation.sitemapReconciled, queueExhausted: result.reconciliation.queueDrained,
    },
  });
  assert.equal(attestation.totalUrls, 3);
});

test("unobserved path aliases are not invented", () => {
  const result = reconcileAuthoritativeInventoryWithPublicCoverage(inventoryFor(["/old/"]), provenCoverage([]));
  assert.equal(result.verified, false);
  assert.match(result.reason, /https:\/\/example.com\/old\//);
});

test("slash, www and query variants need an actual observation", () => {
  for (const candidate of [siteUrl + "/old", "https://www.example.com/old/", siteUrl + "/old/?x=1"]) {
    const result = reconcileAuthoritativeInventoryWithPublicCoverage(inventoryFor(["/old/"]), { ...provenCoverage([]), coverageUrls: [candidate] });
    assert.equal(result.verified, false, candidate);
  }
});

test("two separately inspected slash variants keep the exact candidate count", () => {
  const result = reconcileAuthoritativeInventoryWithPublicCoverage(inventoryFor(["/new/"]), { ...provenCoverage([]), coverageUrls: [siteUrl + "/new/", siteUrl + "/new"] });
  assert.equal(result.verified, true);
  assert.equal(result.totalUrls, 2);
});

test("two-step same-site redirects have a contiguous chain and preserve query", async (t) => {
  fixtureNetwork(t, { "/sitemap_index.xml": sitemap(["/new/"]), "/old/": moved("/middle/?a=1", 302), "/middle/?a=1": moved("../new/", 308), "/new/": html() });
  const result = await inspectElementorPublicCoverage({ siteUrl, sitemapUrl: siteUrl + "/sitemap_index.xml", authoritativeSeedUrls: [siteUrl + "/old/"] });
  assert.equal(result.publicCoverageReconciled, true);
  assert.equal(verifiedCoverageRedirects(result, siteUrl).get(siteUrl + "/old/").redirectCount, 2);
});

for (const [label, destination] of [
  ["external host", "https://other.example/new/"], ["HTTP downgrade", "http://example.com/new/"],
  ["alternate port", "https://example.com:8443/new/"], ["embedded credentials", "https://user:pass@example.com/new/"],
]) {
  test(`crawler rejects ${label} redirects before requesting destination`, async (t) => {
    const calls = fixtureNetwork(t, { "/sitemap_index.xml": sitemap(["/old/"]), "/old/": moved(destination) });
    const result = await inspectElementorPublicCoverage({ siteUrl, sitemapUrl: siteUrl + "/sitemap_index.xml" });
    assert.equal(result.publicCoverageReconciled, false);
    assert.equal(result.redirects.length, 0);
    assert.equal(calls.length, 2);
  });
}

test("redirect loop blocks coverage", async (t) => {
  fixtureNetwork(t, { "/sitemap_index.xml": sitemap(["/old/"]), "/old/": moved("/middle/"), "/middle/": moved("/old/") });
  const result = await inspectElementorPublicCoverage({ siteUrl, sitemapUrl: siteUrl + "/sitemap_index.xml" });
  assert.equal(result.publicCoverageReconciled, false);
  assert.match(result.failures[0].reason, /Ciclo redirect/);
});

test("redirect with a 404 destination stays blocked and names the failing URL", async (t) => {
  fixtureNetwork(t, { "/sitemap_index.xml": sitemap(["/new/"]), "/new/": html(), "/old/": moved("/missing/") });
  const result = await inspectElementorPublicCoverage({ siteUrl, sitemapUrl: siteUrl + "/sitemap_index.xml", authoritativeSeedUrls: [siteUrl + "/old/"] });
  const reconciliation = reconcileAuthoritativeInventoryWithPublicCoverage(inventoryFor(["/old/"]), result);
  assert.equal(reconciliation.verified, false);
  assert.match(reconciliation.reason, /HTTP 404/);
  assert.match(reconciliation.reason, /\/missing\//);
  assert.equal(result.redirects.length, 0);
});

test("redirect to PDF does not cover a WordPress HTML resource", async (t) => {
  fixtureNetwork(t, { "/sitemap_index.xml": sitemap(["/new/"]), "/new/": html(), "/old/": moved("/guide.pdf"), "/guide.pdf": { status: 200, headers: { "content-type": "application/pdf" }, body: "%PDF" } });
  const result = await inspectElementorPublicCoverage({ siteUrl, sitemapUrl: siteUrl + "/sitemap_index.xml", authoritativeSeedUrls: [siteUrl + "/old/"] });
  assert.equal(result.redirects.length, 0);
  assert.equal(reconcileAuthoritativeInventoryWithPublicCoverage(inventoryFor(["/old/"]), result).verified, false);
});

for (const [label, changes] of [
  ["client supplied source", { source: "browser" }], ["unverified", { verified: false }],
  ["non-read-only", { readOnly: false }], ["non-200", { finalStatus: 404 }],
  ["non-HTML", { contentType: "application/pdf" }], ["missing MIME", { contentType: "" }],
  ["stale", { inspectedAt: new Date(Date.now() - 31 * 60_000).toISOString() }],
  ["future", { inspectedAt: new Date(Date.now() + 60_000).toISOString() }],
  ["no chain", { chain: [] }], ["wrong status", { chain: [{ fromUrl: siteUrl + "/old/", toUrl: siteUrl + "/new/", status: 200 }] }],
  ["discontinuous chain", { chain: [{ fromUrl: siteUrl + "/other/", toUrl: siteUrl + "/new/", status: 301 }] }],
  ["external chain", { chain: [{ fromUrl: siteUrl + "/old/", toUrl: "https://other.example/", status: 301 }, { fromUrl: "https://other.example/", toUrl: siteUrl + "/new/", status: 301 }] }],
]) {
  test(`redirect evidence fails closed when ${label}`, () => {
    assert.equal(verifiedCoverageRedirects(provenCoverage([proof(changes)]), siteUrl).size, 0);
  });
}

test("an uninspected final destination is not accepted", () => {
  const result = provenCoverage(); result.coverageUrls = [siteUrl + "/unrelated/"];
  assert.equal(verifiedCoverageRedirects(result, siteUrl).size, 0);
});

test("conflicting redirect destinations for one source remain ambiguous", () => {
  const second = proof({ finalUrl: siteUrl + "/other/", chain: [{ fromUrl: siteUrl + "/old/", toUrl: siteUrl + "/other/", status: 301 }] });
  const result = provenCoverage([proof(), second]); result.coverageUrls.push(siteUrl + "/other/");
  assert.equal(verifiedCoverageRedirects(result, siteUrl).size, 0);
});

test("coverage false cannot be upgraded by redirect evidence", () => {
  const result = { ...provenCoverage(), publicCoverageReconciled: false };
  assert.equal(verifiedCoverageRedirects(result, siteUrl).size, 0);
  assert.equal(reconcileAuthoritativeInventoryWithPublicCoverage(inventoryFor(["/old/"]), result).verified, false);
});

test("an explicitly empty coverage never falls back to an uninspected sitemap", () => {
  const result = reconcileAuthoritativeInventoryWithPublicCoverage(inventoryFor(["/old/"]), { ...provenCoverage(), coverageUrls: [], sitemapUrls: [siteUrl + "/old/"] });
  assert.equal(result.verified, false);
});

test("invalid URL keys cannot disappear from a complete coverage claim", () => {
  const result = reconcileAuthoritativeInventoryWithPublicCoverage(inventoryFor(["/new/"]), { ...provenCoverage([]), coverageUrls: [siteUrl + "/new/", "https://other.example/"] });
  assert.equal(result.verified, false);
  assert.equal(result.status, "invalid-coverage-url");
});

test("same-site normalization preserves distinct resources", () => {
  assert.equal(coverageIdentityUrl(siteUrl + "/a/?b=2&a=1#x", siteUrl), siteUrl + "/a/?b=2&a=1");
  assert.equal(coverageIdentityUrl("https://user:pass@example.com/a", siteUrl), "");
});

for (const [label, patch] of [["failed", { failedUrls: 1 }], ["truncated", { truncated: true }], ["undrained", { queueExhausted: false }], ["count mismatch", { inspectedUrls: 2 }], ["unknown method", { method: "manual" }]]) {
  test(`registry keeps ${label} discovery blocked for new method`, () => {
    assert.throws(() => registerElementorCoverageAttestation({
      provenanceId: `bad-${label}`, siteUrl, totalUrls: 1, verified: true, complete: true,
      discoveryProof: { method: "recursive-html-crawl+sitemap+frontend-wordpress-inventory-reconciled", discoveredUrls: 1, inspectedUrls: 1, failedUrls: 0, truncated: false, sitemapReconciled: true, queueExhausted: true, ...patch },
    }));
  });
}

test("missing URL fields cannot become a root URL implicitly", () => {
  for (const value of [undefined, null, "", " ", {}, 0]) assert.equal(coverageIdentityUrl(value, siteUrl), "");
  assert.equal(verifiedCoverageRedirects(provenCoverage([proof({ requestedUrl: undefined })]), siteUrl).size, 0);
});

test("redirect limit is enforced before a fifth hop is requested", async (t) => {
  const routes = { "/sitemap_index.xml": sitemap(["/0/"]) };
  for (let i = 0; i < 6; i++) routes[`/${i}/`] = moved(`/${i + 1}/`);
  const calls = fixtureNetwork(t, routes);
  const result = await inspectElementorPublicCoverage({ siteUrl, sitemapUrl: siteUrl + "/sitemap_index.xml" });
  assert.equal(result.publicCoverageReconciled, false);
  assert.match(result.failures[0].reason, /Troppi redirect/);
  assert.ok(!calls.some((row) => row.path === "/5/"));
});
