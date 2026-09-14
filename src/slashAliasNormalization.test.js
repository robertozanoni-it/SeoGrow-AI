import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSiteAnalysis } from "./seoResponseIntegrity.js";

const base = (issues) => ({
  url: "https://example.com/",
  pagesChecked: 2,
  pages: [
    { url: "https://example.com/pagina", ok: true },
    { url: "https://example.com/pagina/", ok: true },
  ],
  issues,
  reviewItems: [],
  failures: [],
  brokenLinks: [],
  brokenExternalLinks: [],
});

test("canonical che differisce solo per slash finale non riapre un finding", () => {
  const result = normalizeSiteAnalysis(base([{
    type: "canonical-different",
    severity: "media",
    label: "Canonical differente dall’URL analizzato",
    url: "https://example.com/pagina",
    sourceUrl: "https://example.com/pagina",
    detail: "https://example.com/pagina/",
  }]));
  assert.equal(result.issues.length, 0);
  assert.equal(result.reviewItems.length, 0);
});

test("alias slash WordPress già provato non viene riproposto come problema", () => {
  const result = normalizeSiteAnalysis(base([{
    type: "url-alias",
    severity: "bassa",
    label: "Due URL dello stesso contenuto WordPress",
    url: "https://example.com/pagina",
    sourceUrl: "https://example.com/pagina",
    canonicalUrl: "https://example.com/pagina/",
    wordpressDocumentId: 123,
    detail: "Le due URL hanno lo stesso ID WordPress e una sola canonical coerente.",
  }]));
  assert.equal(result.issues.length, 0);
  assert.equal(result.reviewItems.length, 0);
});

test("una canonical verso una risorsa realmente diversa resta da confermare", () => {
  const result = normalizeSiteAnalysis(base([{
    type: "canonical-different",
    severity: "media",
    label: "Canonical differente dall’URL analizzato",
    url: "https://example.com/pagina",
    sourceUrl: "https://example.com/pagina",
    detail: "https://example.com/altra-pagina/",
  }]));
  assert.equal(result.issues.length, 0);
  assert.equal(result.reviewItems.length, 1);
  assert.equal(result.reviewItems[0].type, "canonical-different");
});

test("un alias non dimostrato come semplice variante slash resta da confermare", () => {
  const result = normalizeSiteAnalysis(base([{
    type: "url-alias",
    severity: "bassa",
    label: "Due URL dello stesso contenuto WordPress",
    url: "https://example.com/pagina",
    sourceUrl: "https://example.com/pagina",
    canonicalUrl: "https://example.com/altra-pagina/",
    wordpressDocumentId: 123,
  }]));
  assert.equal(result.reviewItems.length, 1);
  assert.equal(result.reviewItems[0].type, "url-alias");
});