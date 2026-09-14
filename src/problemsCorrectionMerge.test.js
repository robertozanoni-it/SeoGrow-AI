import test from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedProblems } from "./problemsModel.js";

const source = "https://example.com/qa-resolution/";

test("a Da verificare correction without nested issue merges into the same audit finding", () => {
  const analyzedAt = "2026-09-14T13:00:00.000Z";
  const appliedAt = "2026-09-14T13:01:00.000Z";
  const siteHistory = [{
    url: "https://example.com/",
    analyzedAt,
    score: 80,
    issues: [{
      type: "duplicate-description",
      label: "Meta description duplicata",
      severity: "alta",
      sourceUrl: source,
      url: source,
    }],
  }];
  const corrections = [{
    id: "qa-pending-resolution",
    clientId: 1,
    issueType: "duplicate-description",
    issueLabel: "Meta description duplicata",
    sourceUrl: source,
    status: "Da verificare",
    appliedAt,
    fields: ["meta.rank_math_description"],
    before: { "meta.rank_math_description": "Precedente" },
    after: { "meta.rank_math_description": "Nuova" },
  }];
  const model = buildUnifiedProblems({ clientId: 1, siteHistory, pageHistory: [], tasks: [], corrections, now: Date.parse(appliedAt) + 1000 });
  const rows = model.rows.filter((row) => row.issueType === "duplicate-description" && row.sourceUrl === source);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].problemState, "needs_verification");
  assert.equal(rows[0].interventionState, "applied");
  assert.ok(rows[0].sources.some((sourceRow) => sourceRow.kind === "audit"));
  assert.ok(rows[0].sources.some((sourceRow) => sourceRow.kind === "correction"));
});

test("broken links on the same page remain isolated by target URL", () => {
  const one = "https://broken.example/one";
  const two = "https://broken.example/two";
  const siteHistory = [{
    url: "https://example.com/",
    analyzedAt: "2026-09-14T13:00:00.000Z",
    issues: [
      { type: "broken-external-link", label: "Link esterno 404", sourceUrl: source, targetUrl: one },
      { type: "broken-external-link", label: "Link esterno 404", sourceUrl: source, targetUrl: two },
    ],
  }];
  const model = buildUnifiedProblems({ clientId: 1, siteHistory, corrections: [], tasks: [], pageHistory: [] });
  const rows = model.rows.filter((row) => row.issueType === "broken-external-link");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.targetUrls[0]).toSorted(), [one, two].toSorted());
});
