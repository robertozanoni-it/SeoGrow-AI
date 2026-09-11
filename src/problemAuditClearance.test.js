import test from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedProblems } from "./problemsModel.js";

const h1Issue = {
  type: "h1",
  severity: "alta",
  label: "2 H1 rilevati",
  sourceUrl: "https://example.it/pagina/",
};

test("audit pagina più recente senza H1 chiude la vecchia rilevazione del crawl sito", () => {
  const result = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{
      analyzedAt: "2026-09-11T10:34:00Z",
      pagesChecked: 20,
      pages: [{ url: "https://example.it/pagina/", ok: true }],
      issues: [h1Issue],
    }],
    pageHistory: [{
      analyzedAt: "2026-09-11T10:55:00Z",
      url: "https://example.it/pagina/",
      issues: [],
      h1: 1,
    }],
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].problemState, "resolved");
  assert.equal(result.rows[0].resolvedByAudit, true);
  assert.equal(result.rows[0].observedAt, "2026-09-11T10:55:00Z");
  assert.ok(result.rows[0].evidence.some((item) => /non è più stato rilevato/i.test(item.detail)));
});

test("un audit pagina che rileva ancora H1 non chiude il problema", () => {
  const result = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{
      analyzedAt: "2026-09-11T10:34:00Z",
      pages: [{ url: "https://example.it/pagina/", ok: true }],
      issues: [h1Issue],
    }],
    pageHistory: [{
      analyzedAt: "2026-09-11T10:55:00Z",
      url: "https://example.it/pagina/",
      issues: [{ ...h1Issue, label: "0 H1 rilevati" }],
    }],
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].problemState, "open");
  assert.equal(result.rows[0].resolvedByAudit, false);
});

test("un crawl sito non chiude il problema se la URL non è stata realmente osservata", () => {
  const result = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [
      {
        analyzedAt: "2026-09-11T11:00:00Z",
        pagesChecked: 10,
        pages: [{ url: "https://example.it/altra/", ok: true }],
        issues: [],
      },
      {
        analyzedAt: "2026-09-11T10:34:00Z",
        pagesChecked: 20,
        pages: [{ url: "https://example.it/pagina/", ok: true }],
        issues: [h1Issue],
      },
    ],
  });

  assert.equal(result.rows.length, 0, "il modello considera solo l'ultimo crawl sito: una vecchia rilevazione senza altra fonte non deve restare attiva");
});

test("l'assenza in un audit pagina non chiude problemi che quel controllo non sa verificare", () => {
  const broken = {
    type: "broken-external-link",
    severity: "alta",
    label: "Link esterno non raggiungibile (404)",
    sourceUrl: "https://example.it/pagina/",
    targetUrl: "https://outside.example/missing",
  };
  const result = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{ analyzedAt: "2026-09-11T10:34:00Z", issues: [broken] }],
    pageHistory: [{ analyzedAt: "2026-09-11T10:55:00Z", url: "https://example.it/pagina/", issues: [] }],
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].problemState, "open");
  assert.equal(result.rows[0].resolvedByAudit, false);
});
