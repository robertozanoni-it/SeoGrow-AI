import test from "node:test";
import assert from "node:assert/strict";
import { excludeLegalSeo, isConfiguredAuditExclusion } from "./modules/audit/legalPageScope.js";

test("configured audit exclusions match exact paths and descendants only", () => {
  const excluded = ["/thank-you/", "/private"];
  assert.equal(isConfiguredAuditExclusion("https://example.com/thank-you/", excluded), true);
  assert.equal(isConfiguredAuditExclusion("https://example.com/thank-you/step-2/", excluded), true);
  assert.equal(isConfiguredAuditExclusion("https://example.com/private/account/", excluded), true);
  assert.equal(isConfiguredAuditExclusion("https://example.com/blog/thank-you-guide/", excluded), false);
});

test("project exclusions remove pages, findings and broken links by source", () => {
  const result = excludeLegalSeo({
    url: "https://example.com/",
    score: 90,
    pages: [
      { url: "https://example.com/thank-you/" },
      { url: "https://example.com/service/" },
    ],
    issues: [
      { type: "title", sourceUrl: "https://example.com/thank-you/", label: "Title" },
      { type: "h1", sourceUrl: "https://example.com/service/", label: "H1" },
    ],
    reviewItems: [{ type: "canonical", sourceUrl: "https://example.com/thank-you/", label: "Canonical" }],
    failures: [{ sourceUrl: "https://example.com/thank-you/", error: "timeout" }],
    brokenLinks: [
      { url: "https://example.com/missing/", sources: ["https://example.com/thank-you/"] },
      { url: "https://example.com/other/", sources: ["https://example.com/service/"] },
    ],
    brokenExternalLinks: [],
  }, { excludedPaths: ["/thank-you/"] });

  assert.deepEqual(result.pages.map((item) => item.url), ["https://example.com/service/"]);
  assert.deepEqual(result.issues.map((item) => item.type), ["h1"]);
  assert.equal(result.reviewItems.length, 0);
  assert.equal(result.failures.length, 0);
  assert.deepEqual(result.brokenLinks.map((item) => item.url), ["https://example.com/other/"]);
  assert.equal(result.pagesChecked, 1);
  assert.deepEqual(result.auditExcludedPaths, ["/thank-you/"]);
});

test("an explicitly excluded audited page is non-operational and has no SEO score", () => {
  const result = excludeLegalSeo({
    url: "https://example.com/thank-you/",
    score: 75,
    pages: [{ url: "https://example.com/thank-you/" }],
    issues: [{ type: "title", sourceUrl: "https://example.com/thank-you/" }],
  }, { excludedPaths: ["/thank-you/"] });
  assert.equal(result.projectExcluded, true);
  assert.equal(result.score, null);
  assert.equal(result.issues.length, 0);
  assert.equal(result.pages.length, 0);
});
