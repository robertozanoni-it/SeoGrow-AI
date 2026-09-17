import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeIssues,
  normalizeIssue,
  pageObservationIssues,
  traceabilitySummary,
} from "../server/auditTraceabilityDecorator.js";
import { restoreBrokenLegalTargets } from "../server/auditLegalLinkSourcePolicy.js";

const page = "https://example.com/servizio/";
const at = "2026-09-17T09:00:00.000Z";

test("ogni issue normalizzata ha sorgente dati, evidenza, timestamp e severità canonica", () => {
  const issue = normalizeIssue({
    type: "h1",
    severity: "HIGH",
    label: "0 H1 rilevati",
    sourceUrl: page,
    detail: "Il markup attivo non contiene H1.",
  }, { analyzedAt: at }, { url: page, observedAt: at, h1: 0 });
  assert.equal(issue.severity, "alta");
  assert.equal(issue.sourceUrl, page);
  assert.equal(issue.reproducible, true);
  assert.equal(issue.observedAt, at);
  assert.equal(issue.dataSource.field, "h1");
  assert.equal(issue.dataSource.url, page);
  assert.equal(issue.evidence.length, 1);
  assert.equal(issue.evidence[0].observed, 0);
});

test("deduplica conserva una issue per identità e prevale la severità maggiore", () => {
  const issues = dedupeIssues([
    { type: "title", severity: "media", label: "Title corto", sourceUrl: page },
    { type: "title", severity: "alta", label: "Title mancante", sourceUrl: page },
  ], { analyzedAt: at }, { url: page, observedAt: at, title: "" });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "alta");
});

test("link rotti diversi sulla stessa pagina restano issue distinte e riproducibili", () => {
  const issues = dedupeIssues([
    { type: "broken-external-link", severity: "alta", label: "Link 404", sourceUrl: page, targetUrl: "https://a.example/manca", observedStatus: 404 },
    { type: "broken-external-link", severity: "alta", label: "Link 404", sourceUrl: page, targetUrl: "https://b.example/manca", observedStatus: 404 },
  ], { analyzedAt: at });
  assert.equal(issues.length, 2);
  assert.ok(issues.every((issue) => issue.dataSource.field === "link-http-status"));
  assert.deepEqual(issues.map((issue) => issue.targetUrl).toSorted(), ["https://a.example/manca", "https://b.example/manca"]);
});

test("pagine GDPR non producono problemi operativi", () => {
  const issues = dedupeIssues([
    { type: "title", severity: "alta", label: "Title mancante", sourceUrl: "https://example.com/privacy-policy/" },
    { type: "h1", severity: "alta", label: "0 H1 rilevati", sourceUrl: page },
  ], { analyzedAt: at });
  assert.deepEqual(issues.map((issue) => issue.type), ["h1"]);
});

test("un link rotto verso pagina GDPR resta visibile se la sorgente è SEO", () => {
  const payload = restoreBrokenLegalTargets({
    url: page,
    analyzedAt: at,
    issues: [],
    brokenLinks: [{
      url: "https://example.com/privacy-policy/",
      status: 404,
      temporary: false,
      sources: [page],
    }],
  });
  assert.equal(payload.issues.length, 1);
  assert.equal(payload.issues[0].sourceUrl, page);
  assert.equal(payload.issues[0].targetUrl, "https://example.com/privacy-policy/");
  assert.equal(payload.traceability.complete, true);
});

test("H2 noindex canonical e link HTTP derivano da osservazioni riproducibili", () => {
  const observation = {
    url: page,
    observedAt: at,
    status: 200,
    words: 620,
    h2: 0,
    noindex: true,
    robots: "noindex,follow",
    xRobotsTag: "",
    canonical: { url: "https://example.com/altra/", raw: "https://example.com/altra/", error: "" },
    linkResults: [
      { url: "https://example.com/rotto", status: 404, temporary: false },
      { url: "https://external.example/fallisce", status: 503, temporary: true },
    ],
  };
  const issues = dedupeIssues(pageObservationIssues(observation), { analyzedAt: at }, observation);
  assert.ok(issues.some((issue) => issue.type === "h2"));
  assert.ok(issues.some((issue) => issue.type === "indexability"));
  assert.ok(issues.some((issue) => issue.type === "canonical-different"));
  assert.ok(issues.some((issue) => issue.type === "broken-link" && issue.targetUrl.includes("rotto")));
  assert.ok(issues.some((issue) => issue.type === "broken-external-link"));
  assert.equal(traceabilitySummary(issues).complete, true);
});

test("gate traceability fallisce se una issue non ha una sorgente dati completa", () => {
  assert.equal(traceabilitySummary([{ reproducible: true, sourceUrl: page, evidence: [] }]).complete, false);
});
