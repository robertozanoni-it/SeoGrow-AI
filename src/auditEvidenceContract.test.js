import test from "node:test";
import assert from "node:assert/strict";
import { auditSeverity, enforceAuditEvidence } from "./auditEvidenceContract.js";

test("deduplica issue identiche ma conserva target link distinti", () => {
  const audit = enforceAuditEvidence({
    url: "https://example.it/",
    analyzedAt: "2026-09-17T09:00:00Z",
    pagesChecked: 3,
    issues: [
      { type: "title", label: "Title mancante", sourceUrl: "https://example.it/a" },
      { type: "title", label: "Title mancante", sourceUrl: "https://example.it/a/" },
      { type: "broken-external-link", label: "Link esterno non raggiungibile (404)", sourceUrl: "https://example.it/a", targetUrl: "https://one.test/missing", status: 404 },
      { type: "broken-external-link", label: "Link esterno non raggiungibile (404)", sourceUrl: "https://example.it/a", targetUrl: "https://two.test/missing", status: 404 },
    ],
  });
  assert.equal(audit.issues.filter((item) => item.type === "title").length, 1);
  assert.equal(audit.issues.filter((item) => item.type === "broken-external-link").length, 2);
  assert.ok(audit.issues.every((item) => item.evidence.reproducible));
  assert.equal(audit.issueEvidenceComplete, true);
});

test("esclude GDPR e promuove 404 del crawl a issue HTTP riproducibile", () => {
  const audit = enforceAuditEvidence({
    url: "https://example.it/",
    analyzedAt: "2026-09-17T09:00:00Z",
    pagesChecked: 2,
    issues: [
      { type: "h1", label: "0 H1 rilevati", sourceUrl: "https://example.it/privacy-policy/" },
    ],
    failures: [
      { url: "https://example.it/mancante", status: 404, reason: "HTTP 404" },
      { url: "https://example.it/cookie-policy/", status: 404, reason: "HTTP 404" },
    ],
  });
  assert.equal(audit.issues.length, 1);
  assert.equal(audit.issues[0].type, "http-404");
  assert.equal(audit.issues[0].severity, "alta");
  assert.equal(audit.issues[0].evidence.sourceType, "HTTP/crawl");
  assert.equal(audit.issues[0].evidence.observed, "HTTP 404");
});

test("inferisce tipo e severità canonica per audit pagina legacy", () => {
  const audit = enforceAuditEvidence({
    url: "https://example.it/pagina",
    fetchedAt: "2026-09-17T09:00:00Z",
    issues: [
      { severity: "HIGH", label: "Title mancante" },
      { severity: "low", label: "Nessun H2 rilevato" },
    ],
  });
  assert.deepEqual(audit.issues.map((item) => item.type), ["title", "h2"]);
  assert.deepEqual(audit.issues.map((item) => item.severity), ["alta", "bassa"]);
  assert.ok(audit.issues.every((item) => item.evidence.url === "https://example.it/pagina"));
  assert.ok(audit.issues.every((item) => item.evidence.observedAt === "2026-09-17T09:00:00Z"));
  assert.equal(auditSeverity("warning", { type: "canonical" }), "media");
});
