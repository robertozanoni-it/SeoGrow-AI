import test from "node:test";
import assert from "node:assert/strict";
import { auditIssuesForDisplay, normalizeAuditSeverity } from "./auditEvidenceModel.js";

test("audit legacy issues receive type, severity and reproducible source", () => {
  const [issue] = auditIssuesForDisplay([
    { severity: "high", label: "Pagina impostata noindex", detail: "robots: noindex" },
  ], "https://example.com/a");
  assert.equal(issue.type, "indexability");
  assert.equal(issue.severity, "alta");
  assert.equal(issue.sourceUrl, "https://example.com/a");
  assert.equal(issue.dataSource, "Meta robots / Header HTTP X-Robots-Tag");
  assert.equal(issue.evidence.source, "Meta robots / Header HTTP X-Robots-Tag");
  assert.equal(issue.evidence.observed, "robots: noindex");
});

test("same type source and target is deduplicated and keeps strongest evidence", () => {
  const issues = auditIssuesForDisplay([
    { type: "broken-link", severity: "media", label: "Link rotto", sourceUrl: "https://example.com/a", targetUrl: "https://example.com/missing", detail: "temporaneo" },
    { type: "broken-link", severity: "alta", label: "Link rotto 404", sourceUrl: "https://example.com/a/", targetUrl: "https://example.com/missing/", detail: "HTTP 404 verificato" },
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "alta");
  assert.equal(issues[0].dataSource, "Controllo HTTP riproducibile");
  assert.equal(issues[0].auditIndex, 1);
});

test("severity classification is stable", () => {
  assert.equal(normalizeAuditSeverity("critical"), "alta");
  assert.equal(normalizeAuditSeverity("medium"), "media");
  assert.equal(normalizeAuditSeverity("low"), "bassa");
});
