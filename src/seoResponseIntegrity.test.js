import assert from "node:assert/strict";
import test from "node:test";
import { tasksFromAnalysis } from "./platform.js";
import { normalizeSiteAnalysis, normalizeSiteAnalysisResponse } from "./seoResponseIntegrity.js";

test("429 e 5xx non restano tra i link interrotti confermati", () => {
  const result = normalizeSiteAnalysis({
    pagesChecked: 3,
    pages: [{ url: "https://example.com/" }],
    brokenLinks: [
      { url: "https://example.com/manca", status: 404, sources: ["https://example.com/"] },
      { url: "https://example.com/limitata", status: 429, temporary: true, sources: ["https://example.com/"] },
    ],
    brokenExternalLinks: [
      { url: "https://external.example/error", status: 503, temporary: true, sources: ["https://example.com/"] },
    ],
    failures: [{ url: "https://example.com/private", reason: "Esclusa da robots.txt" }],
    issues: [
      { type: "broken-link", severity: "alta", label: "Link interno interrotto (404)", sourceUrl: "https://example.com/", targetUrl: "https://example.com/manca", detail: "HTTP 404" },
      { type: "broken-link", severity: "media", label: "Link interno interrotto (429)", sourceUrl: "https://example.com/", targetUrl: "https://example.com/limitata", detail: "HTTP 429 · possibile errore temporaneo" },
      { type: "broken-external-link", severity: "media", label: "Link esterno non raggiungibile (503)", sourceUrl: "https://example.com/", targetUrl: "https://external.example/error", detail: "HTTP 503 · possibile errore temporaneo" },
    ],
  });

  assert.deepEqual(result.brokenLinks.map((item) => item.status), [404]);
  assert.equal(result.brokenExternalLinks.length, 0);
  assert.equal(result.linkVerificationWarnings.length, 2);
  assert.deepEqual(result.issues.map((item) => item.label), ["Link interno interrotto (404)"]);
  assert.equal(result.pagesFailed, 0);
  assert.equal(result.crawlExclusions.length, 1);
  assert.equal(result.legalScopeVersion, 4);
  assert.equal(result.scorePolicyVersion, 3);
});

test("canonical differente e noindex restano segnali da confermare e non penalizzano lo score", () => {
  const result = normalizeSiteAnalysis({
    score: 70,
    pagesChecked: 20,
    issues: [
      { type: "canonical", severity: "media", label: "Canonical differente dall’URL analizzato", url: "https://example.com/a", detail: "https://example.com/b" },
      { type: "indexability", severity: "media", label: "Pagina impostata noindex", url: "https://example.com/category/news", detail: "noindex" },
      { type: "broken-link", severity: "alta", label: "Link interno interrotto (404)", targetUrl: "https://example.com/manca", detail: "HTTP 404" },
    ],
    brokenLinks: [{ url: "https://example.com/manca", status: 404, sources: ["https://example.com/"] }],
  });

  assert.equal(result.issues.length, 1);
  assert.equal(result.reviewItems.length, 2);
  assert.ok(result.reviewItems.every((item) => item.diagnosisState === "needs-confirmation"));
  assert.equal(result.scoreSource, "seogrow-derived");
  assert.match(result.scoreMethodology, /non è un voto Google/i);
});

test("canonical rotta 404 rimane problema confermato", () => {
  const result = normalizeSiteAnalysis({
    pagesChecked: 2,
    issues: [
      { type: "canonical", severity: "alta", label: "Canonical rotta (404)", url: "https://example.com/a", detail: "Canonical HTTP 404" },
    ],
  });
  assert.equal(result.issues.length, 1);
  assert.equal(result.reviewItems.length, 0);
});

test("severity inglesi e italiane convergono prima di score e task derivati", () => {
  const italian = normalizeSiteAnalysis({ pagesChecked: 5, analyzedAt: "2026-09-10T10:00:00Z", issues: [{ type: "title", severity: "alta", label: "Title mancante" }] });
  const english = normalizeSiteAnalysis({ pagesChecked: 5, analyzedAt: "2026-09-10T10:00:00Z", issues: [{ type: "title", severity: "high", label: "Missing title" }] });
  const critical = normalizeSiteAnalysis({ pagesChecked: 5, analyzedAt: "2026-09-10T10:00:00Z", issues: [{ type: "title", severity: "critical", label: "Missing title" }] });
  assert.equal(english.score, italian.score);
  assert.equal(critical.score, italian.score);
  assert.equal(english.issues[0].severity, "alta");
  assert.equal(critical.issues[0].severity, "alta");
  const client = { id: 7, name: "QA", url: "https://example.com/" };
  assert.equal(tasksFromAnalysis(english, client)[0].priority, "Alta");
  assert.equal(tasksFromAnalysis(critical, client)[0].priority, "Alta");
});

