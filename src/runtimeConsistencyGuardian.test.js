import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeProjectRuntimeConsistency,
  analyzeProblemsRouteVisualConsistency,
} from "./guardian/runtimeConsistencyGuardian.js";

const source = (kind, label = kind) => ({ kind, label, at: "2026-09-19T10:00:00Z" });

test("Guardian rileva una Task Search/Opportunità finita in Problemi", () => {
  const rows = [{
    key: "search::url:https://example.it/",
    issueType: "search",
    title: "Ottimizza “yoga schiena”",
    sourceUrl: "https://example.it/",
    problemState: "open",
    stale: false,
    sources: [source("task", "Task SeoGrow")],
    targetUrls: [],
  }];
  const findings = analyzeProjectRuntimeConsistency({
    clientId: 1,
    rows,
    activeRows: rows,
    tasks: [{
      id: "op-1",
      sourceClientId: 1,
      kind: "search",
      origin: "opportunity",
      title: "Ottimizza “yoga schiena”",
    }],
  });
  assert.equal(findings.some((item) => item.code === "PROBLEM_DOMAIN_LEAK"), true);
  assert.equal(findings.some((item) => item.code === "OPPORTUNITY_TASK_VISIBLE_AS_PROBLEM"), true);
});

test("Guardian rileva una fixture G06 esposta come problema SEO", () => {
  const rows = [{
    key: "title::url:https://example.it/?page_id=8188",
    issueType: "title",
    title: "G06 lost response recovery",
    sourceUrl: "https://example.it/?page_id=8188",
    problemState: "open",
    stale: true,
    sources: [source("correction", "Correzione WordPress")],
    targetUrls: [],
  }];
  const findings = analyzeProjectRuntimeConsistency({
    clientId: 1,
    rows,
    activeRows: rows,
    corrections: [{
      id: "g06-live-8188",
      clientId: 1,
      issueType: "title",
      issueLabel: "G06 lost response recovery",
      sourceUrl: "https://example.it/?page_id=8188",
    }],
  });
  assert.equal(findings.some((item) => item.code === "TECHNICAL_FIXTURE_EXPOSED"), true);
});

test("Guardian rileva stale incoerente dopo audit pagina fresco e pulito", () => {
  const url = "https://example.it/pagina/";
  const rows = [{
    key: "h1::url:https://example.it/pagina/",
    issueType: "h1",
    title: "2 H1 rilevati",
    sourceUrl: url,
    problemState: "open",
    stale: true,
    sources: [source("task", "Task SeoGrow")],
    targetUrls: [],
  }];
  const findings = analyzeProjectRuntimeConsistency({
    clientId: 1,
    rows,
    activeRows: rows,
    pageHistory: [{
      analyzedAt: "2026-09-19T10:00:00Z",
      url,
      issues: [],
      reviewItems: [],
    }],
    now: Date.parse("2026-09-19T11:00:00Z"),
  });
  assert.equal(findings.some((item) => item.code === "STALE_AFTER_FRESH_CLEAN_AUDIT"), true);
});

test("Guardian non usa audit pagina per chiudere implicitamente problemi site-scope", () => {
  const url = "https://example.it/pagina/";
  const rows = [{
    key: "duplicate-title::url:https://example.it/pagina/",
    issueType: "duplicate-title",
    title: "Title duplicato",
    sourceUrl: url,
    problemState: "open",
    stale: true,
    sources: [source("task", "Task SeoGrow")],
    targetUrls: [],
  }];
  const findings = analyzeProjectRuntimeConsistency({
    clientId: 1,
    rows,
    activeRows: rows,
    pageHistory: [{
      analyzedAt: "2026-09-19T10:00:00Z",
      url,
      issues: [],
      reviewItems: [],
    }],
    now: Date.parse("2026-09-19T11:00:00Z"),
  });
  assert.equal(findings.some((item) => item.code === "STALE_AFTER_FRESH_CLEAN_AUDIT"), false);
});

test("Guardian rileva route Problemi senza active state rosso leggibile", () => {
  const findings = analyzeProblemsRouteVisualConsistency({
    currentPage: "Problemi",
    buttonExists: true,
    ariaCurrent: "page",
    backgroundColor: "rgb(233, 243, 255)",
    color: "rgb(255, 255, 255)",
  });
  assert.equal(findings.some((item) => item.code === "PROBLEMS_ACTIVE_CONTRAST_MISMATCH"), true);
});

test("Guardian accetta route Problemi con background rosso e testo bianco", () => {
  const findings = analyzeProblemsRouteVisualConsistency({
    currentPage: "Problemi",
    buttonExists: true,
    ariaCurrent: "page",
    backgroundColor: "rgb(217, 45, 32)",
    color: "rgb(255, 255, 255)",
  });
  assert.deepEqual(findings, []);
});

test("Guardian rileva un problema risolto ancora presente tra gli attivi", () => {
  const row = {
    key: "h1::url:https://example.it/",
    issueType: "h1",
    title: "H1",
    sourceUrl: "https://example.it/",
    problemState: "resolved",
    stale: false,
    sources: [source("audit")],
    targetUrls: [],
  };
  const findings = analyzeProjectRuntimeConsistency({
    clientId: 1,
    rows: [row],
    activeRows: [row],
  });
  assert.equal(findings.some((item) => item.code === "RESOLVED_PROBLEM_STILL_ACTIVE"), true);
});
