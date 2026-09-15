import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  latestOf,
  normalizeAnalysisHistory,
  analysisDiff,
} from "./modules/audit/data.js";
import {
  latestOf as legacyLatestOf,
  normalizeAnalysisHistory as legacyNormalizeAnalysisHistory,
  analysisDiff as legacyAnalysisDiff,
} from "./platform.js";

test("Audit owns analysis history and diff while platform compatibility stays identical", () => {
  assert.equal(latestOf, legacyLatestOf);
  assert.equal(normalizeAnalysisHistory, legacyNormalizeAnalysisHistory);
  assert.equal(analysisDiff, legacyAnalysisDiff);

  const audit = { analyzedAt: "2026-09-15T00:00:00.000Z" };
  assert.equal(latestOf([audit]), audit);
  assert.equal(latestOf(audit), audit);
  assert.equal(latestOf([]), null);
  assert.deepEqual(normalizeAnalysisHistory(null), []);
  assert.deepEqual(normalizeAnalysisHistory(audit), [audit]);
  assert.deepEqual(normalizeAnalysisHistory([audit]), [audit]);
});

test("analysisDiff closes a finding only after the affected page was rechecked", () => {
  const issue = {
    type: "title",
    label: "Title mancante",
    url: "https://example.com/pagina/",
  };
  const previous = { issues: [issue] };

  const notRechecked = analysisDiff(
    { issues: [], pages: [{ url: "https://example.com/", status: 200, titleLength: 30 }] },
    previous,
  );
  assert.deepEqual(notRechecked.resolvedIssues, []);

  const rechecked = analysisDiff(
    { issues: [], pages: [{ url: issue.url, status: 200, titleLength: 30 }] },
    previous,
  );
  assert.deepEqual(rechecked.resolvedIssues, [issue]);

  const reappeared = analysisDiff(
    { issues: [{ ...issue, detail: "Ancora presente" }], pages: [{ url: issue.url, status: 200, titleLength: 0 }] },
    previous,
  );
  assert.equal(reappeared.resolvedIssues.length, 0);
});

test("Audit history remains a pure data boundary and platform contains no owned implementation", async () => {
  const dataApi = await readFile(new URL("./modules/audit/data.js", import.meta.url), "utf8");
  const owner = await readFile(new URL("./modules/audit/history.js", import.meta.url), "utf8");
  const platform = await readFile(new URL("./platform.js", import.meta.url), "utf8");

  assert.match(dataApi, /from ["']\.\/history\.js["']/);
  assert.doesNotMatch(dataApi, /\.jsx|AuditWorkspace|Problems/);
  assert.match(owner, /export const latestOf/);
  assert.match(owner, /export function normalizeAnalysisHistory/);
  assert.match(owner, /export function analysisDiff/);
  assert.doesNotMatch(platform, /function normalizeAnalysisHistory/);
  assert.doesNotMatch(platform, /function analysisDiff/);
  assert.doesNotMatch(platform, /issueIdentity/);
  assert.match(platform, /from ["']\.\/modules\/audit\/history\.js["']/);
});