test("sourceUrl diventa fallback della pagina del problema senza confondere il target di un link rotto", () => {
  const content = normalizeSiteAnalysis({
    pagesChecked: 1,
    issues: [{ type: "title", severity: "media", label: "Title corto", sourceUrl: "https://example.com/pagina/" }],
  });
  assert.equal(content.issues[0].url, "https://example.com/pagina/");

  const broken = normalizeSiteAnalysis({
    pagesChecked: 1,
    brokenLinks: [{ url: "https://example.com/manca", status: 404, sources: [] }],
    issues: [{ type: "broken-link", severity: "alta", label: "Link rotto", targetUrl: "https://example.com/manca", detail: "HTTP 404" }],
  });
  assert.equal(broken.issues[0].url, undefined);
});

test("fallimenti e link provenienti solo da pagine legali non contaminano lo score SEO", () => {
  const result = normalizeSiteAnalysis({
    pagesChecked: 2,
    pages: [
      { url: "https://example.com/privacy-policy/" },
      { url: "https://example.com/articolo/" },
    ],
    failures: [
      { url: "https://example.com/privacy-policy/", reason: "Timeout" },
    ],
    brokenLinks: [
      { url: "https://example.com/manca", status: 404, sources: ["https://example.com/privacy-policy/"] },
    ],
    issues: [
      { type: "broken-link", severity: "alta", label: "Link interno interrotto (404)", sourceUrl: "https://example.com/privacy-policy/", targetUrl: "https://example.com/manca", detail: "HTTP 404" },
    ],
  });
  assert.equal(result.pagesChecked, 1);
  assert.equal(result.pagesFailed, 0);
  assert.equal(result.failures.length, 0);
  assert.equal(result.brokenLinks.length, 0);
  assert.equal(result.issues.length, 0);
  assert.equal(result.score, 100);
});

test("la normalizzazione site-analysis è idempotente", () => {
  const first = normalizeSiteAnalysis({
    score: 58,
    pagesChecked: 5,
    failures: [],
    brokenLinks: [{ url: "https://example.com/manca", status: 404 }],
    issues: [
      { type: "broken-link", severity: "alta", label: "Link interno interrotto (404)", sourceUrl: "https://example.com/", targetUrl: "https://example.com/manca", detail: "HTTP 404" },
    ],
  });
  const snapshot = JSON.stringify(first);
  const second = normalizeSiteAnalysis(first);
  assert.equal(second, first);
  assert.equal(JSON.stringify(second), snapshot);
  assert.equal(second.rawScore, 58);
});

test("la risposta site-analysis viene normalizzata senza monkey-patch globale", async () => {
  const response = await normalizeSiteAnalysisResponse(new Response(JSON.stringify({
    score: 65,
    pagesChecked: 2,
    failures: [],
    brokenLinks: [],
    brokenExternalLinks: [],
    issues: [{ type: "canonical", severity: "media", label: "Canonical differente", detail: "Segnale da verificare" }],
  }), { status: 200, headers: { "content-type": "application/json" } }));
  const data = await response.json();
  assert.equal(data.scoreSource, "seogrow-derived");
  assert.equal(data.issues.length, 0);
  assert.equal(data.reviewItems.length, 1);
});

test("uno storico già normalizzato viene ricalcolato con scope legale e score correnti", () => {
  const result = normalizeSiteAnalysis({
    evidencePolicy: "confirmed-issues-only",
    scoreSource: "seogrow-derived",
    legalScopeVersion: 3,
    scorePolicyVersion: 1,
    score: 91,
    pagesChecked: 2,
    pages: [
      { url: "https://example.com/privacy-policy/" },
      { url: "https://example.com/articolo/" },
    ],
    legalPages: [],
    failures: [{ url: "https://example.com/privacy-policy/", reason: "Timeout" }],
    pagesFailed: 1,
    issues: [
      { type: "title", severity: "alta", label: "Title mancante", sourceUrl: "https://example.com/privacy-policy/" },
      { type: "broken-link", severity: "high", label: "Link interno interrotto (404)", sourceUrl: "https://example.com/articolo/", targetUrl: "https://example.com/privacy-policy/", detail: "HTTP 404" },
    ],
    reviewItems: [],
  });

  assert.equal(result.legalScopeVersion, 4);
  assert.equal(result.scorePolicyVersion, 3);
  assert.equal(result.pagesChecked, 1);
  assert.equal(result.pagesFailed, 0);
  assert.deepEqual(result.issues.map((item) => item.type), ["broken-link"]);
  assert.equal(result.issues[0].severity, "alta");
  assert.equal(result.issues[0].url, "https://example.com/articolo/");
  assert.equal(result.legalPages[0]?.url, "https://example.com/privacy-policy/");
  assert.equal(result.summary["broken-link"], 1);
  assert.equal(result.score, 95);
});
