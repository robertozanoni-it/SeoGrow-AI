import test from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedProblems } from "./problemsModel.js";

const pageUrl = "https://yogabuenaonda.it/yoga-alimentazione-cinisello-balsamo/";

test("un review item canonical viene risolto da un audit pagina piu recente che non lo rileva", () => {
  const model = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{
      analyzedAt: "2026-09-14T10:19:54.000Z",
      url: "https://yogabuenaonda.it/",
      issues: [],
      reviewItems: [{
        type: "canonical-different",
        label: "Canonical differente dall’URL analizzato",
        sourceUrl: pageUrl,
        detail: "Canonical diversa o non rilevata.",
        severity: "low",
      }],
      pages: [{ url: pageUrl, ok: true }],
    }],
    pageHistory: [{
      analyzedAt: "2026-09-14T11:03:06.000Z",
      url: pageUrl,
      issues: [],
      reviewItems: [{
        type: "description-serp-width",
        label: "Meta description larga nello snippet",
        sourceUrl: pageUrl,
        severity: "low",
      }],
    }],
  });

  const canonical = model.rows.find((row) => row.issueType === "canonical-different");
  const description = model.rows.find((row) => row.issueType === "description-serp-width");

  assert.equal(canonical?.problemState, "resolved");
  assert.equal(canonical?.resolvedByAudit, true);
  assert.equal(description?.problemState, "needs_verification");
});

test("un review item ancora presente nel nuovo audit non viene risolto", () => {
  const review = {
    type: "canonical-different",
    label: "Canonical differente dall’URL analizzato",
    sourceUrl: pageUrl,
    severity: "low",
  };
  const model = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{ analyzedAt: "2026-09-14T10:19:54.000Z", issues: [], reviewItems: [review], pages: [{ url: pageUrl, ok: true }] }],
    pageHistory: [{ analyzedAt: "2026-09-14T11:03:06.000Z", url: pageUrl, issues: [], reviewItems: [review] }],
  });
  assert.equal(model.rows.find((row) => row.issueType === "canonical-different")?.problemState, "needs_verification");
});
