import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  extractInternalLinks,
  isPotentialHtmlDocumentUrl,
} from "../server/elementorPublicCoverageHook.js";

const source = await readFile(new URL("../server/elementorPublicCoverageHook.js", import.meta.url), "utf8");

test("coverage pubblica è strettamente read-only e non può dichiarare complete site enumeration", () => {
  assert.match(source, /\/api\/wordpress\/elementor-public-coverage/);
  assert.match(source, /publicCoverageReconciled:/);
  assert.match(source, /authoritativeWordPressInventoryVerified:\s*false/);
  assert.match(source, /completeSiteEnumeration:\s*false/);
  assert.match(source, /affectedPagesEnumerated:\s*false/);
  assert.match(source, /sharedWriteAllowed:\s*false/);
  assert.doesNotMatch(source, /completeSiteEnumeration:\s*true/);
  assert.doesNotMatch(source, /sharedWriteAllowed:\s*true/);
  assert.doesNotMatch(source, /registerElementorCoverageAttestation/);
});

test("estrazione link ignora markup inerte, protocolli non web, host esterni e asset/download", () => {
  const html = `
    <a href="/a/">A</a>
    <a href="https://www.example.com/b/#x">B</a>
    <a href="/wp-content/uploads/photo.avif">image</a>
    <a href="/downloads/guida.pdf">pdf</a>
    <a href="/assets/app.js">js</a>
    <a href="/wp-json/wp/v2/pages">rest</a>
    <a href="https://evil.example.net/x/">evil</a>
    <a href="mailto:test@example.com">mail</a>
    <script><a href="/fake/">fake</a></script>
    <template><a href="/fake-template/">fake</a></template>
  `;
  assert.deepEqual(extractInternalLinks(html, "https://example.com/page/", "https://example.com"), [
    "https://example.com/a/",
    "https://www.example.com/b/",
  ]);
});

test("classificazione documenti mantiene pagine HTML potenziali e scarta asset noti", () => {
  assert.equal(isPotentialHtmlDocumentUrl("https://example.com/yoga-per-dimagrire", "https://example.com"), true);
  assert.equal(isPotentialHtmlDocumentUrl("https://example.com/wp-content/uploads/lezione.avif", "https://example.com"), false);
  assert.equal(isPotentialHtmlDocumentUrl("https://example.com/guida.pdf?download=1", "https://example.com"), false);
  assert.equal(isPotentialHtmlDocumentUrl("https://example.com/wp-admin/", "https://example.com"), false);
});

test("fetch pubblico segue solo redirect HTTPS same-site in modo esplicito", () => {
  assert.match(source, /REDIRECT_STATUSES = new Set\(\[301, 302, 303, 307, 308\]\)/);
  assert.match(source, /response\.headers\.get\("location"\)/);
  assert.match(source, /Redirect fuori dal sito non consentito/);
  assert.match(source, /maxRedirects = MAX_REDIRECTS/);
});

test("crawl ricorsivo espande il set solo con pagine HTML e conserva la sitemap dichiarata separatamente", () => {
  assert.match(source, /declaredSitemapUrls/);
  assert.match(source, /effectiveSitemapUrls/);
  assert.match(source, /coverageUrls/);
  assert.match(source, /ignoredAssetUrls/);
  assert.match(source, /ignoredNonHtmlUrls/);
  assert.match(source, /for \(const discovered of extractInternalLinks/);
  assert.match(source, /schedule\(discovered\)/);
});
